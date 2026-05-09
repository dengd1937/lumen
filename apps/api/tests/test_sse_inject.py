"""T11a - stream_session inject_directive SSE layer tests.

Coverage:
- No directive: Phase 1 replay yields all rows normally
- inject_close_after N: raise ConnectionResetError after N business frames
- Heartbeat frames are NOT counted toward N (indirect + direct real-heartbeat paths)
- Phase 1 replay reaches N -> close immediately
- InjectErrorDirective is not consumed in T11a (T12 handles it)
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from pathlib import Path

import aiosqlite
import pytest

from app.db.sqlite import init_db
from app.services.inject_directive import InjectCloseAfterDirective, InjectErrorDirective

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _collect(gen: AsyncGenerator[bytes, None]) -> list[bytes]:
    """Collect all frames from async generator; catch ConnectionResetError."""
    frames: list[bytes] = []
    try:
        async for frame in gen:
            frames.append(frame)
    except ConnectionResetError:
        pass
    return frames


async def _collect_with_reset(gen: AsyncGenerator[bytes, None]) -> tuple[list[bytes], bool]:
    """Collect frames + whether ConnectionResetError was raised."""
    frames: list[bytes] = []
    reset_raised = False
    try:
        async for frame in gen:
            frames.append(frame)
    except ConnectionResetError:
        reset_raised = True
    return frames, reset_raised


async def _make_db_with_rows(
    db_path: str,
    session_id: str,
    event_types: list[str],
    *,
    terminal_status: str = "completed",
) -> None:
    """Create a DB with the given session + audit_log rows, then mark session terminal."""
    async with aiosqlite.connect(db_path) as conn:
        await init_db(conn)
        await conn.execute(
            "INSERT INTO lumen_research_sessions (id, status, query) VALUES (?, 'running', 'q')",
            (session_id,),
        )
        for i, et in enumerate(event_types, start=1):
            await conn.execute(
                "INSERT INTO lumen_audit_log (session_id, event_id, event_type, payload, seq) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, f"evt-{i}", et, f'{{"type":"{et}"}}', i),
            )
        await conn.execute(
            "UPDATE lumen_research_sessions SET status = ? WHERE id = ?",
            (terminal_status, session_id),
        )
        await conn.commit()


# ---------------------------------------------------------------------------
# test_stream_session_no_directive_yields_all_phase1_replay_rows
# ---------------------------------------------------------------------------


async def test_stream_session_no_directive_yields_all_phase1_replay_rows(
    tmp_path: Path,
) -> None:
    """Without directive, stream_session yields all replay rows and exits cleanly."""
    from app.core.sse import stream_session

    db_path = str(tmp_path / "test.db")
    session_id = "test-session-no-directive"
    await _make_db_with_rows(
        db_path, session_id, ["plan_created", "node_started", "node_progress", "node_completed"]
    )

    frames = await _collect(
        stream_session(
            session_id=session_id,
            db_path=db_path,
            last_seq=0,
            heartbeat_interval=100.0,  # avoid heartbeats in test
        )
    )

    business = [f for f in frames if not f.startswith(b"event: heartbeat")]
    assert len(business) == 4, f"Expected 4 business frames, got {len(business)}: {frames}"


# ---------------------------------------------------------------------------
# test_stream_session_inject_close_after_n_yields_n_then_raises_connection_reset
# ---------------------------------------------------------------------------


async def test_stream_session_inject_close_after_n_yields_n_then_raises_connection_reset(
    tmp_path: Path,
) -> None:
    """InjectCloseAfterDirective(n=2): yield exactly 2 frames then raise ConnectionResetError."""
    from app.core.sse import stream_session

    db_path = str(tmp_path / "test.db")
    session_id = "test-session-close-after-2"
    await _make_db_with_rows(
        db_path,
        session_id,
        ["plan_created", "node_started", "node_progress", "node_completed"],
    )

    directive = InjectCloseAfterDirective(n=2)
    frames, reset_raised = await _collect_with_reset(
        stream_session(
            session_id=session_id,
            db_path=db_path,
            last_seq=0,
            heartbeat_interval=100.0,
            inject_directive=directive,
        )
    )

    business = [f for f in frames if not f.startswith(b"event: heartbeat")]
    assert len(business) == 2, f"Expected exactly 2 business frames before reset, got {len(business)}"
    assert reset_raised, "ConnectionResetError should have been raised after N events"


# ---------------------------------------------------------------------------
# test_stream_session_inject_close_after_n_only_counts_business_not_heartbeat
# ---------------------------------------------------------------------------


async def test_stream_session_inject_close_after_n_only_counts_business_not_heartbeat(
    tmp_path: Path,
) -> None:
    """Phase 2: with N=2 and only 1 business audit_log row, stream completes
    without raising ConnectionResetError. This verifies the 'business count
    insufficient' branch (count < n).

    heartbeat_interval=100.0 keeps heartbeats out of the frame list so the
    assertion is deterministic (no heartbeat interference).

    The 'heartbeat frames present but not counted' path is covered by
    test_stream_session_heartbeat_frames_not_counted_toward_close_after_n
    (which uses heartbeat_interval=0.05s to actually inject heartbeat frames).
    """
    from app.core.sse import stream_session

    db_path = str(tmp_path / "test.db")
    session_id = "test-session-hb-not-counted"

    # Create DB with completed session (1 row) so Phase 1 yields 1, Phase 2 is empty→terminal
    await _make_db_with_rows(db_path, session_id, ["plan_created"])

    directive = InjectCloseAfterDirective(n=2)
    frames, reset_raised = await _collect_with_reset(
        stream_session(
            session_id=session_id,
            db_path=db_path,
            last_seq=0,
            heartbeat_interval=100.0,  # no heartbeats in this test path
            inject_directive=directive,
        )
    )

    # Phase 1 gives 1 business frame, Phase 2 drains terminal → no more business
    # → reset never fires (n=2 but only 1 business frame total)
    business = [f for f in frames if not f.startswith(b"event: heartbeat")]
    # With only 1 business frame available, ConnectionResetError should NOT fire
    # (we need 2 to trigger it)
    assert not reset_raised, (
        "ConnectionResetError should not fire when fewer business frames than N are available"
    )
    assert len(business) == 1, f"Only 1 business frame available, got {len(business)}"


# ---------------------------------------------------------------------------
# test_stream_session_inject_close_after_with_replay_phase
# ---------------------------------------------------------------------------


async def test_stream_session_inject_close_after_with_replay_phase(
    tmp_path: Path,
) -> None:
    """Phase 1 already has N rows: fire ConnectionResetError after N-th replay row.

    DB has 5 rows, n=2 → yields 2 then raises. Rows 3-5 never yielded.
    """
    from app.core.sse import stream_session

    db_path = str(tmp_path / "test.db")
    session_id = "test-session-replay-close"
    await _make_db_with_rows(
        db_path,
        session_id,
        ["plan_created", "node_started", "node_progress", "node_completed", "extra_event"],
    )

    directive = InjectCloseAfterDirective(n=2)
    frames, reset_raised = await _collect_with_reset(
        stream_session(
            session_id=session_id,
            db_path=db_path,
            last_seq=0,
            heartbeat_interval=100.0,
            inject_directive=directive,
        )
    )

    business = [f for f in frames if not f.startswith(b"event: heartbeat")]
    assert reset_raised, "ConnectionResetError should be raised after N=2 events in Phase 1"
    assert len(business) == 2, f"Expected 2 business frames before reset, got {len(business)}"

    # Verify the yielded frames are the first two
    assert b"plan_created" in business[0], f"First frame should be plan_created: {business[0]!r}"
    assert b"node_started" in business[1], f"Second frame should be node_started: {business[1]!r}"


# ---------------------------------------------------------------------------
# test_stream_session_inject_error_directive_does_not_close_in_t11
# ---------------------------------------------------------------------------


async def test_stream_session_inject_error_directive_does_not_close_in_t11(
    tmp_path: Path,
) -> None:
    """T11a: InjectErrorDirective is stored but NOT consumed by stream_session.

    stream_session counts business frames as usual (counting still works),
    but InjectErrorDirective triggers no special behavior in T11a
    (T12 will implement that). Stream completes normally.
    """
    from app.core.sse import stream_session

    db_path = str(tmp_path / "test.db")
    session_id = "test-session-inject-error-t11"
    await _make_db_with_rows(
        db_path,
        session_id,
        ["plan_created", "node_started"],
    )

    directive = InjectErrorDirective()
    frames, reset_raised = await _collect_with_reset(
        stream_session(
            session_id=session_id,
            db_path=db_path,
            last_seq=0,
            heartbeat_interval=100.0,
            inject_directive=directive,
        )
    )

    # T11a: InjectErrorDirective causes no early close — stream runs to completion
    assert not reset_raised, (
        "T11a: InjectErrorDirective should not cause ConnectionResetError (T12 handles that)"
    )
    business = [f for f in frames if not f.startswith(b"event: heartbeat")]
    assert len(business) == 2, f"Expected 2 business frames (all rows), got {len(business)}"


# ---------------------------------------------------------------------------
# test_stream_session_heartbeat_frames_not_counted_toward_close_after_n
# (D3 guard - real heartbeat frame path: heartbeat appears but does not count toward close_after_n)
# ---------------------------------------------------------------------------


async def test_stream_session_heartbeat_frames_not_counted_toward_close_after_n(
    tmp_path: Path,
) -> None:
    """Real heartbeat frames appear in Phase 2 but must NOT count toward close_after_n.

    Strategy:
    - DB has 1 business row; session is 'completed' (Phase 2 yields no new rows).
    - heartbeat_interval=0.05s lets _heartbeat_loop produce multiple heartbeat frames.
    - inject_directive=InjectCloseAfterDirective(n=2) but only 1 business frame available.
    - Key assertions: heartbeat_count >= 1 (proves real heartbeat path was exercised)
                      AND ConnectionResetError is NOT raised (business count < n=2).
    """
    from app.core.sse import stream_session

    db_path = str(tmp_path / "test.db")
    session_id = "test-session-hb-not-counted-real"

    # 1 business row; completed session so Phase 2 produces no additional rows.
    await _make_db_with_rows(db_path, session_id, ["plan_created"])

    directive = InjectCloseAfterDirective(n=2)

    frames: list[bytes] = []
    heartbeat_count = 0
    business_count = 0
    reset_raised = False

    gen = stream_session(
        session_id=session_id,
        db_path=db_path,
        last_seq=0,
        heartbeat_interval=0.05,  # 50ms - fast heartbeat production
        poll_interval=0.05,
        terminal_grace_seconds=0.15,
        inject_directive=directive,
    )

    try:
        async with asyncio.timeout(0.6):
            async for frame in gen:
                frames.append(frame)
                if frame.startswith(b"event: heartbeat"):
                    heartbeat_count += 1
                else:
                    business_count += 1
    except TimeoutError:
        pass  # expected: stream did not reset from heartbeats; timed out naturally
    except ConnectionResetError:
        reset_raised = True

    # Assertion 1: at least 1 real heartbeat frame observed (proves the heartbeat path ran)
    assert heartbeat_count >= 1, (
        f"Test must observe at least 1 heartbeat frame to validate the path, got {heartbeat_count}"
    )
    # Assertion 2: exactly 1 business frame (only 1 DB row)
    assert business_count == 1, (
        f"Only 1 business row in DB, expected business_count=1, got {business_count}"
    )
    # Key assertion: even though heartbeat_count >= 1, business count 1 < n=2,
    # so ConnectionResetError must NOT be raised.
    assert not reset_raised, (
        "Heartbeat frames must not count toward close_after_n; "
        f"business={business_count}, heartbeat={heartbeat_count}, n=2 -> should not raise"
    )
