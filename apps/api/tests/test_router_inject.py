"""T11a - inject_directive router tests (D-TM double guard + _parse_inject_directive).

Coverage:
- _is_test_request double guard logic (5 negative + 1 positive + 1 compare_digest spy)
- _parse_inject_directive parsing (9 unit tests + DOTALL multiline)
- _INJECT_DIRECTIVES cache TTL
- start_session integration path (prefix strip / no strip / DB storage)
"""

from __future__ import annotations

import secrets
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import aiosqlite
import pytest
from cachetools import TTLCache
from fastapi import Request
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.services.inject_directive import (
    InjectCloseAfterDirective,
    InjectErrorDirective,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clear_inject_cache() -> Iterator[None]:
    """T11: clear _INJECT_DIRECTIVES cache before/after each test to prevent cross-test pollution."""
    from app.routers import research as research_mod

    research_mod._INJECT_DIRECTIVES.clear()
    research_mod._IDEMPOTENCY_CACHE.clear()
    research_mod._IDEMPOTENCY_LOCKS.clear()
    yield
    research_mod._INJECT_DIRECTIVES.clear()
    research_mod._IDEMPOTENCY_CACHE.clear()
    research_mod._IDEMPOTENCY_LOCKS.clear()


def _make_settings(
    tmp_path: Path, *, testing_mode: bool = True, testing_token: str | None = "secret-token"
) -> Settings:
    """Helper: construct Settings without .env file lookup."""
    return Settings(
        _env_file=None,
        DASHSCOPE_API_KEY=SecretStr("test-key"),  # type: ignore[call-arg]
        LUMEN_DB_PATH=str(tmp_path / "t.db"),
        DASHSCOPE_BASE_URL="https://example.com",
        TESTING_MODE=testing_mode,
        TESTING_TOKEN=SecretStr(testing_token) if testing_token is not None else None,
    )


def _make_request(headers: list[tuple[bytes, bytes]]) -> Request:
    """Helper: build a minimal FastAPI Request with given headers."""
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/research/start",
        "headers": headers,
        "query_string": b"",
    }
    return Request(scope)


# ---------------------------------------------------------------------------
# _is_test_request tests
# ---------------------------------------------------------------------------


def test_is_test_request_returns_false_when_testing_mode_disabled(
    tmp_path: Path,
) -> None:
    """Guard 1 fail: TESTING_MODE=False -> always False regardless of token."""
    from app.routers.research import _is_test_request

    settings = _make_settings(tmp_path, testing_mode=False)
    request = _make_request([(b"x-lumen-test-token", b"secret-token")])
    assert _is_test_request(request, settings) is False


def test_is_test_request_returns_false_when_testing_token_unset(
    tmp_path: Path,
) -> None:
    """Guard 2 fail: TESTING_MODE=True but TESTING_TOKEN=None -> False."""
    from app.routers.research import _is_test_request

    settings = _make_settings(tmp_path, testing_token=None)
    request = _make_request([(b"x-lumen-test-token", b"any-token")])
    assert _is_test_request(request, settings) is False


def test_is_test_request_returns_false_when_header_missing(
    tmp_path: Path,
) -> None:
    """Guard 3 fail: header absent -> False."""
    from app.routers.research import _is_test_request

    settings = _make_settings(tmp_path)
    request = _make_request([])  # no X-Lumen-Test-Token
    assert _is_test_request(request, settings) is False


def test_is_test_request_returns_false_when_header_mismatched(
    tmp_path: Path,
) -> None:
    """Guard 4 fail: header present but wrong value -> False."""
    from app.routers.research import _is_test_request

    settings = _make_settings(tmp_path, testing_token="correct-secret")
    request = _make_request([(b"x-lumen-test-token", b"wrong-token")])
    assert _is_test_request(request, settings) is False


def test_is_test_request_returns_true_with_full_double_guard(
    tmp_path: Path,
) -> None:
    """All guards pass: TESTING_MODE=True + TESTING_TOKEN set + header matches -> True."""
    from app.routers.research import _is_test_request

    settings = _make_settings(tmp_path)
    request = _make_request([(b"x-lumen-test-token", b"secret-token")])
    assert _is_test_request(request, settings) is True


