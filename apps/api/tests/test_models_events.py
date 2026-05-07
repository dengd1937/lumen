"""T4 — Pydantic SSE event model tests.

RED specs per M1.0 plan. Validates ADR-0002 D8.2 contract:
- BaseEvent triplet (event_id / session_id / timestamp) required on 8 business events
- HeartbeatEvent does NOT extend BaseEvent (no audit_log persistence path)
- Discriminated union narrows by `type` field
- Track field constrained to "web" | "kb" literal
- Fixture roundtrip: 9 JSON samples model_validate + model_dump_json stable
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

from app.models.events import (
    AnyEvent,
    BaseEvent,
    ConflictDetectedEvent,
    DoneEvent,
    ErrorEvent,
    HeartbeatEvent,
    NodeCompletedEvent,
    NodeProgressEvent,
    NodeStartedEvent,
    PlanCreatedEvent,
    PlanNode,
    ReportChunkEvent,
    SourceRef,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "event_samples.json"


@pytest.fixture(scope="module")
def event_samples() -> dict[str, Any]:
    """Load the cross-task wire fixture. Top-level shape:
    `{"_schema_version": "M1.0", "<event_type>": {...payload}, ...}`.
    Mixed value types (string for the schema sentinel + dict for each
    event payload) preclude a tighter dict[str, dict[str, Any]] annotation.
    """
    with FIXTURE_PATH.open(encoding="utf-8") as fh:
        loaded: dict[str, Any] = json.load(fh)
    return loaded


# ---------------------------------------------------------------------------
# RED 1 — BaseEvent required fields
# ---------------------------------------------------------------------------


def test_base_event_missing_event_id_raises() -> None:
    """Missing event_id on a business event yields ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        ErrorEvent(  # type: ignore[call-arg]
            session_id="s1",
            timestamp="2026-05-07T10:00:00Z",
            type="error",
            message="boom",
        )
    assert "event_id" in str(exc_info.value)


def test_base_event_missing_session_id_raises() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ErrorEvent(  # type: ignore[call-arg]
            event_id="evt-1",
            timestamp="2026-05-07T10:00:00Z",
            type="error",
            message="boom",
        )
    assert "session_id" in str(exc_info.value)


def test_base_event_missing_timestamp_raises() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ErrorEvent(  # type: ignore[call-arg]
            event_id="evt-1",
            session_id="s1",
            type="error",
            message="boom",
        )
    assert "timestamp" in str(exc_info.value)


# ---------------------------------------------------------------------------
# RED 2 — HeartbeatEvent does NOT extend BaseEvent
# ---------------------------------------------------------------------------


def test_heartbeat_does_not_extend_base_event() -> None:
    """HeartbeatEvent has only `type` and `server_time`; no event_id required."""
    hb = HeartbeatEvent(type="heartbeat", server_time="2026-05-07T10:00:00Z")
    assert hb.type == "heartbeat"
    assert hb.server_time == "2026-05-07T10:00:00Z"
    assert not isinstance(hb, BaseEvent)
    # Heartbeat should NOT have event_id / session_id / timestamp fields.
    dumped = hb.model_dump()
    assert "event_id" not in dumped
    assert "session_id" not in dumped
    assert "timestamp" not in dumped


# ---------------------------------------------------------------------------
# RED 3 — All 9 event types instantiate
# ---------------------------------------------------------------------------


def test_all_9_event_types_instantiate() -> None:
    eid, sid, ts = "evt-1", "s1", "2026-05-07T10:00:00Z"

    p = PlanCreatedEvent(
        event_id=eid,
        session_id=sid,
        timestamp=ts,
        type="plan_created",
        nodes=[PlanNode(id="n1", title="t", track="web")],
    )
    ns = NodeStartedEvent(
        event_id=eid,
        session_id=sid,
        timestamp=ts,
        type="node_started",
        node_id="n1",
        track="web",
    )
    np_ev = NodeProgressEvent(
        event_id=eid,
        session_id=sid,
        timestamp=ts,
        type="node_progress",
        node_id="n1",
        message="m",
    )
    nc = NodeCompletedEvent(
        event_id=eid,
        session_id=sid,
        timestamp=ts,
        type="node_completed",
        node_id="n1",
        sources=[SourceRef(id="s1", title="t")],
    )
    cd = ConflictDetectedEvent(
        event_id=eid,
        session_id=sid,
        timestamp=ts,
        type="conflict_detected",
        conflict_id="C01",
        description="d",
    )
    rc = ReportChunkEvent(
        event_id=eid,
        session_id=sid,
        timestamp=ts,
        type="report_chunk",
        content="c",
    )
    d = DoneEvent(event_id=eid, session_id=sid, timestamp=ts, type="done", report_id="r1")
    e = ErrorEvent(event_id=eid, session_id=sid, timestamp=ts, type="error", message="m")
    hb = HeartbeatEvent(type="heartbeat", server_time="2026-05-07T10:00:30Z")

    instances: list[
        PlanCreatedEvent
        | NodeStartedEvent
        | NodeProgressEvent
        | NodeCompletedEvent
        | ConflictDetectedEvent
        | ReportChunkEvent
        | DoneEvent
        | ErrorEvent
        | HeartbeatEvent
    ] = [p, ns, np_ev, nc, cd, rc, d, e, hb]
    types_seen = {inst.type for inst in instances}
    expected_types = {
        "plan_created",
        "node_started",
        "node_progress",
        "node_completed",
        "conflict_detected",
        "report_chunk",
        "done",
        "error",
        "heartbeat",
    }
    assert types_seen == expected_types
    assert len(instances) == 9


