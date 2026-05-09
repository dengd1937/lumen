"""T4 -- LangGraphService skeleton + from_settings factory + interface signature validation."""

from __future__ import annotations

import inspect

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from app.core.config import Settings
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
async def test_langgraph_service_astream_events_yields_empty_skeleton() -> None:
    """T4 skeleton phase: astream_events yields nothing (T5 fills in three-node logic)."""
    service = LangGraphService(model=FakeListChatModel(responses=[]), db_path=":memory:")
    events = [ev async for ev in service.astream_events("test-session", "test query")]
    assert events == []  # T4 skeleton -- no events; T5 fills this in
