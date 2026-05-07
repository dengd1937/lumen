"""Application settings — pydantic-settings.

All required env vars must be present at startup; no silent defaults
for keys that affect external service access or local-state location.
Per ADR-0001 D5/D6 + project Python rules (no os.environ.get with default).

Security posture (per security-reviewer T5):
- DASHSCOPE_API_KEY uses `SecretStr`; `repr(settings)` masks the value.
  Callers must call `.get_secret_value()` to retrieve the raw string.
- `hide_input_in_errors=True` strips `input_value` from ValidationError
  output, preventing key echo on partial-config startup failures.
"""

from __future__ import annotations

from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Lumen API configuration.

    Loads from environment variables and (optionally) a `.env` file at
    the apps/api root. The `_env_file=None` constructor kwarg is used
    in tests to bypass file lookup and isolate against the real env.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
    )

    # Required — no default. Missing raises ValidationError at construction.
    # Wrapped in SecretStr so logger.info(settings) / Sentry breadcrumbs
    # cannot expose the raw key. Use `.get_secret_value()` at the
    # DashScope client construction site (T9).
    DASHSCOPE_API_KEY: SecretStr
    LUMEN_DB_PATH: str

    # Optional — default to "mock" so dev runs without a backend process.
    DATA_SOURCE: Literal["mock", "sse"] = "mock"
