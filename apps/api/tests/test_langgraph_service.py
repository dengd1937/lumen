"""T4 -- LangGraphService skeleton + from_settings factory + interface signature validation."""

from __future__ import annotations

import asyncio
import inspect

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from app.core.config import Settings
from app.models.events import ErrorEvent
from app.services.langgraph_service import LangGraphService, LangGraphStub


def test_langgraph_service_init_accepts_base_chat_model() -> None:
    """Constructor accepts a BaseChatModel instance + db_path without error."""
    service = LangGraphService(model=FakeListChatModel(responses=[]), db_path=":memory:")
    assert service is not None


def test_langgraph_service_from_settings_constructs(monkeypatch: pytest.MonkeyPatch) -> None:
    """from_settings(settings) builds model via init_chat_model (mocked to avoid DashScope)."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setenv("LUMEN_DB_PATH", ":memory:")
    monkeypatch.setenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    # Mock init_chat_model to avoid real DashScope HTTP calls.
    monkeypatch.setattr(
        "app.services.langgraph_service.init_chat_model",
        lambda **kwargs: FakeListChatModel(responses=[]),
    )
    service = LangGraphService.from_settings(settings)
    assert service is not None


def test_langgraph_service_astream_events_signature() -> None:
    """astream_events signature: (session_id, query, *, inject_directive=None)."""
    sig = inspect.signature(LangGraphService.astream_events)
    params = sig.parameters
    assert "session_id" in params
    assert "query" in params
    assert "inject_directive" in params
    # inject_directive must be keyword-only
    assert params["inject_directive"].kind == inspect.Parameter.KEYWORD_ONLY
    # inject_directive default must be None
    assert params["inject_directive"].default is None


def test_langgraph_stub_accepts_inject_directive_kwarg() -> None:
    """NN1: LangGraphStub.astream_events also accepts inject_directive=None (interface homogeneity)."""
    stub_sig = inspect.signature(LangGraphStub.astream_events)
    assert "query" in stub_sig.parameters
    assert "inject_directive" in stub_sig.parameters


@pytest.mark.asyncio
async def test_langgraph_service_astream_events_full_cycle() -> None:
    """T5: astream_events yields a complete event cycle via the three-node graph.

    Uses FakeListChatModel to avoid LLM calls. Assertions per plan T5:
      - first event type == "plan_created"
      - sequence contains >=1 "node_started" + >=1 "node_completed"
      - sequence contains >=1 "report_chunk"
      - last event type == "done"
    """
    # FakeListChatModel returns one fixed string per ainvoke/astream call.
    # Each node makes one LLM call: planner skips LLM (D10.3 降级),
    # researcher calls ainvoke (1 response), writer calls astream (1 response).
    fake_responses = [
        "researcher result",  # researcher ainvoke
        "## 核心结论\n\nFake writer content.",  # writer astream
    ]
    service = LangGraphService(
        model=FakeListChatModel(responses=fake_responses),
        db_path=":memory:",
    )

    events = [ev async for ev in service.astream_events("ses-12345678", "test query")]

    types = [ev.type for ev in events]
    assert types[0] == "plan_created", f"First event must be plan_created, got {types}"
    assert "node_started" in types, f"Must have node_started, got {types}"
    assert "node_completed" in types, f"Must have node_completed, got {types}"
    assert "report_chunk" in types, f"Must have report_chunk, got {types}"
    assert types[-1] == "done", f"Last event must be done, got {types}"


@pytest.mark.asyncio
async def test_planner_node_yields_plan_created_event() -> None:
    """plan T5 RED: planner 节点 yield 第一个 plan_created 事件。"""
    service = LangGraphService(
        model=FakeListChatModel(responses=["x", "x"]),
        db_path=":memory:",
    )
    events = [ev async for ev in service.astream_events("ses-12345678", "q")]
    assert events[0].type == "plan_created"


@pytest.mark.asyncio
async def test_researcher_node_yields_node_started_progress_completed() -> None:
    """plan T5 RED: researcher 节点 yield node_started + node_completed 序列。"""
    service = LangGraphService(
        model=FakeListChatModel(responses=["x", "x"]),
        db_path=":memory:",
    )
    types = [ev.type async for ev in service.astream_events("ses-12345678", "q")]
    assert "node_started" in types
    assert "node_completed" in types
    # 顺序验证: node_started 先于 node_completed
    assert types.index("node_started") < types.index("node_completed")


@pytest.mark.asyncio
async def test_writer_node_yields_report_chunk_sequence() -> None:
    """plan T5 RED: writer 节点 yield >=1 个 report_chunk 事件。"""
    service = LangGraphService(
        model=FakeListChatModel(responses=["x", "report_content"]),
        db_path=":memory:",
    )
    types = [ev.type async for ev in service.astream_events("ses-12345678", "q")]
    assert types.count("report_chunk") >= 1


# ---------------------------------------------------------------------------
# T6 RED — ErrorEvent path + asyncio.timeout fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_llm_exception_yields_error_event_then_stops() -> None:
    """T6 RED: LangGraph node raises RuntimeError -> yield ErrorEvent -> generator exits cleanly (no raise)."""

    class FailingModel(FakeListChatModel):
        async def ainvoke(self, *args: object, **kwargs: object) -> object:  # type: ignore[override]
            raise RuntimeError("simulated LLM failure")

    service = LangGraphService(
        model=FailingModel(responses=["x"]),
        db_path=":memory:",
    )
    events = [ev async for ev in service.astream_events("ses-12345678", "q")]

    error_events = [ev for ev in events if isinstance(ev, ErrorEvent)]
    assert len(error_events) >= 1
    assert (
        "RuntimeError" in error_events[-1].message
        or "runtimeerror" in error_events[-1].message.lower()
    )


@pytest.mark.asyncio
async def test_asyncio_timeout_yields_error_event(monkeypatch: pytest.MonkeyPatch) -> None:
    """T6 RED: asyncio.timeout injected -> yield ErrorEvent (message contains 'timeout')."""
    monkeypatch.setattr("app.services.graph.researcher._RESEARCHER_TIMEOUT_S", 0.001)

    class SlowModel(FakeListChatModel):
        async def ainvoke(self, *args: object, **kwargs: object) -> object:  # type: ignore[override]
            # Sleep longer than the injected timeout (0.001s) so asyncio.wait_for
            # raises TimeoutError before this coroutine completes.
            await asyncio.sleep(1.0)
            raise AssertionError("unreachable — timeout should fire first")

    service = LangGraphService(model=SlowModel(responses=["x"]), db_path=":memory:")
    events = [ev async for ev in service.astream_events("ses-12345678", "q")]

    error_events = [ev for ev in events if isinstance(ev, ErrorEvent)]
    assert len(error_events) >= 1
    assert (
        "TimeoutError" in error_events[-1].message
        or "timeouterror" in error_events[-1].message.lower()
    )


@pytest.mark.asyncio
async def test_error_event_carries_session_id() -> None:
    """T6 RED: ErrorEvent.session_id 等于传入的 session_id。"""

    class FailingModel(FakeListChatModel):
        async def ainvoke(self, *args: object, **kwargs: object) -> object:  # type: ignore[override]
            raise RuntimeError("boom")

    sid = "ses-87654321"
    service = LangGraphService(model=FailingModel(responses=["x"]), db_path=":memory:")
    events = [ev async for ev in service.astream_events(sid, "q")]

    error_events = [ev for ev in events if isinstance(ev, ErrorEvent)]
    assert len(error_events) >= 1
    assert error_events[-1].session_id == sid
