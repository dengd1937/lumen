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
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from ulid import ULID

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
from app.services.inject_directive import InjectDirective

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from app.core.config import Settings


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _new_event_id() -> str:
    return str(ULID())


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
    """T4 -- Real LangGraph service skeleton.

    M1.A implementation: builds a StateGraph with three nodes
    (planner -> researcher -> writer) and injects a BaseChatModel
    instance via the init_chat_model factory.

    T4 phase: constructor + from_settings + empty astream_events skeleton.
    T5 fills in the three-node graph + routing layer.
    T6 adds ErrorEvent path + asyncio.timeout.
    """

    def __init__(self, *, model: BaseChatModel, db_path: str) -> None:
        self._model = model
        self._db_path = db_path
        # _graph is built by _build_graph() when T5 implements the real nodes.
        self._graph: object | None = None

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
        """T4 skeleton: yields nothing. T5 implements the three-node graph + StreamEvent routing."""
        # The unreachable yield makes this function an async generator as required by the protocol.
        # mypy: the yield is intentionally unreachable; return early in T4.
        return
        yield  # pragma: no cover
