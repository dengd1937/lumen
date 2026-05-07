"""FastAPI dependency providers.

`get_settings()` is `lru_cache`d so the env is parsed exactly once per
process (avoid re-reading on every request). Tests can call
`get_settings.cache_clear()` to force a fresh parse against monkeypatched
env vars.
"""

from __future__ import annotations

from functools import lru_cache

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
