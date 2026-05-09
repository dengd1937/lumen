"""T8 — SSE wire format tests.

Per ADR-0002 D8.1 + Codex C1: every business SSE frame MUST be three
explicit lines (`id: ...` / `event: ...` / `data: ...`) followed by a
blank line. Browser EventSource reads the `id:` SSE line — NOT a value
buried in the JSON payload — when populating the auto-reconnect
`Last-Event-ID` header. Without an `id:` line, reconnects come back with
no header and the server cannot resume from the right cursor.

T7B D-HB fix (Codex HIGH #2): heartbeat frames intentionally omit the
`id:` line so they do NOT update EventSource.lastEventId. This preserves
the most-recent business event id as the replay cursor -- heartbeat ids
would 400 on lookup_seq_by_event_id because they are never in audit_log.
"""

from __future__ import annotations

import json

from app.core.sse import format_heartbeat, format_sse, make_heartbeat
from app.models.events import (
    ErrorEvent,
    HeartbeatEvent,
    NodeCompletedEvent,
    SourceRef,
)


def _make_error_event(
    *,
    event_id: str = "evt-001",
    session_id: str = "sess-1",
    message: str = "boom",
) -> ErrorEvent:
    return ErrorEvent(
        event_id=event_id,
        session_id=session_id,
        timestamp="2026-05-07T10:00:00Z",
        type="error",
        message=message,
    )


# ---------------------------------------------------------------------------
# RED 1 — three-line frame structure
# ---------------------------------------------------------------------------


def test_format_sse_three_lines() -> None:
    """W3C SSE frame is `id: ...\\nevent: ...\\ndata: ...\\n\\n`."""
    frame = format_sse(_make_error_event()).decode("utf-8")
    assert frame.endswith("\n\n"), "Frame must end with blank line (separator)"

    # Strip trailing blank line, split into the three content lines.
    body = frame.rstrip("\n")
    lines = body.split("\n")
    assert len(lines) == 3, f"Expected 3 lines, got {len(lines)}: {lines!r}"
    assert lines[0].startswith("id: ")
    assert lines[1].startswith("event: ")
    assert lines[2].startswith("data: ")


# ---------------------------------------------------------------------------
# RED 2 — id: comes from event.event_id, not from JSON payload
# ---------------------------------------------------------------------------


def test_format_sse_event_id_from_frame_not_payload() -> None:
    """The browser's EventSource reads the SSE `id:` line, not the JSON
    `event_id` field. Both must be present and equal — the JSON value
    is for backend audit, the frame value is the wire cursor."""
    ev = _make_error_event(event_id="evt-from-frame")
    frame = format_sse(ev).decode("utf-8")

    # 1) The frame's id: line carries the event_id (verbatim).
    assert "id: evt-from-frame\n" in frame

    # 2) The data JSON also contains it (for replay reconstruction).
    data_line = next(line for line in frame.split("\n") if line.startswith("data: "))
    payload = json.loads(data_line.removeprefix("data: "))
    assert payload["event_id"] == "evt-from-frame"


def test_format_sse_event_type_in_event_line() -> None:
    """event: line uses the discriminator value (`type` field)."""
    ev = _make_error_event()
    frame = format_sse(ev).decode("utf-8")
    assert "event: error\n" in frame


# ---------------------------------------------------------------------------
# RED 3 — heartbeat frame omits id: (T7B D-HB fix, Codex HIGH #2)
# ---------------------------------------------------------------------------


def test_format_heartbeat_does_not_emit_id_line() -> None:
    """T7B D-HB: Heartbeat frame must NOT emit an 'id:' line.

    W3C SSE spec: a frame without 'id:' does NOT update
    EventSource.lastEventId, so the browser retains the most-recent
    business event id as the replay cursor.

    Fixes Codex HIGH #2 (M1.0 hidden bug): the old implementation emitted
    'id: heartbeat-<server_time>', which the browser wrote to lastEventId.
    On reconnect the browser sent that synthetic id as Last-Event-ID;
    lookup_seq_by_event_id could not find it in audit_log and returned 400,
    breaking SSE-2 e2e.
    """
    server_time = "2026-05-07T10:00:30Z"
    frame = format_heartbeat(server_time).decode("utf-8")
    assert "id: " not in frame, (
        f"Heartbeat frame must not emit 'id:' line (W3C SSE spec). Got:\n{frame!r}"
    )


