"""StreamEvent → AnyEvent routing layer.

Per ADR-0003 D10.1: maps raw LangGraph astream_events(version="v2") dicts
to lumen AnyEvent instances (or None to filter/skip).

Mapping table:
  on_chain_end   + metadata.langgraph_node == "planner"    → PlanCreatedEvent
  on_chain_start + metadata.langgraph_node == "researcher" → NodeStartedEvent
  on_chain_end   + metadata.langgraph_node == "researcher" → NodeCompletedEvent
  on_chat_model_stream + metadata.langgraph_node == "writer" → ReportChunkEvent
  on_chain_end   + name == "LangGraph"                     → DoneEvent
  everything else                                          → None (filtered)

metadata_langgraph_node resolution order (ADR-0003 fallback rule):
  1. metadata["langgraph_node"]         (real runtime)
  2. metadata["metadata_langgraph_node"] (test fixture field)
"""

from __future__ import annotations

from typing import Any

from app.core.utils import new_event_id as _new_event_id
from app.core.utils import now_iso as _now_iso
from app.models.events import (
    AnyEvent,
    DoneEvent,
    NodeCompletedEvent,
    NodeStartedEvent,
    PlanCreatedEvent,
    PlanNode,
    ReportChunkEvent,
)


def _get_langgraph_node(metadata: dict[str, Any]) -> str | None:
    """Resolve metadata.langgraph_node with fixture-field fallback."""
    return metadata.get("langgraph_node") or metadata.get("metadata_langgraph_node")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def route_stream_event(
    raw: dict[str, Any],
    *,
    session_id: str,
) -> AnyEvent | None:
    """Map a LangGraph StreamEvent dict to a lumen AnyEvent (or None to skip).

    Reads metadata.langgraph_node (real run) with fallback to
    metadata_langgraph_node (test fixture); see ADR-0003 D10.1.
    """
    event: str = raw.get("event", "")
    name: str = raw.get("name", "")
    run_id: str = raw.get("run_id", "")
    metadata: dict[str, Any] = raw.get("metadata", {})
    data: dict[str, Any] = raw.get("data", {})

    lg_node = _get_langgraph_node(metadata)

    # --- on_chain_end / planner → PlanCreatedEvent ---
    if event == "on_chain_end" and lg_node == "planner":
        output = data.get("output") or {}
        raw_nodes: list[Any] = output.get("plan_nodes", [])
        nodes: list[PlanNode] = []
        for n in raw_nodes:
            if isinstance(n, PlanNode):
                nodes.append(n)
            else:
                # dict form (from JSON-serialized LangGraph event)
                nodes.append(
                    PlanNode(
                        id=n.get("id", ""),
                        title=n.get("title", ""),
                        track=n.get("track", "web"),
                    )
                )
        return PlanCreatedEvent(
            event_id=_new_event_id(),
            session_id=session_id,
            timestamp=_now_iso(),
            type="plan_created",
            nodes=nodes,
        )

    # --- on_chain_start / researcher → NodeStartedEvent ---
    if event == "on_chain_start" and lg_node == "researcher":
        node_id = run_id[:8]
        return NodeStartedEvent(
            event_id=_new_event_id(),
            session_id=session_id,
            timestamp=_now_iso(),
            type="node_started",
            node_id=node_id,
            track="web",
        )

    # --- on_chain_end / researcher → NodeCompletedEvent ---
    if event == "on_chain_end" and lg_node == "researcher":
        node_id = run_id[:8]
        return NodeCompletedEvent(
            event_id=_new_event_id(),
            session_id=session_id,
            timestamp=_now_iso(),
            type="node_completed",
            node_id=node_id,
            sources=[],
        )

    # --- on_chat_model_stream / writer → ReportChunkEvent ---
    if event == "on_chat_model_stream" and lg_node == "writer":
        chunk = data.get("chunk")
        raw_content = chunk.content if chunk is not None else ""
        content: str = raw_content if isinstance(raw_content, str) else ""
        return ReportChunkEvent(
            event_id=_new_event_id(),
            session_id=session_id,
            timestamp=_now_iso(),
            type="report_chunk",
            content=content,
        )

    # --- on_chain_end / LangGraph (graph terminal state) → DoneEvent ---
    if event == "on_chain_end" and name == "LangGraph":
        report_id = f"rpt-{session_id[:8]}"
        return DoneEvent(
            event_id=_new_event_id(),
            session_id=session_id,
            timestamp=_now_iso(),
            type="done",
            report_id=report_id,
        )

    # All other combinations → filtered
    return None
