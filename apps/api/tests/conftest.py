"""Shared pytest fixtures.

Per T5 code-reviewer defer: provide a centralised env+Settings fixture
so router-level integration tests don't each duplicate the
`monkeypatch.setenv + get_settings.cache_clear()` dance.

T3: also exposes `initialized_db` (async) fixture for SessionManager tests
so both test_session_lifecycle.py and test_research_router.py can use it.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import aiosqlite
import pytest
import pytest_asyncio

from app.core.deps import get_settings
from app.db.sqlite import init_db


@pytest.fixture
def env_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[Path]:
    """Set required env vars to test-only values, isolate Settings cache.

    Yields the temp DB path so tests can introspect the file directly
    after lifespan has run init_db.
    """
    db_path = tmp_path / "test_lumen.db"
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-conftest-1234")
    monkeypatch.setenv("LUMEN_DB_PATH", str(db_path))
    # T1 v2.3 - add 4 new fields so other test modules can obtain Settings consistently
    monkeypatch.setenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setenv("LLM_MODEL", "qwen-max")
    monkeypatch.setenv("TESTING_MODE", "true")  # plan v2.1 conftest convention
    monkeypatch.setenv("TESTING_TOKEN", "test-token-fixture-secret")
    get_settings.cache_clear()
    yield db_path
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def initialized_db(tmp_path: Path) -> AsyncIterator[Path]:
    """Async fixture: create and initialise a temp SQLite DB for SessionManager tests.

    Shared across test_session_lifecycle.py and test_research_router.py.
    """
    db_path = tmp_path / "test_t9.db"
    async with aiosqlite.connect(str(db_path)) as conn:
        await init_db(conn)
    yield db_path