# ---------------------------------------------------------------------------
# RED 4 — track is Literal["web", "kb"]
# ---------------------------------------------------------------------------


def test_node_started_track_must_be_web_or_kb() -> None:
    eid, sid, ts = "evt-1", "s1", "2026-05-07T10:00:00Z"
    NodeStartedEvent(
        event_id=eid,
        session_id=sid,
        timestamp=ts,
        type="node_started",
        node_id="n1",
        track="web",
    )
    NodeStartedEvent(
        event_id=eid,
        session_id=sid,
        timestamp=ts,
        type="node_started",
        node_id="n1",
        track="kb",
    )
    with pytest.raises(ValidationError):
        NodeStartedEvent(
            event_id=eid,
            session_id=sid,
            timestamp=ts,
            type="node_started",
            node_id="n1",
            track="bogus",  # type: ignore[arg-type]
        )


# ---------------------------------------------------------------------------
# RED 5 — fixture roundtrip
# ---------------------------------------------------------------------------


def test_event_samples_roundtrip(event_samples: dict[str, Any]) -> None:
    """All 9 fixture samples must validate against the union and roundtrip
    to JSON exactly (full equality). Codex M6 cross-task contract: this same
    fixture is consumed by frontend T11 to verify TS ↔ Pydantic field name
    parity. Wire serialization MUST use exclude_none=True so optional
    absent fields don't surface as null on the wire (TS types declare
    `field?: T`, not `field?: T | null`)."""
    expected_keys = {
        "plan_created",
        "node_started",
        "node_progress",
        "node_completed",
        "conflict_detected",
        "report_chunk",
        "done",
        "error",
        "heartbeat",
    }
    # Skip the schema version sentinel when iterating event payloads.
    payload_keys = set(event_samples.keys()) - {"_schema_version"}
    assert payload_keys == expected_keys
    assert event_samples.get("_schema_version") == "M1.0"

    business_adapter: TypeAdapter[AnyEvent] = TypeAdapter(AnyEvent)

    for key in expected_keys:
        payload = event_samples[key]
        if key == "heartbeat":
            hb_ev = HeartbeatEvent.model_validate(payload)
            hb_roundtrip = json.loads(hb_ev.model_dump_json(exclude_none=True))
            assert hb_roundtrip == payload, (
                f"heartbeat roundtrip drift: got {hb_roundtrip}, want {payload}"
            )
        else:
            bus_ev = business_adapter.validate_python(payload)
            bus_roundtrip = json.loads(bus_ev.model_dump_json(exclude_none=True))
            assert bus_roundtrip == payload, (
                f"{key} roundtrip drift: got {bus_roundtrip}, want {payload}"
            )


def test_source_ref_absent_optionals_not_serialized_as_null() -> None:
    """Wire contract guard (Codex M6 + python-reviewer HIGH): absent
    optional SourceRef fields MUST NOT appear as null in the JSON wire
    payload. Frontend `SourceRef.url?/snippet?/similarity?` declares
    `field?: T` (absent = undefined), not `field?: T | null`. T8 wire
    format layer must call `model_dump_json(exclude_none=True)` to
    satisfy this contract; this test documents the requirement."""
    src = SourceRef(id="s", title="t")  # url / snippet / similarity all None
    dumped = json.loads(src.model_dump_json(exclude_none=True))
    assert dumped == {"id": "s", "title": "t"}
    assert "url" not in dumped
    assert "snippet" not in dumped
    assert "similarity" not in dumped


def test_business_union_discriminator_narrows_by_type(
    event_samples: dict[str, Any],
) -> None:
    """Discriminator routes to the correct concrete class."""
    adapter: TypeAdapter[AnyEvent] = TypeAdapter(AnyEvent)

    plan = adapter.validate_python(event_samples["plan_created"])
    assert isinstance(plan, PlanCreatedEvent)

    err = adapter.validate_python(event_samples["error"])
    assert isinstance(err, ErrorEvent)

    nc = adapter.validate_python(event_samples["node_completed"])
    assert isinstance(nc, NodeCompletedEvent)
    assert all(isinstance(s, SourceRef) for s in nc.sources)
