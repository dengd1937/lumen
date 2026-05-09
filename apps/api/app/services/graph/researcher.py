"""Researcher node — calls the LLM once per plan node (D12.3 timeout).

For each plan_node in state["plan_nodes"], invokes model.ainvoke with a
summary prompt. Returns an empty state update (researcher results are used
internally; the SSE layer emits node_started/node_completed via routing).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from typing import TYPE_CHECKING, Any

from langchain_core.messages import HumanMessage

from app.services.graph.state import GraphState

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from app.models.events import PlanNode

NodeCallable = Callable[["GraphState"], Coroutine[Any, Any, dict[str, Any]]]

_RESEARCHER_TIMEOUT_S = 120  # D12.3


def researcher_node_factory(model: BaseChatModel) -> NodeCallable:
    """Return a researcher_node coroutine that captures model via closure."""

    async def researcher_node(state: GraphState) -> dict[str, Any]:
        plan_nodes: list[PlanNode] = state.get("plan_nodes", [])
        query: str = state.get("query", "")

        for node in plan_nodes:
            prompt = f"研究子任务: {node.title}. 基于查询: {query}. 请给出简要摘要。"
            await asyncio.wait_for(
                model.ainvoke([HumanMessage(content=prompt)]),
                timeout=_RESEARCHER_TIMEOUT_S,
            )

        # state update: researcher does not add new keys in T5
        return {}

    return researcher_node