def test_format_heartbeat_emits_event_and_data_lines() -> None:
    """T7B: heartbeat frame has event: heartbeat + data: <json> + \\n\\n terminator."""
    server_time = "2026-05-07T10:00:30Z"
    frame = format_heartbeat(server_time).decode("utf-8")
    assert "event: heartbeat\n" in frame

    # Strengthen: data line must be valid JSON containing type + server_time
    data_line = next(line for line in frame.split("\n") if line.startswith("data: "))
    payload = json.loads(data_line.removeprefix("data: "))
    assert payload["type"] == "heartbeat"
    assert payload["server_time"] == server_time

    assert frame.endswith("\n\n")


def test_format_heartbeat_data_decodable_and_typed() -> None:
    server_time = "2026-05-07T10:00:30Z"
    frame = format_heartbeat(server_time).decode("utf-8")
    data_line = next(line for line in frame.split("\n") if line.startswith("data: "))
    payload = json.loads(data_line.removeprefix("data: "))
    assert payload["type"] == "heartbeat"
    assert payload["server_time"] == server_time


def test_make_heartbeat_returns_typed_instance() -> None:
    hb = make_heartbeat()
    assert isinstance(hb, HeartbeatEvent)
    assert hb.type == "heartbeat"
    assert hb.server_time.endswith("Z")  # ISO 8601 UTC


# ---------------------------------------------------------------------------
# RED 4 — data: line is valid JSON
# ---------------------------------------------------------------------------


def test_format_sse_data_line_is_valid_json() -> None:
    ev = _make_error_event()
    frame = format_sse(ev).decode("utf-8")
    data_line = next(line for line in frame.split("\n") if line.startswith("data: "))
    payload = json.loads(data_line.removeprefix("data: "))  # raises if invalid
    assert payload["type"] == "error"
    assert payload["event_id"] == "evt-001"


def test_format_sse_excludes_none_optionals() -> None:
    """Wire contract (per T4 reviewer HIGH + Codex M6): optional
    absent fields MUST NOT surface as null on the wire. TS types
    declare `field?: T`, not `field?: T | null`."""
    ev = NodeCompletedEvent(
        event_id="e1",
        session_id="s1",
        timestamp="2026-05-07T10:00:00Z",
        type="node_completed",
        node_id="n1",
        sources=[
            SourceRef(id="src-1", title="t"),  # url/snippet/similarity all None
        ],
    )
    frame = format_sse(ev).decode("utf-8")
    data_line = next(line for line in frame.split("\n") if line.startswith("data: "))
    payload = json.loads(data_line.removeprefix("data: "))
    src = payload["sources"][0]
    assert src == {"id": "src-1", "title": "t"}
    assert "url" not in src
    assert "snippet" not in src
    assert "similarity" not in src


# ---------------------------------------------------------------------------
# RED 5 — no extra whitespace / strict frame format
# ---------------------------------------------------------------------------


def test_format_sse_returns_utf8_bytes_strict_prefix() -> None:
    frame = format_sse(_make_error_event())
    assert isinstance(frame, bytes)
    assert frame.startswith(b"id: ")
    # Decode does not raise (UTF-8 valid).
    text = frame.decode("utf-8")
    assert "\r" not in text  # SSE uses \n, not \r\n


# ---------------------------------------------------------------------------
# Invariant guards (per python-reviewer + code-reviewer T8 LOW)
# ---------------------------------------------------------------------------


def test_format_sse_rejects_newline_in_event_id() -> None:
    """SSE frame injection guard: a literal `\\n` in event_id would
    forge an additional SSE event line. Today event_id is server-
    generated (ULIDs), but the guard makes the invariant explicit so
    a future T9/T10 refactor that flows client values into the frame
    cannot silently break it."""
    import pytest

    bad_ev = _make_error_event(event_id="evt\ninjected: malicious")
    with pytest.raises(ValueError, match="event_id"):
        format_sse(bad_ev)


def test_format_heartbeat_rejects_newline_in_server_time() -> None:
    """Same guard for the heartbeat path."""
    import pytest

    with pytest.raises(ValueError, match="server_time"):
        format_heartbeat("2026-05-07T10:00:00Z\nevent: bogus")
