"""Research router.

T9 adds `POST /research/start`. T10 adds `GET /research/{id}/stream`.
The earlier `/status` placeholder remains until T10 lands so the
test_main.py router-mount assertion has a stable target.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.services.session_manager import (
    SessionAlreadyRunningError,
    SessionManager,
)

router = APIRouter(prefix="/research", tags=["research"])


class StartSessionBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)


class StartSessionResponse(BaseModel):
    session_id: str


@router.get("/status")
async def research_status() -> dict[str, str]:
    """Placeholder endpoint for T7 router-mount verification."""
    return {"router": "research", "phase": "M1.0-skeleton"}


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
