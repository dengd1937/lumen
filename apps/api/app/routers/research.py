"""Research router skeleton.

T7 only wires the router to receive `/api/*` traffic from the frontend
Next.js rewrite (T13). T9 fills in `POST /research/start`, T10 fills in
`GET /research/{id}/stream`. Until then this module exposes an APIRouter
with a single placeholder `/status` endpoint so test_main.py can prove
include_router actually wired the prefix chain (per code-reviewer T7
MEDIUM: empty router would let an accidental removal of the include_router
line slip past the test suite).
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/research", tags=["research"])


@router.get("/status")
async def research_status() -> dict[str, str]:
    """Placeholder endpoint for T7 router-mount verification. T9 will
    add real `POST /start`; this can stay or be removed at that time
    (the test will then assert against the real endpoint instead)."""
    return {"router": "research", "phase": "M1.0-skeleton"}
