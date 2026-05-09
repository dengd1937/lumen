"""SSE wire format primitives + session stream generator.

Per ADR-0002 D8.1 + Codex C1: business SSE frames are three explicit
lines plus a trailing blank line. The `id:` line carries the event
identifier that browser EventSource auto-reconnect uses to populate the
`Last-Event-ID` request header — putting the identifier ONLY in the
JSON `data` payload would silently break replay because the browser
never inspects the JSON for reconnect cursor.

T7B D-HB fix (Codex HIGH #2): heartbeat frames intentionally omit the
`id:` line so browser EventSource does NOT update lastEventId on receipt.
This preserves the most-recent business event id as the replay cursor;
`heartbeat-*` synthetic ids are never persisted to audit_log and would
cause a 400 on lookup_seq_by_event_id if used as Last-Event-ID.

Wire serialization invariants (per T4 reviewer HIGH + cross-language
contract with apps/web/src/types/research-events.ts):

- `model_dump_json(exclude_none=True)` so TS `field?: T` (absent =
  undefined) types are honored on the wire — null values for optional
  absent fields would mismatch the TS contract.
- snake_case field names match the Pydantic models 1:1 (no aliasing).
- LF line endings (`\\n`), not CRLF — W3C SSE spec.

T10 adds `stream_session`: an async generator that yields W3C SSE
byte-frames for a session. Phase 1 replays missed audit_log rows
(seq > last_seq); Phase 2 live-tails new rows + emits heartbeats
until the session reaches a terminal status. Heartbeat frames are
NEVER yielded during replay (per plan T10 RED 5).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncGenerator, Mapping
from datetime import UTC, datetime

import aiosqlite

from app.db.sqlite import configure_connection, read_after
from app.models.events import BaseEvent, HeartbeatEvent

_TERMINAL_STATES: frozenset[str] = frozenset({"completed", "failed", "cancelled"})
_STREAM_QUEUE_MAXSIZE: int = 256


def _assert_no_newline(value: str, field_name: str) -> None:
    """Defensive guard against SSE frame injection. event_id + server_time
    are server-internal today (T9 generates ULIDs, make_heartbeat generates
    isoformat timestamps), but if T10+ ever wires client-provided values
    into the frame, a literal `\\n` would forge an extra event line."""
    if "\n" in value or "\r" in value:
        raise ValueError(f"{field_name} must not contain newline characters")


def format_sse(event: BaseEvent) -> bytes:
    """Serialize a business event to a W3C SSE frame.

    Frame:
        id: <event.event_id>\\n
        event: <event.type>\\n
        data: <event.model_dump_json(exclude_none=True)>\\n
        \\n   (trailing blank line — frame separator)

    Raises `KeyError` if the model's dump lacks a `type` discriminator
    (concrete subclasses of `BaseEvent` always carry one via Literal,
    so this is an invariant violation, not user error). Raises
    `ValueError` if event_id contains a newline (defense-in-depth).
    """
    payload_json = event.model_dump_json(exclude_none=True)
    # Single serialization pass: parse `type` out of the already-built JSON
    # rather than calling model_dump() a second time.
    event_type = json.loads(payload_json)["type"]
    _assert_no_newline(event.event_id, "event_id")
    return (f"id: {event.event_id}\nevent: {event_type}\ndata: {payload_json}\n\n").encode()


def format_heartbeat(server_time: str) -> bytes:
    """Serialize a heartbeat to a W3C SSE frame.

    T7B D-HB (v2): heartbeat frame omits the `id:` line per W3C SSE spec
    (https://html.spec.whatwg.org/multipage/server-sent-events.html).
    A frame without `id:` does NOT update EventSource.lastEventId on the
    browser side; this is the desired behavior so heartbeats don't pollute
    the replay cursor with synthetic `heartbeat-*` values that would 400
    on lookup_seq_by_event_id (Codex HIGH #2 — M1.0 hidden bug fix).

    Heartbeats are NEVER persisted to audit_log (ADR-0002 D8.5) because
    they are wire-only liveness signals.
    """
    _assert_no_newline(server_time, "server_time")
    hb = HeartbeatEvent(type="heartbeat", server_time=server_time)
    payload_json = hb.model_dump_json(exclude_none=True)
    return (f"event: heartbeat\ndata: {payload_json}\n\n").encode()


def make_heartbeat() -> HeartbeatEvent:
    """Construct a HeartbeatEvent with the current UTC ISO 8601
    timestamp at microsecond precision. Stream/producer code (T10)
    calls this from a dedicated asyncio Task so heartbeat cadence stays
    decoupled from LangGraph event production (per ADR-0002 D8.5).

    `timespec="microseconds"` is explicit (rather than relying on the
    default which depends on whether the datetime carries microseconds)
    so the JSON payload's server_time field has a stable format for
    debugging and log correlation (heartbeat is no longer in the SSE
    id: line per T7B D-HB)."""
    server_time = datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
    return HeartbeatEvent(type="heartbeat", server_time=server_time)


def _row_to_frame(row: Mapping[str, str | int]) -> bytes:
    """Re-emit an audit_log row as a W3C SSE frame.

    The row's `payload` column is the model_dump_json output written at
    insert time (T9 session_manager._run). We forward it verbatim so
    the wire invariants (snake_case, exclude_none) baked in at write
    time round-trip without re-serialization.
    """
    event_id = str(row["event_id"])
    event_type = str(row["event_type"])
    payload = str(row["payload"])
    _assert_no_newline(event_id, "event_id")
    _assert_no_newline(event_type, "event_type")
    return f"id: {event_id}\nevent: {event_type}\ndata: {payload}\n\n".encode()


async def stream_session(
    *,
    session_id: str,
    db_path: str,
    last_seq: int,
    heartbeat_interval: float = 15.0,
    poll_interval: float = 0.05,
    terminal_grace_seconds: float = 0.2,
) -> AsyncGenerator[bytes, None]:
    """Yield W3C SSE byte-frames for a session.

    Phase 1 (replay, no heartbeat — plan T10 RED 5): drain audit_log
    rows with seq > last_seq.
    Phase 2 (live): heartbeat task + audit_log poll task push frames
    into a queue; consumer yields them. Stops when the session reaches
    a terminal status AND no further rows arrive within the grace window.

    Cancellation safety: if the SSE consumer disconnects (response
    generator closed → CancelledError or GeneratorExit), the `finally`
    block cancels both background tasks and awaits them via
    `asyncio.gather(..., return_exceptions=True)`. We deliberately do
    NOT use `asyncio.TaskGroup` here despite plan T10 wording — TaskGroup
    interacts poorly with `aclose()` on async generators (raises
    BaseExceptionGroup that callers don't expect on disconnect). The
    explicit create_task + finally pattern delivers the same structured
    cleanup with cleaner exception semantics for ASGI streaming.
    """
    cursor_seq = last_seq

    # Phase 1 — replay
    async with aiosqlite.connect(db_path) as conn:
        await configure_connection(conn)
        rows = await read_after(conn, session_id=session_id, last_seq=cursor_seq)
    for row in rows:
        cursor_seq = max(cursor_seq, int(row["seq"]))
        yield _row_to_frame(row)

    # Phase 2 — live (heartbeat + poller share a bounded queue so a slow
    # ASGI consumer cannot accumulate unbounded memory). On QueueFull,
    # heartbeats are dropped silently (poll frames are not — see _poll_loop).
    queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=_STREAM_QUEUE_MAXSIZE)

    poll_task = asyncio.create_task(
        _poll_loop(
            queue=queue,
            db_path=db_path,
            session_id=session_id,
            start_seq=cursor_seq,
            poll_interval=poll_interval,
            terminal_grace_seconds=terminal_grace_seconds,
        ),
        name=f"sse-poll-{session_id}",
    )
    heartbeat_task = asyncio.create_task(
        _heartbeat_loop(queue=queue, interval=heartbeat_interval),
        name=f"sse-heartbeat-{session_id}",
    )

    try:
        while True:
            frame = await queue.get()
            if frame is None:
                # poll_loop signals terminal+drained.
                break
            yield frame
    finally:
        for task in (poll_task, heartbeat_task):
            task.cancel()
        await asyncio.gather(poll_task, heartbeat_task, return_exceptions=True)


async def _heartbeat_loop(
    *,
    queue: asyncio.Queue[bytes | None],
    interval: float,
) -> None:
    """Push a heartbeat frame into the live-phase queue every `interval`
    seconds. Cancellation-safe — outer caller cancels via task.cancel()
    in `stream_session`'s finally.

    Drops heartbeats on QueueFull (consumer is slow / queue saturated by
    business frames). This is intentional: business frames matter; a
    missed heartbeat just means the next one arrives later. Without
    catching, the task would die with a non-CancelledError exception
    that propagates from `asyncio.gather`.
    """
    while True:
        await asyncio.sleep(interval)
        with contextlib.suppress(asyncio.QueueFull):
            queue.put_nowait(format_heartbeat(make_heartbeat().server_time))


async def _poll_loop(
    *,
    queue: asyncio.Queue[bytes | None],
    db_path: str,
    session_id: str,
    start_seq: int,
    poll_interval: float,
    terminal_grace_seconds: float,
) -> None:
    """Poll audit_log for new rows, push frames into the queue, and
    signal termination by enqueueing `None` once the session is in a
    terminal state and no further rows have been observed.

    The grace window after observing terminal status absorbs the race
    between session_manager flipping status (in _run's finally) and the
    last audit_log row's commit landing (which happens on a different
    aiosqlite connection inside the per-event loop body). Without it,
    the poll could exit before the final NodeCompleted row is visible.
    """
    cursor = start_seq
    while True:
        new_rows, status = await _read_state(db_path, session_id, cursor)
        for row in new_rows:
            cursor = max(cursor, int(row["seq"]))
            await queue.put(_row_to_frame(row))

        if status is None:
            # Session row vanished (deleted by external tooling or test
            # teardown). Close the stream rather than spin forever.
            await queue.put(None)
            return

        terminal = status in _TERMINAL_STATES
        if terminal and not new_rows:
            await asyncio.sleep(terminal_grace_seconds)
            final_rows, _ = await _read_state(db_path, session_id, cursor)
            for row in final_rows:
                cursor = max(cursor, int(row["seq"]))
                await queue.put(_row_to_frame(row))
            if not final_rows:
                await queue.put(None)
                return
            # If the grace window surfaced more rows we fall through:
            # the next iteration sees terminal + empty new_rows and exits
            # cleanly (no chance of missing a row before the sentinel).

        await asyncio.sleep(poll_interval)


async def _read_state(
    db_path: str,
    session_id: str,
    cursor: int,
) -> tuple[list[dict[str, str | int]], str | None]:
    """Single-connection read of (new_rows_after_cursor, current_status).
    Combined to amortize the per-connection PRAGMA setup cost."""
    async with aiosqlite.connect(db_path) as conn:
        await configure_connection(conn)
        new_rows = await read_after(conn, session_id=session_id, last_seq=cursor)
        status_cur = await conn.execute(
            "SELECT status FROM lumen_research_sessions WHERE id = ?",
            (session_id,),
        )
        status_row = await status_cur.fetchone()
    status = None if status_row is None else str(status_row[0])
    return new_rows, status
