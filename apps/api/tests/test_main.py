"""T7 — FastAPI app wiring tests.

Per ADR-0002 D8.1 + Codex H3: CORS must be split-tested for OPTIONS
preflight, GET response exposure, and lifespan side effects (init_db).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# RED 1 — health endpoint smoke
# ---------------------------------------------------------------------------


def test_health_returns_ok(env_settings: Path) -> None:
    # Deferred import so the env_settings fixture has cleared the
    # get_settings lru_cache + monkeypatched required env vars BEFORE
    # `from main import app` triggers any settings access. Top-level
    # imports would fail with ValidationError or poison the cache.
    from main import app

    with TestClient(app) as client:
        r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# RED 2 — CORS OPTIONS preflight allows Last-Event-ID
# ---------------------------------------------------------------------------


def test_cors_options_preflight_allow_last_event_id(env_settings: Path) -> None:
    """Codex H3: browser EventSource auto-reconnect sends `Last-Event-ID`
    in the request. CORS preflight must declare this header allowed,
    otherwise the browser drops the request before it reaches our handler."""
    from main import app

    with TestClient(app) as client:
        r = client.options(
            "/api/research/test-session/stream",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Last-Event-ID",
            },
        )
    assert r.status_code in (200, 204)
    allow_headers = r.headers.get("access-control-allow-headers", "")
    assert "Last-Event-ID" in allow_headers
    assert "Content-Type" in allow_headers


# ---------------------------------------------------------------------------
# RED 3 — CORS exposes Last-Event-ID on responses
# ---------------------------------------------------------------------------


def test_cors_get_response_expose_last_event_id(env_settings: Path) -> None:
    """Codex H3: when JS reads response headers via `fetch().headers.get()`,
    the browser only exposes headers listed in Access-Control-Expose-Headers.
    Last-Event-ID must be exposed for client-side replay tracking."""
    from main import app

    with TestClient(app) as client:
        r = client.get("/health", headers={"Origin": "http://localhost:3000"})
    expose_headers = r.headers.get("access-control-expose-headers", "")
    assert "Last-Event-ID" in expose_headers


# ---------------------------------------------------------------------------
# RED 4 — lifespan startup invokes init_db
# ---------------------------------------------------------------------------


def test_lifespan_runs_init_db(env_settings: Path) -> None:
    """Lifespan startup must create lumen_audit_log + lumen_research_sessions
    in the configured DB. Verified by inspecting the SQLite file directly
    after TestClient teardown (lifespan exited cleanly)."""
    from main import app

    with TestClient(app) as client:
        client.get("/health")
    # After context exit lifespan has finished; DB file is closed.
    assert env_settings.exists(), f"DB file not created at {env_settings}"
    conn = sqlite3.connect(str(env_settings))
    try:
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lumen_%'"
        )
        tables = {row[0] for row in cursor.fetchall()}
    finally:
        conn.close()
    assert "lumen_audit_log" in tables
    assert "lumen_research_sessions" in tables


# ---------------------------------------------------------------------------
# RED 5 — research router is mounted under /api
# ---------------------------------------------------------------------------


def test_research_router_mounted_under_api_prefix(env_settings: Path) -> None:
    """Router skeleton must be wired so the /api/* CORS rewrite (frontend
    next.config.ts) lands somewhere instead of bouncing as 404 from the
    app root.

    T10 replaced the T7 placeholder `/api/research/status` with the real
    `POST /api/research/start` + `GET /api/research/{session_id}/stream`
    endpoints. Both must be present on the route table for SSE clients
    to dispatch correctly. The unknown-session GET also doubles as a
    runtime check that the route is wired (vs. just registered)."""
    from main import app

    routes = {getattr(r, "path", "") for r in app.routes}
    assert "/health" in routes
    api_routes = {p for p in routes if p.startswith("/api")}
    assert api_routes, (
        "No /api/* routes registered — include_router(research_router, "
        "prefix='/api') may have been removed from main.py"
    )
    assert "/api/research/start" in api_routes
    assert "/api/research/{session_id}/stream" in api_routes

    # And it actually responds (not just registered): GET on an unknown
    # session must return 404 from the route handler, not 404 from the
    # app router (which would surface as no `detail` field).
    with TestClient(app) as client:
        r = client.get("/api/research/never-mounted/stream")
    assert r.status_code == 404
    assert "session" in r.json().get("detail", "").lower()
