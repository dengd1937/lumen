"""LangGraph stub + real service.

Per ADR-0001 D6 + plan T9 / T15: M1.0 ships a fixed-event-sequence
stub instead of the real LangGraph runtime so the SSE protocol
skeleton can be validated end-to-end without an LLM dependency. M1.A
replaces this with the real LangGraph fork via the same
`astream_events` interface.

Default sequence: 4 business events (plan_created → node_started →
node_progress → node_completed). With `emit_full_cycle=True`, two more
events (report_chunk → done) are appended so SSE-4 e2e specs see a
terminal `done` event. With `inject_error=True`, an `error` event is
appended (used by the SSE-3 e2e spec).

Construction toggles:
  * fail_at         — index at which to raise RuntimeError.
  * slow_seconds    — inter-event delay (default 0.1s).
  * emit_full_cycle — append report_chunk + done at end.
  * inject_error    — append an error event at end (T15 SSE-3).

T4 additions (ADR-0003 D11 + NN1):
  * LangGraphStub.astream_events extended with query + inject_directive
    kwargs (NN1 interface propagation; stub ignores both, stays simple).
  * LangGraphService skeleton: constructor + from_settings factory +
    empty astream_events. T5 fills in the three-node graph + routing.

T5 additions (ADR-0003 D10.1):
  * LangGraphService._build_graph: assembles planner→researcher→writer
    StateGraph, compiles it, and stores as self._graph.
  * LangGraphService.astream_events: drives _graph.astream_events and
    routes each raw StreamEvent to a lumen AnyEvent via route_stream_event.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

from app.core.utils import new_event_id as _new_event_id
from app.core.utils import now_iso as _now_iso
from app.models.events import (
    AnyEvent,
    DoneEvent,
    ErrorEvent,
    NodeCompletedEvent,
    NodeProgressEvent,
    NodeStartedEvent,
    PlanCreatedEvent,
    PlanNode,
    ReportChunkEvent,
    SourceRef,
)
from app.services.graph.planner import planner_node_factory
from app.services.graph.researcher import researcher_node_factory
from app.services.graph.routing import route_stream_event
from app.services.graph.state import GraphState
from app.services.graph.writer import writer_node_factory
from app.services.inject_directive import InjectDirective

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.runnables import RunnableConfig
    from langgraph.graph.state import CompiledStateGraph

    from app.core.config import Settings


class LangGraphStub:
    """Stand-in for the real LangGraph executor.

    Construction parameters:
      * `fail_at` — index at which to raise RuntimeError mid-stream
        (Codex H1 lifecycle path).
      * `slow_seconds` — override the inter-event delay (default 0.1s).
      * `emit_full_cycle` — when True, append report_chunk + done at
        end so SSE consumers see the terminal `done` event (T15 SSE-4).
        Default False so existing T9/T10 tests keep their 4-event
        invariant.
      * `inject_error` — append an `error` event at end of the
        sequence (T15 SSE-3 — surfaces error UI in the frontend).
        Reads `LUMEN_STUB_INJECT_ERROR` env var as a fallback so e2e
        runners can flip the toggle without rewiring the manager.
    """

    def __init__(
        self,
        *,
        fail_at: int | None = None,
        slow_seconds: float = 0.1,
        emit_full_cycle: bool = False,
        inject_error: bool | None = None,
    ) -> None:
        self._fail_at = fail_at
        self._delay = slow_seconds
        self._emit_full_cycle = emit_full_cycle
        # Env fallback: agree with the runbook contract so a single
        # uvicorn invocation in the e2e webServer can toggle this.
        env_flag = os.environ.get("LUMEN_STUB_INJECT_ERROR") == "1"
        self._inject_error = env_flag if inject_error is None else inject_error

    async def astream_events(
        self,
        session_id: str,
        query: str,  # NN1 -- required, no default (strict parity with LangGraphProtocol)
        *,
        inject_directive: InjectDirective | None = None,
    ) -> AsyncGenerator[AnyEvent, None]:
        """Stream fixed events (stub).

        NN1: accepts query and inject_directive to match LangGraphProtocol
        signature; both are ignored -- stub uses a fixed event sequence.
        """
        events = self._build_events(session_id)
        for i, ev in enumerate(events):
            if self._fail_at == i:
                raise RuntimeError(f"stub failure at event index {i}")
            yield ev
            await asyncio.sleep(self._delay)

    def _build_events(self, session_id: str) -> list[AnyEvent]:
        ts = _now_iso()
        events: list[AnyEvent] = [
            PlanCreatedEvent(
                event_id=_new_event_id(),
                session_id=session_id,
                timestamp=ts,
                type="plan_created",
                nodes=[
                    PlanNode(id="web-1", title="公开 Web 检索", track="web"),
                    PlanNode(id="kb-1", title="私有 KB 检索", track="kb"),
                ],
            ),
            NodeStartedEvent(
                event_id=_new_event_id(),
                session_id=session_id,
                timestamp=ts,
                type="node_started",
                node_id="web-1",
                track="web",
            ),
            NodeProgressEvent(
                event_id=_new_event_id(),
                session_id=session_id,
                timestamp=ts,
                type="node_progress",
                node_id="web-1",
                message="已检索 5/12 篇",
            ),
            NodeCompletedEvent(
                event_id=_new_event_id(),
                session_id=session_id,
                timestamp=ts,
                type="node_completed",
                node_id="web-1",
                sources=[SourceRef(id="src-stub-1", title="Stub source")],
            ),
        ]
        if self._emit_full_cycle:
            events.extend(
                [
                    ReportChunkEvent(
                        event_id=_new_event_id(),
                        session_id=session_id,
                        timestamp=ts,
                        type="report_chunk",
                        content="## 核心结论\n\nStub-rendered report content for M1.0 SSE skeleton.",
                    ),
                    DoneEvent(
                        event_id=_new_event_id(),
                        session_id=session_id,
                        timestamp=ts,
                        type="done",
                        report_id="rpt-stub-001",
                    ),
                ],
            )
        if self._inject_error:
            events.append(
                ErrorEvent(
                    event_id=_new_event_id(),
                    session_id=session_id,
                    timestamp=ts,
                    type="error",
                    message="Stub-injected error for SSE-3 verification",
                ),
            )
        return events


# ---------------------------------------------------------------------------
# T4 -- LangGraphService skeleton (ADR-0003 D11 + NN1)
# ---------------------------------------------------------------------------


def init_chat_model(**kwargs: str) -> BaseChatModel:
    """Thin wrapper around langchain.chat_models.init_chat_model for monkeypatching in tests."""
    from langchain.chat_models import init_chat_model as _init

    result: BaseChatModel = _init(**kwargs)  # type: ignore[call-overload]
    return result


class LangGraphService:
    """T5 -- Real LangGraph service with three-node graph + routing.

    M1.A implementation: builds a StateGraph with three nodes
    (planner → researcher → writer) and injects a BaseChatModel
    instance via the init_chat_model factory.

    T5: constructor builds graph immediately (D11 singleton semantics);
        astream_events drives graph.astream_events and routes raw
        StreamEvents to lumen AnyEvents via route_stream_event.
    T6 adds ErrorEvent path + asyncio.timeout.
    """

    def __init__(self, *, model: BaseChatModel, db_path: str) -> None:
        self._model = model
        self._db_path = db_path
        self._graph: CompiledStateGraph[GraphState] = self._build_graph()

    def _build_graph(self) -> CompiledStateGraph[GraphState]:
        """Assemble and compile the three-node StateGraph."""
        from langgraph.graph import END, StateGraph

        g: StateGraph[GraphState] = StateGraph(GraphState)
        g.add_node("planner", planner_node_factory(self._model))  # type: ignore[call-overload]
        g.add_node("researcher", researcher_node_factory(self._model))  # type: ignore[call-overload]
        g.add_node("writer", writer_node_factory(self._model))  # type: ignore[call-overload]
        g.set_entry_point("planner")
        g.add_edge("planner", "researcher")
        g.add_edge("researcher", "writer")
        g.add_edge("writer", END)
        return g.compile()

    @classmethod
    def from_settings(cls, settings: Settings) -> LangGraphService:
        """Factory: construct init_chat_model + LangGraphService from Settings.

        This is the only call site for settings.DASHSCOPE_API_KEY.get_secret_value(),
        keeping SecretStr unwrapping in one place (security-reviewer requirement).
        """
        model = init_chat_model(
            model=settings.LLM_MODEL,
            model_provider="openai",  # DashScope OpenAI-compatible endpoint
            base_url=settings.DASHSCOPE_BASE_URL,
            api_key=settings.DASHSCOPE_API_KEY.get_secret_value(),
        )
        return cls(model=model, db_path=settings.LUMEN_DB_PATH)

    async def astream_events(
        self,
        session_id: str,
        query: str,
        *,
        inject_directive: InjectDirective | None = None,
    ) -> AsyncGenerator[AnyEvent, None]:
        """Drive the three-node graph and route StreamEvents to lumen AnyEvents.

        T6 (ADR-0003 D12): wraps the graph loop in try/except so any node
        exception (RuntimeError, TimeoutError, etc.) is converted to an
        ErrorEvent and the generator returns cleanly without raising.

        asyncio.CancelledError inherits BaseException and is NOT caught by
        ``except Exception`` — it propagates naturally so the producer task
        can be cancelled externally (D8.4 cancellation path).

        inject_directive is accepted and forwarded; T11/T12 will implement
        InjectCloseAfterDirective and InjectErrorDirective behaviour.
        T6 phase: signature accepted, downstream behaviour is no-op.
        """
        config: RunnableConfig = {"configurable": {"thread_id": session_id}}
        initial_state: GraphState = {
            "query": query,
            "session_id": session_id,
            "plan_nodes": [],
            "report_chunks": [],
        }
        emitted_done = False
        try:
            async for raw in self._graph.astream_events(initial_state, config=config, version="v2"):
                ev = route_stream_event(dict(raw), session_id=session_id)
                if ev is not None:
                    if ev.type == "done":
                        emitted_done = True
                    yield ev
        except Exception as e:
            # Covers RuntimeError, TimeoutError (asyncio.TimeoutError is a
            # subclass of TimeoutError since Python 3.11, which is a subclass
            # of Exception).  CancelledError is a BaseException subclass and
            # is intentionally NOT caught here — let it propagate.
            yield ErrorEvent(
                event_id=_new_event_id(),
                session_id=session_id,
                timestamp=_now_iso(),
                type="error",
                message=f"LangGraph error: {type(e).__name__}",
            )
            return  # generator exits cleanly; SessionManager senses ev.type=="error"

        if not emitted_done:
            # Fallback: graph terminal state routing miss → explicit DoneEvent
            yield DoneEvent(
                event_id=_new_event_id(),
                session_id=session_id,
                timestamp=_now_iso(),
                type="done",
                report_id=f"rpt-{session_id[:8]}",
            )
