"""FastAPI dependency providers.

`get_settings()` is `lru_cache`d so the env is parsed exactly once per
process (avoid re-reading on every request). Tests can call
`get_settings.cache_clear()` to force a fresh parse against monkeypatched
env vars.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

import aiosqlite

from app.core.config import Settings


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide Settings singleton.

    Construction reads `DASHSCOPE_API_KEY` and `LUMEN_DB_PATH` from the
    environment (or a `.env` file at apps/api root). Missing required
    vars raise `pydantic.ValidationError` at first call — the FastAPI
    app fails to start, by design.
    """
    return Settings()  # type: ignore[call-arg]


async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    """T9 implements this as the per-request DB connection dependency.

    CONTRACT (per code-reviewer T7 HIGH): every aiosqlite connection
    opened here MUST call `configure_connection(conn)` before any DML/
    DDL — `busy_timeout=5000` and `foreign_keys=ON` are PER-CONNECTION
    pragmas. The lifespan-time connection in main.py only persists the
    database-level WAL setting; per-request connections inherit WAL but
    NOT busy_timeout, so concurrent producer + replay tasks risk
    immediate `database is locked` errors without the explicit configure
    call.

    See `app/db/sqlite.py:configure_connection` for the contract.
    """
    raise NotImplementedError(
        "T9 implements get_db; T7 only exposes the placeholder + contract."
    )
    yield  # pragma: no cover  (unreachable; satisfies AsyncIterator type)