def test_is_test_request_uses_compare_digest_not_eq(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Timing attack prevention: secrets.compare_digest must be called (not plain ==)."""
    call_log: list[tuple[str, str]] = []
    original_compare = secrets.compare_digest

    def spy_compare(a: Any, b: Any) -> bool:
        call_log.append((str(a), str(b)))
        return original_compare(a, b)

    monkeypatch.setattr("app.routers.research.secrets.compare_digest", spy_compare)

    from app.routers.research import _is_test_request

    settings = _make_settings(tmp_path)
    request = _make_request([(b"x-lumen-test-token", b"secret-token")])

    result = _is_test_request(request, settings)
    assert result is True
    assert len(call_log) >= 1, "secrets.compare_digest was never called"


# ---------------------------------------------------------------------------
# _parse_inject_directive tests
# ---------------------------------------------------------------------------


def test_parse_inject_close_after_extracts_n_and_clean_query() -> None:
    """Basic prefix: __inject_close_after:3__my query -> (Directive(3), 'my query')."""
    from app.routers.research import _parse_inject_directive

    directive, clean = _parse_inject_directive("__inject_close_after:3__my query")
    assert isinstance(directive, InjectCloseAfterDirective)
    assert directive.n == 3
    assert clean == "my query"


def test_parse_inject_close_after_n_at_lower_bound_1() -> None:
    """N=1 is valid lower bound."""
    from app.routers.research import _parse_inject_directive

    directive, clean = _parse_inject_directive("__inject_close_after:1__test")
    assert isinstance(directive, InjectCloseAfterDirective)
    assert directive.n == 1
    assert clean == "test"


def test_parse_inject_close_after_n_at_upper_bound_100() -> None:
    """N=100 is valid upper bound."""
    from app.routers.research import _parse_inject_directive

    directive, clean = _parse_inject_directive("__inject_close_after:100__test")
    assert isinstance(directive, InjectCloseAfterDirective)
    assert directive.n == 100
    assert clean == "test"


def test_parse_inject_close_after_n_above_100_returns_none_unchanged() -> None:
    """N=101 out of bound -> (None, original_query) treated as malformed."""
    from app.routers.research import _parse_inject_directive

    original = "__inject_close_after:101__test"
    directive, clean = _parse_inject_directive(original)
    assert directive is None
    assert clean == original


def test_parse_inject_close_after_n_999_returns_none_unchanged() -> None:
    """N=999: three-digit value matches regex but exceeds upper bound 100 -> (None, original) treated as malformed."""
    from app.routers.research import _parse_inject_directive

    original = "__inject_close_after:999__test"
    directive, clean = _parse_inject_directive(original)
    assert directive is None
    assert clean == original


def test_parse_inject_close_after_n_zero_returns_none() -> None:
    """N=0: regex accepts but 1 <= 0 is False -> (None, original)."""
    from app.routers.research import _parse_inject_directive

    original = "__inject_close_after:0__test"
    directive, clean = _parse_inject_directive(original)
    assert directive is None
    assert clean == original


def test_parse_inject_close_after_malformed_no_prefix_returns_none() -> None:
    """No prefix -> (None, original_query)."""
    from app.routers.research import _parse_inject_directive

    original = "just a normal query"
    directive, clean = _parse_inject_directive(original)
    assert directive is None
    assert clean == original


def test_parse_inject_close_after_malformed_partial_returns_none() -> None:
    """Partial prefix with non-digit N -> regex no match -> (None, original)."""
    from app.routers.research import _parse_inject_directive

    original = "__inject_close_after:abc__test"
    directive, clean = _parse_inject_directive(original)
    assert directive is None
    assert clean == original


def test_parse_inject_close_after_with_multiline_query_dotall_works() -> None:
    """DOTALL flag: clean_query can contain newlines after the prefix."""
    from app.routers.research import _parse_inject_directive

    query = "__inject_close_after:2__test\nsecond line"
    directive, clean = _parse_inject_directive(query)
    assert isinstance(directive, InjectCloseAfterDirective)
    assert directive.n == 2
    assert clean == "test\nsecond line"


def test_parse_inject_close_after_empty_clean_query() -> None:
    """Prefix complete + empty clean_query -> (Directive(5), '')."""
    from app.routers.research import _parse_inject_directive

    directive, clean = _parse_inject_directive("__inject_close_after:5__")
    assert isinstance(directive, InjectCloseAfterDirective)
    assert directive.n == 5
    assert clean == ""


def test_parse_inject_error_extracts_clean_query() -> None:
    """__inject_error__ prefix -> (InjectErrorDirective(), clean_query)."""
    from app.routers.research import _parse_inject_directive

    directive, clean = _parse_inject_directive("__inject_error__real query here")
    assert isinstance(directive, InjectErrorDirective)
    assert clean == "real query here"


def test_parse_no_prefix_returns_none_and_query_unchanged() -> None:
    """No inject prefix -> (None, query)."""
    from app.routers.research import _parse_inject_directive

    original = "what is the capital of France?"
    directive, clean = _parse_inject_directive(original)
    assert directive is None
    assert clean == original


# ---------------------------------------------------------------------------
# _INJECT_DIRECTIVES cache TTL test
# ---------------------------------------------------------------------------


def test_inject_directives_cache_ttl_300s() -> None:
    """_INJECT_DIRECTIVES TTLCache should have TTL=300 and maxsize=1024."""
    from app.routers import research as research_mod

    cache = research_mod._INJECT_DIRECTIVES
    assert isinstance(cache, TTLCache)
    assert cache.maxsize == 1024
    assert cache.ttl == 300.0


# ---------------------------------------------------------------------------
# Integration: start_session with inject directive
# ---------------------------------------------------------------------------


def test_start_session_with_test_request_strips_prefix_and_stores_directive(
    env_settings: Path,
) -> None:
    """POST /start with valid test token + inject_close_after prefix:
    - returns 201
    - _INJECT_DIRECTIVES[session_id] == InjectCloseAfterDirective(n=2)
    """
    from app.routers import research as research_mod
    from main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/research/start",
            json={"query": "__inject_close_after:2__test query"},
            headers={"X-Lumen-Test-Token": "test-token-fixture-secret"},
        )

    assert r.status_code == 201
    session_id = r.json()["session_id"]

    directive = research_mod._INJECT_DIRECTIVES.get(session_id)
    assert isinstance(directive, InjectCloseAfterDirective), (
        f"Expected InjectCloseAfterDirective, got {directive!r}"
    )
    assert directive.n == 2


def test_start_session_without_test_request_passes_query_unchanged_no_directive(
    env_settings: Path,
) -> None:
    """POST /start without X-Lumen-Test-Token: query unchanged, no directive stored."""
    from app.routers import research as research_mod
    from main import app

    original_query = "__inject_close_after:2__should not strip"

    with TestClient(app) as client:
        r = client.post(
            "/api/research/start",
            json={"query": original_query},
            # deliberately omit X-Lumen-Test-Token
        )

    assert r.status_code == 201
    session_id = r.json()["session_id"]

    assert research_mod._INJECT_DIRECTIVES.get(session_id) is None


@pytest.mark.asyncio
async def test_start_session_test_request_query_persisted_clean_to_db(
    env_settings: Path,
) -> None:
    """POST /start with valid test token: DB query column stores clean_query (no prefix)."""
    from main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/research/start",
            json={"query": "__inject_close_after:3__clean content"},
            headers={"X-Lumen-Test-Token": "test-token-fixture-secret"},
        )

    assert r.status_code == 201
    session_id = r.json()["session_id"]

    async with aiosqlite.connect(str(env_settings)) as conn:
        cur = await conn.execute(
            "SELECT query FROM lumen_research_sessions WHERE id = ?",
            (session_id,),
        )
        row = await cur.fetchone()

    assert row is not None
    assert row[0] == "clean content", (
        f"DB should store clean_query 'clean content', got: {row[0]!r}"
    )


@pytest.mark.asyncio
async def test_start_session_without_token_prefix_literal_in_db(
    env_settings: Path,
) -> None:
    """POST /start without test token: DB stores original prefixed query verbatim."""
    from main import app

    original_query = "__inject_close_after:2__test"

    with TestClient(app) as client:
        r = client.post(
            "/api/research/start",
            json={"query": original_query},
            # no test token
        )

    assert r.status_code == 201
    session_id = r.json()["session_id"]

    async with aiosqlite.connect(str(env_settings)) as conn:
        cur = await conn.execute(
            "SELECT query FROM lumen_research_sessions WHERE id = ?",
            (session_id,),
        )
        row = await cur.fetchone()

    stored = row[0] if row else None
    assert stored == original_query, (
        f"Without test token, DB should store original query, got: {stored!r}"
    )


# ---------------------------------------------------------------------------
# T12a RED — start_session forwards directive to session_manager
# ---------------------------------------------------------------------------


def test_post_start_forwards_inject_error_directive_to_session_manager(
    env_settings: Path,
) -> None:
    """T12a RED: POST /start with __inject_error__ prefix + test token calls
    session_manager.start_session(inject_directive=InjectErrorDirective())."""
    from unittest.mock import AsyncMock, patch

    from main import app

    with (
        TestClient(app) as client,
        patch.object(
            app.state.session_manager,
            "start_session",
            new_callable=AsyncMock,
        ) as mock_start,
    ):
        r = client.post(
            "/api/research/start",
            json={"query": "__inject_error__real query"},
            headers={"X-Lumen-Test-Token": "test-token-fixture-secret"},
        )

    assert r.status_code == 201
    assert mock_start.called, "session_manager.start_session should have been called"
    call_kwargs = mock_start.call_args.kwargs
    assert "inject_directive" in call_kwargs, (
        f"inject_directive kwarg missing; call_kwargs={call_kwargs}"
    )
    assert isinstance(call_kwargs["inject_directive"], InjectErrorDirective), (
        f"Expected InjectErrorDirective, got {call_kwargs['inject_directive']!r}"
    )


def test_post_start_forwards_inject_close_after_directive_to_session_manager(
    env_settings: Path,
) -> None:
    """T12a RED: POST /start with __inject_close_after:3__ prefix + test token calls
    session_manager.start_session(inject_directive=InjectCloseAfterDirective(n=3))."""
    from unittest.mock import AsyncMock, patch

    from main import app

    with (
        TestClient(app) as client,
        patch.object(
            app.state.session_manager,
            "start_session",
            new_callable=AsyncMock,
        ) as mock_start,
    ):
        r = client.post(
            "/api/research/start",
            json={"query": "__inject_close_after:3__real query"},
            headers={"X-Lumen-Test-Token": "test-token-fixture-secret"},
        )

    assert r.status_code == 201
    assert mock_start.called, "session_manager.start_session should have been called"
    call_kwargs = mock_start.call_args.kwargs
    assert "inject_directive" in call_kwargs, (
        f"inject_directive kwarg missing; call_kwargs={call_kwargs}"
    )
    assert isinstance(call_kwargs["inject_directive"], InjectCloseAfterDirective), (
        f"Expected InjectCloseAfterDirective, got {call_kwargs['inject_directive']!r}"
    )
    assert call_kwargs["inject_directive"].n == 3


def test_post_start_forwards_none_when_no_test_request(
    env_settings: Path,
) -> None:
    """T12a RED: POST /start without X-Lumen-Test-Token header calls
    session_manager.start_session(inject_directive=None)."""
    from unittest.mock import AsyncMock, patch

    from main import app

    with (
        TestClient(app) as client,
        patch.object(
            app.state.session_manager,
            "start_session",
            new_callable=AsyncMock,
        ) as mock_start,
    ):
        r = client.post(
            "/api/research/start",
            json={"query": "__inject_error__prefixed but no token"},
            # deliberately omit X-Lumen-Test-Token
        )

    assert r.status_code == 201
    assert mock_start.called
    call_kwargs = mock_start.call_args.kwargs
    assert "inject_directive" in call_kwargs, (
        f"inject_directive kwarg missing; call_kwargs={call_kwargs}"
    )
    assert call_kwargs["inject_directive"] is None, (
        f"Without test token, inject_directive must be None, got: {call_kwargs['inject_directive']!r}"
    )
