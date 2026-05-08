"""Shared pytest fixtures.

Per T5 code-reviewer defer: provide a centralised env+Settings fixture
so router-level integration tests don't each duplicate the
`monkeypatch.setenv + get_settings.cache_clear()` dance.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from app.core.deps import get_settings


@pytest.fixture
def env_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[Path]:
    """Set required env vars to test-only values, isolate Settings cache.

    Yields the temp DB path so tests can introspect the file directly
    after lifespan has run init_db.
    """
    db_path = tmp_path / "test_lumen.db"
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-conftest-1234")
    monkeypatch.setenv("LUMEN_DB_PATH", str(db_path))
    get_settings.cache_clear()
    yield db_path
    get_settings.cache_clear()
