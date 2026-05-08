"""LangGraph stub service.

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
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime

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

    async def astream_events(self, session_id: str) -> AsyncIterator[AnyEvent]:
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
