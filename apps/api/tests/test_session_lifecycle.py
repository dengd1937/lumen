"""T9 — LangGraph stub + SessionManager + POST /research/start tests.

Per ADR-0002 D8.4 + Codex H1: session producer lock with full
lifecycle (created → running → completed | failed | cancelled),
done_callback cleanup, and restart-after-terminal semantics.

Stub LangGraph emits 4 fixed events with asyncio.sleep(0.1) interval
so the test can simulate cancellation between events without race.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from typing import cast

import aiosqlite
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from app.db.sqlite import (
    init_db,
)
from app.models.events import (
    NodeCompletedEvent,
    NodeProgressEvent,
    NodeStartedEvent,
    PlanCreatedEvent,
)
from app.services.langgraph_service import LangGraphStub
from app.services.session_manager import (
    SessionAlreadyRunningError,
    SessionManager,
)


@pytest_asyncio.fixture
async def initialized_db(tmp_path: Path) -> AsyncIterator[Path]:
    db_path = tmp_path / "test_t9.db"
    async with aiosqlite.connect(str(db_path)) as conn:
        await init_db(conn)
    yield db_path


# ---------------------------------------------------------------------------
# RED — LangGraph stub event sequence
# ---------------------------------------------------------------------------


async def test_langgraph_stub_emits_4_events_in_order() -> None:
    stub = LangGraphStub()
    events = [ev async for ev in stub.astream_events("test-session")]
    assert len(events) == 4
    assert isinstance(events[0], PlanCreatedEvent)
    assert isinstance(events[1], NodeStartedEvent)
    assert isinstance(events[2], NodeProgressEvent)
    assert isinstance(events[3], NodeCompletedEvent)
    # All events carry the session_id (so audit_log queries by session work).
    assert all(ev.session_id == "test-session" for ev in events)


async def test_langgraph_stub_event_ids_are_unique() -> None:
    """ULID-style event_id stability: each event in the sequence has a
    unique id so audit_log UNIQUE constraint isn't violated."""
    stub = LangGraphStub()
    events = [ev async for ev in stub.astream_events("test-session")]
    event_ids = [ev.event_id for ev in events]
    assert len(set(event_ids)) == 4


async def test_langgraph_stub_failing_at_index_raises() -> None:
    """Stub supports controlled failure injection for T9 lifecycle tests."""
    stub = LangGraphStub(fail_at=2)
    collected = []
    with pytest.raises(RuntimeError, match="stub failure"):
        async for ev in stub.astream_events("test-session"):
            collected.append(ev)
    # 2 events emitted before failure injection at index 2.
    assert len(collected) == 2


# ---------------------------------------------------------------------------
# RED — SessionManager lifecycle
# ---------------------------------------------------------------------------


async def test_session_manager_start_creates_running_session(
    initialized_db: Path,
) -> None:
    """RED 1 — start_session creates a row and marks it running."""
    sm = SessionManager(db_path=str(initialized_db), langgraph=LangGraphStub())
    await sm.start_session("sess-1")

    # Status should be `running` immediately after start_session returns.
    async with aiosqlite.connect(str(initialized_db)) as c:
        cursor = await c.execute(
            "SELECT status FROM lumen_research_sessions WHERE id = ?", ("sess-1",)
        )
        row = await cursor.fetchone()
    assert row is not None
    assert row[0] == "running"
    assert "sess-1" in sm.active_runs

    # Drain the task to a clean terminal state for teardown.
    await asyncio.wait_for(sm.active_runs["sess-1"], timeout=2.0)
    await asyncio.sleep(0.05)  # let the event loop process the done_callback before asserting


async def test_session_manager_completes_terminal_status(
    initialized_db: Path,
) -> None:
    """After the producer task finishes naturally, status → completed
    and active_runs is cleaned up."""
    sm = SessionManager(db_path=str(initialized_db), langgraph=LangGraphStub())
    await sm.start_session("sess-complete")
    task = sm.active_runs["sess-complete"]
    await asyncio.wait_for(task, timeout=2.0)
    # Yield to the event loop so the done_callback finishes evicting active_runs.
    await asyncio.sleep(0.1)

    assert "sess-complete" not in sm.active_runs
    async with aiosqlite.connect(str(initialized_db)) as c:
        cursor = await c.execute(
            "SELECT status FROM lumen_research_sessions WHERE id = ?",
            ("sess-complete",),
        )
        row = await cursor.fetchone()
    assert row is not None and row[0] == "completed"


async def test_session_manager_duplicate_session_raises_already_running(
    initialized_db: Path,
) -> None:
    """RED 2 — second start_session with an active session raises
    SessionAlreadyRunningError; router maps to 409."""
    sm = SessionManager(db_path=str(initialized_db), langgraph=LangGraphStub())
    await sm.start_session("sess-dup")
    with pytest.raises(SessionAlreadyRunningError):
        await sm.start_session("sess-dup")
    # Drain task for clean teardown.
    await asyncio.wait_for(sm.active_runs["sess-dup"], timeout=2.0)
    await asyncio.sleep(0.05)


