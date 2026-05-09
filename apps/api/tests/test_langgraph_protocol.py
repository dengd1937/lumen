"""T4 -- LangGraphProtocol runtime_checkable + Stub/Service interface homogeneity."""

from __future__ import annotations

from app.services.inject_directive import (
    InjectCloseAfterDirective,
    InjectErrorDirective,
)
from app.services.langgraph_protocol import LangGraphProtocol
from app.services.langgraph_service import LangGraphService, LangGraphStub


def test_langgraph_protocol_runtime_checkable() -> None:
    """LangGraphProtocol must be decorated with @runtime_checkable."""
    # @runtime_checkable sets _is_runtime_protocol = True on the Protocol class.
    assert getattr(LangGraphProtocol, "_is_runtime_protocol", False) is True


def test_langgraph_stub_satisfies_protocol() -> None:
    """LangGraphStub must satisfy the LangGraphProtocol interface (duck typing)."""
    stub = LangGraphStub()
    assert isinstance(stub, LangGraphProtocol)


def test_langgraph_service_satisfies_protocol() -> None:
    """LangGraphService must satisfy the LangGraphProtocol interface."""
    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    service = LangGraphService(model=FakeListChatModel(responses=[]), db_path=":memory:")
    assert isinstance(service, LangGraphProtocol)


def test_inject_directive_close_after_construction() -> None:
    d = InjectCloseAfterDirective(n=3)
    assert d.n == 3


def test_inject_directive_error_construction() -> None:
    d = InjectErrorDirective()
    assert isinstance(d, InjectErrorDirective)
