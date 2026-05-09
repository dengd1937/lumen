"""Shared pytest fixtures.

Per T5 code-reviewer defer: provide a centralised env+Settings fixture
so router-level integration tests don't each duplicate the
`monkeypatch.setenv + get_settings.cache_clear()` dance.

T3: also exposes `initialized_db` (async) fixture for SessionManager tests
so both test_session_lifecycle.py and test_research_router.py can use it.

M1.A T7: exposes `fake_session_manager` fixture (SDec-4 v2) that replaces
app.state.session_manager with a FakeListChatModel-backed instance,
avoiding real DashScope HTTP calls in integration tests.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import aiosqlite
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from app.core.deps import get_settings
from app.db.sqlite import init_db
from app.services.session_manager import SessionManager


@pytest.fixture
def env_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[Path]:
    """Set required env vars to test-only values, isolate Settings cache.

    Yields the temp DB path so tests can introspect the file directly
    after lifespan has run init_db.

    H3: also clears _load_demo_session lru_cache on setup and teardown so
    per-test monkeypatching of _DEMO_FIXTURE_PATH is honored (otherwise the
    lru_cache returns a stale fixture from a prior test).
    """
    from app.routers.research import _load_demo_session

    db_path = tmp_path / "test_lumen.db"
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-conftest-1234")
    monkeypatch.setenv("LUMEN_DB_PATH", str(db_path))
    # T1 v2.3 - add 4 new fields so other test modules can obtain Settings consistently
    monkeypatch.setenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setenv("LLM_MODEL", "qwen-max")
    monkeypatch.setenv("TESTING_MODE", "true")  # plan v2.1 conftest convention
    monkeypatch.setenv("TESTING_TOKEN", "test-token-fixture-secret")
    get_settings.cache_clear()
    _load_demo_session.cache_clear()
    yield db_path
    get_settings.cache_clear()
    _load_demo_session.cache_clear()


@pytest_asyncio.fixture
async def initialized_db(tmp_path: Path) -> AsyncIterator[Path]:
    """Async fixture: create and initialise a temp SQLite DB for SessionManager tests.

    Shared across test_session_lifecycle.py and test_research_router.py.
    """
    db_path = tmp_path / "test_t9.db"
    async with aiosqlite.connect(str(db_path)) as conn:
        await init_db(conn)
    yield db_path


@pytest.fixture
def patch_init_chat_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch init_chat_model so lifespan startup uses FakeListChatModel (no real DashScope HTTP)."""
    monkeypatch.setattr(
        "app.services.langgraph_service.init_chat_model",
        lambda **kwargs: FakeListChatModel(responses=[]),
    )


@pytest.fixture
def fake_session_manager(
    env_settings: Path,
    patch_init_chat_model: None,
) -> Iterator[SessionManager]:
    """**Returns the lifespan-created SessionManager** (not a mock object); its underlying
    LangGraphService uses FakeListChatModel.

    T7 SDec-4 v2 (Codex HIGH #1): uses standard `with TestClient(app)` context manager so
    lifespan enter/exit is guaranteed even if the body raises. The monkeypatched
    init_chat_model (via `patch_init_chat_model`) ensures LangGraphService uses
    FakeListChatModel — no real DashScope HTTP calls are triggered.

    Fixture sequence:
      1. env_settings monkeypatches DASHSCOPE_BASE_URL/LLM_MODEL etc. (with cache clear)
      2. patch_init_chat_model patches init_chat_model -> FakeListChatModel
      3. TestClient `with` block enters lifespan; LangGraphService.from_settings gets fake model
      4. yield app.state.session_manager (real lifespan-created instance, no race)
      5. TestClient `with` block exits: lifespan finally handles cleanup, monkeypatch restores
    """
    from main import app

    with TestClient(app):
        yield app.state.session_manager