async def test_session_manager_task_exception_marks_failed(
    initialized_db: Path,
) -> None:
    """Codex H1 / RED 4: producer task raises → status auto-updates to
    `failed` and active_runs is cleaned up."""
    sm = SessionManager(db_path=str(initialized_db), langgraph=LangGraphStub(fail_at=1))
    await sm.start_session("sess-fail")
    task = sm.active_runs["sess-fail"]
    with pytest.raises(RuntimeError):
        await asyncio.wait_for(task, timeout=2.0)
    await asyncio.sleep(0.1)

    assert "sess-fail" not in sm.active_runs
    async with aiosqlite.connect(str(initialized_db)) as c:
        cursor = await c.execute(
            "SELECT status FROM lumen_research_sessions WHERE id = ?",
            ("sess-fail",),
        )
        row = await cursor.fetchone()
    assert row is not None and row[0] == "failed"


async def test_session_manager_restart_after_terminal_is_rejected(
    initialized_db: Path,
) -> None:
    """Code-reviewer T9 HIGH (revised RED 5): the state machine has no
    back-edge. Restarting a terminal session_id would emit ghost
    events on T10 SSE replay (the previous run's audit_log entries
    would be replayed alongside the new run). Same-id restart MUST
    raise SessionAlreadyRunningError; clients use a fresh session_id."""
    sm = SessionManager(db_path=str(initialized_db), langgraph=LangGraphStub())
    await sm.start_session("sess-noredo")
    await asyncio.wait_for(sm.active_runs["sess-noredo"], timeout=2.0)
    await asyncio.sleep(0.1)
    # Confirm session is in completed state.
    async with aiosqlite.connect(str(initialized_db)) as c:
        cursor = await c.execute(
            "SELECT status FROM lumen_research_sessions WHERE id = ?",
            ("sess-noredo",),
        )
        row = await cursor.fetchone()
    assert row is not None and row[0] == "completed"

    # Same id again — must raise (no back-edge in the state machine).
    with pytest.raises(SessionAlreadyRunningError):
        await sm.start_session("sess-noredo")


async def test_session_manager_cancel_marks_cancelled_and_cleans_up(
    initialized_db: Path,
) -> None:
    """Codex H1 / RED 6: cancelling the producer task → status `cancelled`
    + active_runs cleaned up. Simulates client disconnect."""
    # Stub with infinite delay so we can cancel mid-flight.
    sm = SessionManager(db_path=str(initialized_db), langgraph=LangGraphStub(slow_seconds=10.0))
    await sm.start_session("sess-cancel")
    task = sm.active_runs["sess-cancel"]
    await asyncio.sleep(0.1)  # ensure task is mid-event
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.sleep(0.1)  # let done_callback async cleanup run

    assert "sess-cancel" not in sm.active_runs
    async with aiosqlite.connect(str(initialized_db)) as c:
        cursor = await c.execute(
            "SELECT status FROM lumen_research_sessions WHERE id = ?",
            ("sess-cancel",),
        )
        row = await cursor.fetchone()
    assert row is not None and row[0] == "cancelled"


async def test_session_manager_persists_audit_log_for_each_event(
    initialized_db: Path,
) -> None:
    """Producer task writes each event to audit_log (per ADR-0002 D8.3
    single-source protocol). T10 stream_session reads from this table."""
    sm = SessionManager(db_path=str(initialized_db), langgraph=LangGraphStub())
    await sm.start_session("sess-audit")
    await asyncio.wait_for(sm.active_runs["sess-audit"], timeout=2.0)
    await asyncio.sleep(0.1)

    async with aiosqlite.connect(str(initialized_db)) as c:
        cursor = await c.execute(
            "SELECT COUNT(*) FROM lumen_audit_log WHERE session_id = ?",
            ("sess-audit",),
        )
        row = await cursor.fetchone()
    assert row is not None
    assert row[0] == 4  # 4 events from the stub


# ---------------------------------------------------------------------------
# RED — POST /api/research/start router integration
# ---------------------------------------------------------------------------


def test_post_start_returns_201_and_session_id(env_settings: Path) -> None:
    """RED 1 — successful start returns 201 with session_id echo."""
    from main import app

    with TestClient(app) as client:
        r = client.post("/api/research/start", json={"session_id": "router-1"})
    assert r.status_code == 201
    assert r.json()["session_id"] == "router-1"


def test_post_start_duplicate_returns_409(env_settings: Path) -> None:
    """RED 2 — second POST while first is still running returns 409."""
    from main import app

    with TestClient(app) as client:
        r1 = client.post("/api/research/start", json={"session_id": "router-dup"})
        assert r1.status_code == 201
        r2 = client.post("/api/research/start", json={"session_id": "router-dup"})
    assert r2.status_code == 409
    assert "already" in cast(str, r2.json().get("detail", "")).lower()


def test_post_start_rejects_empty_session_id(env_settings: Path) -> None:
    """Code-reviewer T9 MEDIUM: Pydantic min_length validation must
    surface as 422, not a 500 from a downstream null/empty failure."""
    from main import app

    with TestClient(app) as client:
        r = client.post("/api/research/start", json={"session_id": ""})
    assert r.status_code == 422


def test_post_start_rejects_oversize_session_id(env_settings: Path) -> None:
    """Code-reviewer T9 MEDIUM: max_length=64 boundary."""
    from main import app

    with TestClient(app) as client:
        r = client.post("/api/research/start", json={"session_id": "x" * 65})
    assert r.status_code == 422
