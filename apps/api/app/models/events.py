"""Lumen SSE event models — Pydantic wire contract.

Mirrors apps/web/src/types/research-events.ts 1:1 (snake_case fields,
no aliasing). Defined per ADR-0001 D2 (8 business events) and ADR-0002
D8.2 (BaseEvent triplet + heartbeat as 9th event).

Naming convention: all fields snake_case so the JSON wire payload is
identical on both sides — `model_dump_json()` produces the exact shape
the frontend's TypeScript types expect.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Track = Literal["web", "kb"]


class BaseEvent(BaseModel):
    """Triplet shared by all 8 business events. Per ADR-0002 D8.2:
    `event_id` is a ULID for idempotency (NOT for ordering — replay uses
    audit_log.seq); `session_id` matches research_sessions.id; `timestamp`
    is ISO-8601 UTC."""

    model_config = ConfigDict(frozen=True)

    event_id: str
    session_id: str
    timestamp: str


class PlanNode(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    title: str
    track: Track


class SourceRef(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    title: str
    url: str | None = None
    snippet: str | None = None
    similarity: float | None = None


class PlanCreatedEvent(BaseEvent):
    type: Literal["plan_created"]
    nodes: list[PlanNode]


class NodeStartedEvent(BaseEvent):
    type: Literal["node_started"]
    node_id: str
    track: Track


class NodeProgressEvent(BaseEvent):
    type: Literal["node_progress"]
    node_id: str
    message: str


class NodeCompletedEvent(BaseEvent):
    type: Literal["node_completed"]
    node_id: str
    sources: list[SourceRef]


class ConflictDetectedEvent(BaseEvent):
    type: Literal["conflict_detected"]
    conflict_id: str
    description: str


class ReportChunkEvent(BaseEvent):
    type: Literal["report_chunk"]
    content: str


class DoneEvent(BaseEvent):
    type: Literal["done"]
    report_id: str


class ErrorEvent(BaseEvent):
    type: Literal["error"]
    message: str


class HeartbeatEvent(BaseModel):
    """Wire-only — does NOT extend BaseEvent because heartbeat is not
    persisted to audit_log and does not participate in replay or reducer
    idempotency. The SSE frame still carries an `id:` line (server emits
    `id: heartbeat-<server_time>`) so the browser does not reset its
    internal lastEventId on heartbeat receipt — that header is set in
    app.core.sse, not on this model."""

    model_config = ConfigDict(frozen=True)

    type: Literal["heartbeat"]
    server_time: str


# Discriminated union over the 8 business events. Heartbeat is intentionally
# excluded — it's a wire-layer concern handled by app.core.sse.
AnyEvent = Annotated[
    PlanCreatedEvent
    | NodeStartedEvent
    | NodeProgressEvent
    | NodeCompletedEvent
    | ConflictDetectedEvent
    | ReportChunkEvent
    | DoneEvent
    | ErrorEvent,
    Field(discriminator="type"),
]
