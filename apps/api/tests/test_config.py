"""T5 — Settings (pydantic-settings) tests.

Per ADR-0001 D6 + project Python rules: required env vars must fail
fast at startup. No silent defaults for keys that affect external
service access (DASHSCOPE_API_KEY) or local-state location (LUMEN_DB_PATH).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.deps import get_settings

# ---------------------------------------------------------------------------
# RED 1 — DASHSCOPE_API_KEY required
# ---------------------------------------------------------------------------


def test_settings_missing_dashscope_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ADR-0001 D6: DASHSCOPE_API_KEY drives DashScope LLM access. Missing
    at startup is a fatal config error — no silent fallback."""
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    monkeypatch.setenv("LUMEN_DB_PATH", "/tmp/lumen-test.db")

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)  # type: ignore[call-arg]
    assert "DASHSCOPE_API_KEY" in str(exc_info.value)


# ---------------------------------------------------------------------------
# RED 2 — LUMEN_DB_PATH required (no default)
# ---------------------------------------------------------------------------


def test_settings_missing_db_path_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ADR-0001 D5: SQLite path is deployment-specific. Missing fails fast."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-1234")
    monkeypatch.delenv("LUMEN_DB_PATH", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)  # type: ignore[call-arg]
    assert "LUMEN_DB_PATH" in str(exc_info.value)


# ---------------------------------------------------------------------------
# RED 3 — Both env vars present → Settings constructs cleanly
# ---------------------------------------------------------------------------


def test_settings_constructs_with_required_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-1234")
    monkeypatch.setenv("LUMEN_DB_PATH", "/tmp/lumen-test.db")

    s = Settings(_env_file=None)  # type: ignore[call-arg]
    # SecretStr equality requires .get_secret_value() — bare comparison
    # would always fail (`SecretStr("x") != "x"`).
    assert s.DASHSCOPE_API_KEY.get_secret_value() == "test-key-1234"
    assert s.LUMEN_DB_PATH == "/tmp/lumen-test.db"
    # DATA_SOURCE has a Literal default of "mock" (matches frontend default).
    assert s.DATA_SOURCE == "mock"


# ---------------------------------------------------------------------------
# RED 4 — DATA_SOURCE Literal validation
# ---------------------------------------------------------------------------


def test_data_source_literal_accepts_mock_and_sse(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-1234")
    monkeypatch.setenv("LUMEN_DB_PATH", "/tmp/lumen-test.db")

    monkeypatch.setenv("DATA_SOURCE", "mock")
    assert Settings(_env_file=None).DATA_SOURCE == "mock"  # type: ignore[call-arg]

    monkeypatch.setenv("DATA_SOURCE", "sse")
    assert Settings(_env_file=None).DATA_SOURCE == "sse"  # type: ignore[call-arg]


def test_data_source_defaults_to_mock_when_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Default safety: an undeclared DATA_SOURCE must fall back to "mock"
    so dev runs without a backend process. Explicit guard against future
    test ordering issues that would otherwise let an ambient env value
    mask the default."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-1234")
    monkeypatch.setenv("LUMEN_DB_PATH", "/tmp/lumen-test.db")
    monkeypatch.delenv("DATA_SOURCE", raising=False)

    s = Settings(_env_file=None)  # type: ignore[call-arg]
    assert s.DATA_SOURCE == "mock"


def test_data_source_literal_rejects_other_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-1234")
    monkeypatch.setenv("LUMEN_DB_PATH", "/tmp/lumen-test.db")
    monkeypatch.setenv("DATA_SOURCE", "bogus")

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)  # type: ignore[call-arg]
    assert "DATA_SOURCE" in str(exc_info.value)


# ---------------------------------------------------------------------------
# RED 5 — get_settings is lru_cached (same instance returned)
# ---------------------------------------------------------------------------


def test_get_settings_caches_instance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """FastAPI dependency: get_settings() must return a single shared
    instance across requests (avoid re-parsing env per request)."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-1234")
    monkeypatch.setenv("LUMEN_DB_PATH", "/tmp/lumen-test.db")

    # Reset cache so this test sees current env.
    get_settings.cache_clear()
    a = get_settings()
    b = get_settings()
    assert a is b
    get_settings.cache_clear()  # leave clean state for other tests


# ---------------------------------------------------------------------------
# Security regression guards (per security-reviewer T5)
# ---------------------------------------------------------------------------


def test_repr_does_not_leak_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SecretStr regression guard: repr/str must not expose the raw key.
    Any code path calling logger.info(settings) / Sentry breadcrumbs /
    print(settings) MUST see a masked value."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "real-secret-shouldnotleak-9999")
    monkeypatch.setenv("LUMEN_DB_PATH", "/tmp/lumen-test.db")
    s = Settings(_env_file=None)  # type: ignore[call-arg]

    rendered = f"{s!r} {s!s}"
    assert "real-secret-shouldnotleak-9999" not in rendered
    # Sanity: the field is still accessible via explicit unwrap.
    assert s.DASHSCOPE_API_KEY.get_secret_value() == "real-secret-shouldnotleak-9999"


def test_validation_error_does_not_leak_partial_input(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """hide_input_in_errors regression guard: ValidationError must not
    embed the input dict (which contains successfully-parsed fields like
    DASHSCOPE_API_KEY) when raising over a different missing field."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "real-secret-validateleak-1234")
    monkeypatch.delenv("LUMEN_DB_PATH", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)  # type: ignore[call-arg]
    err_text = str(exc_info.value)
    assert "real-secret-validateleak-1234" not in err_text
    # The missing field name itself is fine to surface.
    assert "LUMEN_DB_PATH" in err_text
