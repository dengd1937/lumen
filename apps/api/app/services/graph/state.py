"""GraphState TypedDict — shared state flowing through the three-node graph.

Immutability contract: each node returns a new partial dict; LangGraph merges
it into the accumulated state. Nodes must never mutate the incoming state dict.
"""

from __future__ import annotations

from typing import TypedDict

from app.models.events import PlanNode


class GraphState(TypedDict):
    """Accumulated state flowing planner → researcher → writer."""

    query: str
    session_id: str
    # planner output: typed plan-node list consumed by researcher/writer
    plan_nodes: list[PlanNode]
    # writer output: accumulated token chunks
    report_chunks: list[str]
