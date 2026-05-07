"""Lumen FastAPI application entrypoint.

Lifespan startup runs `init_db()` so subsequent requests can assume the
schema is in place. CORS is split-configured per ADR-0002 D8.1 + Codex H3:
`Last-Event-ID` listed in both `allow_headers` (preflight) and
`expose_headers` (so JS can read the response header on reconnect).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import aiosqlite
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.deps import get_settings
from app.db.sqlite import init_db
from app.routers.research import router as research_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Run schema setup once at startup. Each request opens its own
    aiosqlite connection (via T9/T10 deps) — the lifespan does not hold
    a long-lived shared connection."""
    settings = get_settings()
    async with aiosqlite.connect(settings.LUMEN_DB_PATH) as conn:
        await init_db(conn)
    yield


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
