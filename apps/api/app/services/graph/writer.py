"""Writer node — streams report tokens from the LLM.

Calls model.astream with a synthesis prompt; accumulates each chunk's
content into report_chunks. The SSE routing layer emits ReportChunkEvent
for each on_chat_model_stream event it observes.
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

_WRITER_TIMEOUT_S = 120  # D12.3 派生约束 (与 researcher 一致)


def writer_node_factory(model: BaseChatModel) -> NodeCallable:
    """Return a writer_node coroutine that captures model via closure."""

    async def writer_node(state: GraphState) -> dict[str, Any]:
        query: str = state.get("query", "")
        plan_nodes: list[PlanNode] = state.get("plan_nodes", [])

        plan_text = "; ".join(n.title for n in plan_nodes)
        prompt = (
            f"基于研究计划 [{plan_text}], 为查询「{query}」撰写综合研究报告. "
            "使用 Markdown 格式, 包含核心结论和详细分析."
        )

        report_chunks: list[str] = []
        async with asyncio.timeout(_WRITER_TIMEOUT_S):
            async for chunk in model.astream([HumanMessage(content=prompt)]):
                content = chunk.content
                if content and isinstance(content, str):
                    report_chunks.append(content)

        return {"report_chunks": report_chunks}

    return writer_node
