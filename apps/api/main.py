"""Lumen FastAPI application entrypoint.

Lifespan startup runs `init_db()` so subsequent requests can assume the
schema is in place. CORS is split-configured per ADR-0002 D8.1 + Codex H3:
`Last-Event-ID` listed in both `allow_headers` (preflight) and
`expose_headers` (so JS can read the response header on reconnect).

M1.A T7 (SDec-4): lifespan constructs a LangGraphService singleton via
`from_settings`, mounts it on `app.state.langgraph_service`, and passes it
to SessionManager. This replaces the LangGraphStub used during M1.0
skeleton development. LangGraphStub is retained in langgraph_service.py for
unit tests only.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import aiosqlite
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.deps import get_settings
from app.db.sqlite import init_db
from app.routers.research import router as research_router
from app.services.langgraph_service import LangGraphService
from app.services.session_manager import SessionManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run schema setup once at startup. Each request opens its own
    aiosqlite connection (via T9/T10 deps) — the lifespan does not hold
    a long-lived shared connection.

    M1.A T7: constructs a LangGraphService singleton (real LLM backend)
    from settings and stores it on app.state.langgraph_service. The
    SessionManager receives the service instance via LangGraphProtocol
    abstraction (ADR-0003 D11 + NN1). Both singletons are process-local
    (per ADR-0001 D5 `--workers 1` constraint) and stored on `app.state`
    so router handlers can retrieve them via `request.app.state.*`."""
    settings = get_settings()
    async with aiosqlite.connect(settings.LUMEN_DB_PATH) as conn:
        await init_db(conn)

    # T7 (SDec-4): LangGraphService singleton — constructed once at startup,
    # shared across all requests. from_settings is the only call site for
    # DASHSCOPE_API_KEY.get_secret_value() (security-reviewer requirement).
    langgraph_service = LangGraphService.from_settings(settings)
    app.state.langgraph_service = langgraph_service
    app.state.session_manager = SessionManager(
        db_path=settings.LUMEN_DB_PATH,
        langgraph=langgraph_service,
    )

    try:
        yield
    finally:
        # Graceful shutdown: cancel any in-flight producer tasks AND
        # await them so the shielded _mark_terminal DB write in
        # session_manager._run completes before the loop closes.
        # Without the gather + sleep(0), the shield's inner Task is
        # GC'd mid-write at lifespan exit (per python-reviewer T9 HIGH).
        sm: SessionManager = app.state.session_manager
        tasks = list(sm.active_runs.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
            # One event-loop turn so shield-spawned inner tasks flush.
            await asyncio.sleep(0)


app = FastAPI(title="Lumen API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Last-Event-ID", "Content-Type"],
    expose_headers=["Last-Event-ID"],
)

app.include_router(research_router, prefix="/api")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
