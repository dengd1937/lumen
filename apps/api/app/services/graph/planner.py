"""Planner node — decomposes the query into a fixed 5-subtask plan.

D10.3 降级路径: T5 returns a hard-coded 5-task template without calling the
LLM. The model parameter is accepted for interface consistency and future use.

TODO(M1.B): replace fixed template with LLM-generated plan titles.
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import TYPE_CHECKING, Any

from app.models.events import PlanNode
from app.services.graph.state import GraphState

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

NodeCallable = Callable[["GraphState"], Coroutine[Any, Any, dict[str, Any]]]

_DEFAULT_PLAN_NODES: list[PlanNode] = [
    PlanNode(id="web-1", title="公开文献综述", track="web"),
    PlanNode(id="web-2", title="案例分析", track="web"),
    PlanNode(id="web-3", title="趋势预测", track="web"),
    PlanNode(id="web-4", title="风险评估", track="web"),
    PlanNode(id="web-5", title="监管政策", track="web"),
]


def planner_node_factory(model: BaseChatModel) -> NodeCallable:
    """Return a planner_node coroutine that captures model via closure.

    The model is accepted for interface parity with researcher/writer
    factories; T5 does not invoke it (D10.3 degraded path).
    """

    async def planner_node(state: GraphState) -> dict[str, Any]:
        # TODO(M1.B): LLM 定制 plan title
        return {"plan_nodes": list(_DEFAULT_PLAN_NODES)}

    return planner_node
