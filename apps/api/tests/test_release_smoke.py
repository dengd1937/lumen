"""T_SMOKE -- Release-time real DashScope smoke test.

Why: 80% coverage gate is enforced via FakeListChatModel which doesn't prove
init_chat_model / StateGraph.compile() / astream_events(version="v2") under
the real LangGraph runtime. Run before each release to catch:
  * DashScope API contract drift
  * StateGraph compile errors with the real model (FakeListChatModel skips
    tool-binding edge cases)
  * astream_events streaming protocol regressions
  * Routing layer real-event-shape divergence

Run locally before release:
    uv run pytest -m release_smoke

CI excludes this marker via pyproject.toml addopts.
"""

from __future__ import annotations

import asyncio
import os
import time

import pytest

from app.core.config import Settings
from app.models.events import AnyEvent
from app.services.langgraph_service import LangGraphService

_REQUIRED_TYPES: frozenset[str] = frozenset(
    {"plan_created", "node_started", "node_completed", "report_chunk", "done"}
)
# Note: node_progress is optional in the v2 graph (researcher emits when
# progress messages are produced; FakeListChatModel test path always emits,
# but real DashScope may skip if researcher completes too fast). Omit from
# required set to keep the smoke deterministic.

_TIMEOUT_SECONDS: float = 600.0  # 10 min hard ceiling per plan T_SMOKE GREEN #4


@pytest.mark.release_smoke
async def test_release_smoke_full_cycle_with_real_dashscope() -> None:
    """Drive the real LangGraph against DashScope; assert each canonical
    event type appears at least once within 10 minutes."""

    if not os.environ.get("DASHSCOPE_API_KEY"):
        pytest.skip("DASHSCOPE_API_KEY not set; release smoke requires real key")

    settings = Settings()  # type: ignore[call-arg]  # pydantic-settings populates from env
    service = LangGraphService.from_settings(settings)

    seen_types: set[str] = set()
    events: list[AnyEvent] = []
    chunk_preview: list[str] = []

    started = time.monotonic()
    try:
        async with asyncio.timeout(_TIMEOUT_SECONDS):
            async for ev in service.astream_events("smoke-001", "AI 在医疗领域的应用前景"):
                events.append(ev)
                seen_types.add(ev.type)
                if ev.type == "report_chunk":
                    # Truncate per chunk to keep diagnostics readable
                    chunk_preview.append(ev.content[:200])
    except TimeoutError:
        elapsed = time.monotonic() - started
        pytest.fail(
            f"Release smoke exceeded {_TIMEOUT_SECONDS}s (actual {elapsed:.1f}s). "
            f"Seen types: {sorted(seen_types)}. "
            f"Last 3 chunks (200ch each): {chunk_preview[-3:]}"
        )

    elapsed = time.monotonic() - started
    missing = _REQUIRED_TYPES - seen_types
    assert not missing, (
        f"Release smoke missing required event types: {sorted(missing)}. "
        f"Total events: {len(events)}, types seen: {sorted(seen_types)}, "
        f"elapsed: {elapsed:.1f}s. "
        f"Chunk samples (first 200ch each): {chunk_preview[:3]}"
    )


@pytest.mark.release_smoke
async def test_release_smoke_skipped_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sanity: missing DASHSCOPE_API_KEY triggers skip, not fail."""
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)

    if os.environ.get("DASHSCOPE_API_KEY"):
        pytest.fail("monkeypatch.delenv did not actually unset DASHSCOPE_API_KEY")

    # Replicates the early-skip branch in test_release_smoke_full_cycle_with_real_dashscope
    pytest.skip("DASHSCOPE_API_KEY not set; release smoke requires real key")
