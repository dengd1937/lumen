"""T13b -- Demo session prerender CLI.

Generates apps/api/data/demo_session.json by driving LangGraphService
against real DashScope once. Run before each release / Demo Day to
refresh the replay fixture.

Usage:
    DASHSCOPE_API_KEY=... DASHSCOPE_BASE_URL=... LLM_MODEL=qwen-max \\
    uv run python scripts/prerender_demo_session.py --query "AI 在医疗领域的应用前景"

Output: apps/api/data/demo_session.json (overwritten in place).
The new file lands in git via the !apps/api/data/demo_session.json
unignore rule in .gitignore.

Why this script exists (ADR-0001 D6 L3): Demo Day gate. SSE-2 reconnect
saves connection drops but not LLM hangs; this fixture is the replay
fallback for show-stopper scenarios.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Ensure apps/api is on sys.path so we can import the real service
_REPO_ROOT = Path(__file__).resolve().parents[1]
_API_ROOT = _REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(_API_ROOT))

from app.core.config import Settings  # noqa: E402
from app.services.langgraph_service import LangGraphService  # noqa: E402
from ulid import ULID  # noqa: E402

_FIXTURE_PATH = _API_ROOT / "data" / "demo_session.json"


async def _run(query: str) -> dict[str, object]:
    """Drive LangGraphService once, collect every emitted event, return fixture dict."""
    settings = Settings()  # type: ignore[call-arg]  # populated from env
    service = LangGraphService.from_settings(settings)

    session_id = str(ULID())
    events: list[dict[str, object]] = []

    async for ev in service.astream_events(session_id, query):
        # model_dump_json then re-parse keeps wire shape (snake_case, exclude_none)
        events.append(json.loads(ev.model_dump_json(exclude_none=True)))

    return {
        "session_id": session_id,
        "query": query,
        "events": events,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Prerender demo session fixture for replay (T13b)."
    )
    parser.add_argument(
        "--query",
        required=True,
        help="Research query to drive through LangGraph; output saved to fixture.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=_FIXTURE_PATH,
        help=f"Fixture output path (default: {_FIXTURE_PATH}).",
    )
    args = parser.parse_args(argv)

    fixture = asyncio.run(_run(args.query))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(fixture, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(fixture['events'])} events to {args.output}", file=sys.stderr)
    print(f"session_id={fixture['session_id']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
