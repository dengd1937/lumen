"""T7C -- e2e webServer regression fix: LUMEN_USE_STUB env switch tests.

Verifies that lifespan selects LangGraphStub (e2e/dev) or LangGraphService
(production) based on the LUMEN_USE_STUB environment variable.

Follows the env_settings + patch_init_chat_model fixture pattern from conftest.py.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_settings
from app.services.langgraph_service import LangGraphService, LangGraphStub


class TestSettingsLumenUseStubDefault:
    """Settings.LUMEN_USE_STUB default value -- production safety guarantee."""

    def test_settings_lumen_use_stub_default_false(
        self,
        env_settings: object,  # conftest fixture: sets required env vars
    ) -> None:
        """Settings() defaults LUMEN_USE_STUB to False when env var is not set (production safety)."""
        settings = get_settings()
        assert settings.LUMEN_USE_STUB is False


class TestLifespanStubToggle:
    """lifespan selects LangGraphStub / LangGraphService based on LUMEN_USE_STUB."""

    def test_lifespan_uses_stub_when_lumen_use_stub_set(
        self,
        monkeypatch: pytest.MonkeyPatch,
        env_settings: object,
    ) -> None:
        """LUMEN_USE_STUB=true -> app.state.langgraph_service is a LangGraphStub instance."""
        monkeypatch.setenv("LUMEN_USE_STUB", "true")
        # env_settings fixture's cache_clear runs before yield; after setenv we must
        # clear again so the new env var takes effect.
        get_settings.cache_clear()

        from main import app

        with TestClient(app):
            service = app.state.langgraph_service
            assert isinstance(service, LangGraphStub), (
                f"Expected LangGraphStub, got {type(service).__name__}"
            )

    def test_lifespan_uses_real_service_when_lumen_use_stub_unset(
        self,
        env_settings: object,
        patch_init_chat_model: None,
    ) -> None:
        """LUMEN_USE_STUB unset (default False) -> app.state.langgraph_service is LangGraphService."""
        from main import app

        with TestClient(app):
            service = app.state.langgraph_service
            assert isinstance(service, LangGraphService), (
                f"Expected LangGraphService, got {type(service).__name__}"
            )

    def test_lifespan_stub_emits_full_cycle(
        self,
        monkeypatch: pytest.MonkeyPatch,
        env_settings: object,
    ) -> None:
        """LUMEN_USE_STUB=true -> stub._emit_full_cycle is True (e2e SSE-4 full event sequence)."""
        monkeypatch.setenv("LUMEN_USE_STUB", "true")
        # env_settings fixture's cache_clear runs before yield; after setenv we must
        # clear again so the new env var takes effect.
        get_settings.cache_clear()

        from main import app

        with TestClient(app):
            service = app.state.langgraph_service
            assert isinstance(service, LangGraphStub)
            assert service._emit_full_cycle is True, (
                "stub must be initialized with emit_full_cycle=True "
                "so e2e SSE-4 spec can see report_chunk + done events"
            )
