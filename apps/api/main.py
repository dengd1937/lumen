"""Lumen FastAPI application entrypoint.

Lifespan startup runs `init_db()` so subsequent requests can assume the
schema is in place. CORS is split-configured per ADR-0002 D8.1 + Codex H3:
`Last-Event-ID` listed in both `allow_headers` (preflight) and
`expose_headers` (so JS can read the response header on reconnect).
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
from app.services.langgraph_service import LangGraphStub
from app.services.session_manager import SessionManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run schema setup once at startup. Each request opens its own
    aiosqlite connection (via T9/T10 deps) — the lifespan does not hold
    a long-lived shared connection.

    The SessionManager singleton is process-local (per ADR-0001 D5
    `--workers 1` constraint) and stored on `app.state` so router
    handlers can retrieve it via `request.app.state.session_manager`."""
    settings = get_settings()
    async with aiosqlite.connect(settings.LUMEN_DB_PATH) as conn:
        await init_db(conn)

    app.state.session_manager = SessionManager(
        db_path=settings.LUMEN_DB_PATH,
        langgraph=LangGraphStub(),
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
