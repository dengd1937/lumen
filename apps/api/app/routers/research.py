"""Research router.

T9 added `POST /research/start`. T10 adds
`GET /research/{session_id}/stream` — the W3C SSE replay + live channel
backed by `app.core.sse.stream_session`.

The earlier `/status` placeholder is removed in T10: `/stream` is now
the real router-mount target referenced by `tests/test_main.py`.
"""

from __future__ import annotations

from typing import Annotated

import aiosqlite
from fastapi import APIRouter, Header, HTTPException, Path, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.deps import get_settings
from app.core.sse import stream_session
from app.db.sqlite import configure_connection, lookup_seq_by_event_id
from app.services.session_manager import (
    SessionAlreadyRunningError,
    SessionManager,
)

router = APIRouter(prefix="/research", tags=["research"])


class StartSessionBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)


class StartSessionResponse(BaseModel):
    session_id: str


@router.post(
    "/start",
    status_code=status.HTTP_201_CREATED,
    response_model=StartSessionResponse,
)
async def start_session(
    body: StartSessionBody,
    request: Request,
) -> StartSessionResponse:
    """Create a session and launch the LangGraph producer task.

    Returns:
      201 Created — `{"session_id": "..."}`
      409 Conflict — same session_id is already running (producer lock)
    """
    session_manager: SessionManager = request.app.state.session_manager
    try:
        await session_manager.start_session(body.session_id)
    except SessionAlreadyRunningError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session {exc.session_id!r} is already running",
        ) from None
    return StartSessionResponse(session_id=body.session_id)


@router.get("/{session_id}/stream")
async def stream_session_endpoint(
    session_id: Annotated[str, Path(min_length=1, max_length=64)],
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    """W3C SSE channel: replay-then-live for a research session.

    Pre-flight:
      - 404 if the session_id has no row in `lumen_research_sessions`
      - 400 if `Last-Event-ID` is provided but unknown (we don't
        silently replay-from-zero — the client MUST acknowledge a
        missing cursor)

    Headers:
      - Content-Type: text/event-stream
      - Cache-Control: no-cache (forbid intermediary caching)
      - X-Accel-Buffering: no (disable nginx response buffering — SSE
        frames must flush as soon as written)

    The endpoint never spawns a LangGraph producer (read-only path);
    the producer is owned by `POST /start` exclusively. A GET on a
    terminal session returns a finite replay then closes.
    """
    settings = get_settings()
    db_path = settings.LUMEN_DB_PATH

    last_seq = 0
    async with aiosqlite.connect(db_path) as conn:
        await configure_connection(conn)
        cur = await conn.execute(
            "SELECT 1 FROM lumen_research_sessions WHERE id = ?",
            (session_id,),
        )
        if (await cur.fetchone()) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"session {session_id!r} not found",
            )
        # `is not None` (not truthiness): an empty header value `Last-Event-ID:`
        # means "provided but malformed", which is a client bug we surface as
        # 400 — silently falling back to last_seq=0 would misrepresent the
        # contract documented in this endpoint's docstring.
        if last_event_id is not None:
            stripped = last_event_id.strip()
            if not stripped:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Last-Event-ID header is present but empty",
                )
            resolved = await lookup_seq_by_event_id(conn, event_id=stripped)
            if resolved is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unknown Last-Event-ID; client must reconnect without the header",
                )
            last_seq = resolved

    return StreamingResponse(
        stream_session(
            session_id=session_id,
            db_path=db_path,
            last_seq=last_seq,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
