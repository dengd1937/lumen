"""LangGraph stub service.

Per ADR-0001 D6 + plan T9: M1.0 ships a fixed-event-sequence stub
instead of the real LangGraph runtime so the SSE protocol skeleton
can be validated end-to-end without an LLM dependency. M1.A replaces
this with the real LangGraph fork via the same `astream_events`
interface.

Stub emits 4 business events with `asyncio.sleep(0.1)` between each
so tests can simulate cancellation mid-flight, and supports
controlled failure injection (`fail_at`) and slow-mode (`slow_seconds`)
for lifecycle tests.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from ulid import ULID

from app.models.events import (
    AnyEvent,
    NodeCompletedEvent,
    NodeProgressEvent,
    NodeStartedEvent,
    PlanCreatedEvent,
    PlanNode,
    SourceRef,
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _new_event_id() -> str:
    return str(ULID())


class LangGraphStub:
    """Stand-in for the real LangGraph executor.

    Construction parameters:
      * `fail_at` — index in [0, 4) at which to raise `RuntimeError`
        instead of yielding (Codex H1 lifecycle path).
      * `slow_seconds` — override the inter-event delay (default 0.1s).
        Used by the cancellation test to keep the producer alive long
        enough to cancel mid-stream.
    """

    def __init__(
        self,
        *,
        fail_at: int | None = None,
        slow_seconds: float = 0.1,
    ) -> None:
        self._fail_at = fail_at
        self._delay = slow_seconds

    async def astream_events(self, session_id: str) -> AsyncIterator[AnyEvent]:
        events = self._build_events(session_id)
        for i, ev in enumerate(events):
            if self._fail_at == i:
                raise RuntimeError(f"stub failure at event index {i}")
            yield ev
            await asyncio.sleep(self._delay)

    @staticmethod
    def _build_events(session_id: str) -> list[AnyEvent]:
        ts = _now_iso()
        return [
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
