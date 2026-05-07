"""SSE wire format primitives.

Per ADR-0002 D8.1 + Codex C1: every SSE frame is three explicit lines
plus a trailing blank line. The `id:` line carries the event identifier
that browser EventSource auto-reconnect uses to populate the
`Last-Event-ID` request header — putting the identifier ONLY in the
JSON `data` payload would silently break replay because the browser
never inspects the JSON for reconnect cursor.

Wire serialization invariants (per T4 reviewer HIGH + cross-language
contract with apps/web/src/types/research-events.ts):

- `model_dump_json(exclude_none=True)` so TS `field?: T` (absent =
  undefined) types are honored on the wire — null values for optional
  absent fields would mismatch the TS contract.
- snake_case field names match the Pydantic models 1:1 (no aliasing).
- LF line endings (`\\n`), not CRLF — W3C SSE spec.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.models.events import BaseEvent, HeartbeatEvent


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

    Heartbeat needs an `id:` line so the browser does NOT reset its
    internal lastEventId on receipt (per W3C SSE spec, a frame without
    `id:` clears the lastEventId on the reader). The value is the
    synthetic `heartbeat-<server_time>` — heartbeats are NEVER persisted
    to audit_log (per ADR-0002 D8.5), so this id never appears in the
    replay cursor space.
    """
    _assert_no_newline(server_time, "server_time")
    hb = HeartbeatEvent(type="heartbeat", server_time=server_time)
    payload_json = hb.model_dump_json(exclude_none=True)
    return (f"id: heartbeat-{server_time}\nevent: heartbeat\ndata: {payload_json}\n\n").encode()


def make_heartbeat() -> HeartbeatEvent:
    """Construct a HeartbeatEvent with the current UTC ISO 8601
    timestamp at microsecond precision. Stream/producer code (T10)
    calls this from a dedicated asyncio Task so heartbeat cadence stays
    decoupled from LangGraph event production (per ADR-0002 D8.5).

    `timespec="microseconds"` is explicit (rather than relying on the
    default which depends on whether the datetime carries microseconds)
    so the wire format `heartbeat-<server_time>` is regex-stable for
    consumers that match against it."""
    server_time = datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
    return HeartbeatEvent(type="heartbeat", server_time=server_time)
