"""T10 — GET /api/research/{id}/stream + replay + heartbeat tests.

Per ADR-0002 D8.5 + plan T10 RED specs (6 tests):

- RED 1: Content-Type: text/event-stream
- RED 2: Replay by event_id (Last-Event-ID header → seq lookup)
- RED 3: Invalid Last-Event-ID returns 400 (NOT silent replay-from-zero)
- RED 4: GET on nonexistent session → 404; GET does NOT spawn second
  LangGraph run (active_runs count never grows from a GET)
- RED 5: Heartbeat frames are NOT in the replay phase output
- RED 6: Client disconnect → SSE-side tasks cancel, producer naturally
  completes, active_runs is empty within 5s (Codex H2 timeout assertion)

Tests use httpx.AsyncClient + ASGITransport for true streaming. Lifespan
is run via the fixture (env_settings → started_app) so app.state.session_manager
is initialized in the same event loop the test inspects.

T3 update: POST body changed from {session_id} to {query}; session_id is now
server-generated (ULID). Tests extract session_id from POST response.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from pathlib import Path

import aiosqlite
import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI

from app.services.inject_directive import InjectDirective
from app.services.langgraph_service import LangGraphStub
from app.services.session_manager import SessionManager

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def started_app(
    env_settings: Path, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[FastAPI]:
    """Spin up the real FastAPI lifespan so app.state.session_manager is
    created in the test's event loop. We deliberately avoid TestClient
    here — its synchronous wrapper runs lifespan on a separate thread and
    breaks `app.state.session_manager.active_runs` introspection from
    inside async test bodies.

    M1.A T7 update: monkeypatch init_chat_model so lifespan can build
    LangGraphService without a real DashScope connection. After lifespan
    startup, replace app.state.session_manager with a LangGraphStub-backed
    instance to preserve the fixed 4-event sequence these replay tests rely on.
    """
    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    monkeypatch.setattr(
        "app.services.langgraph_service.init_chat_model",
        lambda **kwargs: FakeListChatModel(responses=[]),
    )
    from main import app

    async with app.router.lifespan_context(app):
        # T7: lifespan creates app.state.langgraph_service (LangGraphService) +
        # app.state.session_manager (using that LangGraphService).
        # We replace session_manager with one backed by LangGraphStub() to keep
        # the M1.0 4-event invariant for SSE replay tests. The original lifespan
        # SessionManager has no active_runs (replacement happens before yield),
        # and orphaned app.state.langgraph_service has no lifecycle hook (no
        # long-lived connections per ADR-0003 SDec-4) — no leak.
        app.state.session_manager = SessionManager(
            db_path=str(env_settings),
            langgraph=LangGraphStub(),
        )
        yield app


def _parse_sse_frames(body: bytes) -> list[dict[str, str]]:
    """Decode raw SSE body bytes into a list of frame dicts.

    Each frame has keys among {id, event, data}. Blank lines separate
    frames (per W3C SSE spec). Comment lines (starting with `:`) and
    other miscellany are ignored — T10 frames only emit id/event/data.
    """
    frames: list[dict[str, str]] = []
    text = body.decode("utf-8")
    for chunk in text.split("\n\n"):
        if not chunk.strip():
            continue
        frame: dict[str, str] = {}
        for line in chunk.split("\n"):
            if not line or line.startswith(":"):
                continue
            key, _, value = line.partition(":")
            frame[key.strip()] = value.lstrip(" ")
        if frame:
            frames.append(frame)
    return frames


async def _drain_stream(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str] | None = None,
) -> bytes:
    """Open a streaming GET and accumulate body bytes until the server
    closes. Used for tests that expect a finite stream (replay ending in
    completed status)."""
    parts: list[bytes] = []
    async with client.stream("GET", url, headers=headers) as resp:
        assert resp.status_code == 200, f"unexpected status {resp.status_code}"
        async for chunk in resp.aiter_bytes():
            parts.append(chunk)
    return b"".join(parts)


# ---------------------------------------------------------------------------
# RED 1 — Content-Type
# ---------------------------------------------------------------------------


async def test_stream_returns_event_stream_content_type(
    started_app: FastAPI,
) -> None:
    """RED 1: response carries Content-Type: text/event-stream so browser
    EventSource auto-promotes the connection to a stream channel."""
    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/research/start", json={"query": "content-type test"})
        assert r.status_code == 201
        session_id = r.json()["session_id"]
        async with client.stream("GET", f"/api/research/{session_id}/stream") as resp:
            assert resp.status_code == 200
            content_type = resp.headers.get("content-type", "")
            assert content_type.startswith("text/event-stream"), content_type


# ---------------------------------------------------------------------------
# RED 2 — replay by event_id (Codex M5)
# ---------------------------------------------------------------------------


async def test_stream_replays_missed_events_by_event_id(
    started_app: FastAPI,
    env_settings: Path,
) -> None:
    """RED 2: Last-Event-ID header → lookup_seq_by_event_id → replay only
    rows with seq > resolved_seq. Asserts replay does NOT include the
    earlier events (plan_created at seq=1, node_started at seq=2)."""
    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/research/start", json={"query": "replay test query"})
        assert r.status_code == 201
        session_id = r.json()["session_id"]

        # Wait long enough for the stub to flush all 4 events to audit_log
        # (4 events x 0.1s sleep + status transition margin).
        await asyncio.sleep(0.8)

        async with aiosqlite.connect(str(env_settings)) as conn:
            cur = await conn.execute(
                "SELECT event_id FROM lumen_audit_log WHERE session_id = ? AND seq = ?",
                (session_id, 2),
            )
            row = await cur.fetchone()
        assert row is not None
        last_event_id = row[0]

        body = await _drain_stream(
            client,
            f"/api/research/{session_id}/stream",
            headers={"Last-Event-ID": last_event_id},
        )

    frames = _parse_sse_frames(body)
    business_types = [
        json.loads(f["data"]).get("type") for f in frames if f.get("event") != "heartbeat"
    ]
    # Only events with seq > 2 should be replayed: node_progress, node_completed.
    assert "node_progress" in business_types, business_types
    assert "node_completed" in business_types, business_types
    assert "plan_created" not in business_types, business_types
    assert "node_started" not in business_types, business_types


# ---------------------------------------------------------------------------
# RED 3 — invalid Last-Event-ID returns 400
# ---------------------------------------------------------------------------


async def test_stream_invalid_last_event_id_returns_400(
    started_app: FastAPI,
) -> None:
    """RED 3: nonexistent Last-Event-ID must NOT silently replay-from-zero.
    Returning 400 forces the client to reset its cursor explicitly."""
    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/research/start", json={"query": "bad leid test"})
        assert r.status_code == 201
        session_id = r.json()["session_id"]

        resp = await client.get(
            f"/api/research/{session_id}/stream",
            headers={"Last-Event-ID": "not-a-real-event-id"},
        )
    assert resp.status_code == 400
    assert "last-event-id" in resp.json().get("detail", "").lower()


async def test_stream_empty_last_event_id_returns_400(
    started_app: FastAPI,
) -> None:
    """code-reviewer T10 HIGH: an empty `Last-Event-ID:` header is
    "provided but malformed" and must surface as 400 rather than silently
    falling back to last_seq=0. Locks the contract documented in the
    endpoint docstring."""
    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/research/start", json={"query": "empty leid test"})
        assert r.status_code == 201
        session_id = r.json()["session_id"]

        resp = await client.get(
            f"/api/research/{session_id}/stream",
            headers={"Last-Event-ID": ""},
        )
    assert resp.status_code == 400
    assert "empty" in resp.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# RED 4 — no second LangGraph run from GET, 404 on missing session
# ---------------------------------------------------------------------------


async def test_stream_404_on_unknown_session(started_app: FastAPI) -> None:
    """RED 4a: GET on a session_id that was never POSTed returns 404."""
    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/research/never-existed/stream")
    assert r.status_code == 404


class _CountingManager(SessionManager):
    """Test fixture: records every `start_session` invocation so we can
    assert GET never reaches that code path."""

    def __init__(self, *, db_path: str, langgraph: LangGraphStub) -> None:
        super().__init__(db_path=db_path, langgraph=langgraph)
        self.start_call_count = 0

    async def start_session(
        self,
        *,
        session_id: str,
        query: str,
        inject_directive: InjectDirective | None = None,
    ) -> None:
        self.start_call_count += 1
        await super().start_session(
            session_id=session_id,
            query=query,
            inject_directive=inject_directive,
        )


async def test_stream_does_not_spawn_second_producer(
    started_app: FastAPI,
) -> None:
    """RED 4b: GET on an existing session is read-only — it never invokes
    `session_manager.start_session`. Verified via a counting wrapper:
    after one POST (counter=1), drain a complete GET stream; counter must
    remain 1 (no GET-side spawn).
    """
    sm: SessionManager = started_app.state.session_manager
    counting = _CountingManager(
        db_path=sm._db_path,
        langgraph=LangGraphStub(),
    )
    started_app.state.session_manager = counting
    try:
        transport = httpx.ASGITransport(app=started_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post("/api/research/start", json={"query": "no second producer test"})
            assert r.status_code == 201
            session_id = r.json()["session_id"]
            assert counting.start_call_count == 1

            # Drain the stream to completion (producer reaches terminal).
            await asyncio.sleep(0.6)
            body = await _drain_stream(client, f"/api/research/{session_id}/stream")

        # The GET path read replay rows + observed terminal status; it
        # never went through `start_session`.
        assert counting.start_call_count == 1

        # Sanity: replay actually delivered the 4 business events.
        frames = _parse_sse_frames(body)
        types = [json.loads(f["data"])["type"] for f in frames if f.get("event") != "heartbeat"]
        assert types == ["plan_created", "node_started", "node_progress", "node_completed"]
    finally:
        started_app.state.session_manager = sm


# ---------------------------------------------------------------------------
# RED 5 — heartbeat NOT in replay
# ---------------------------------------------------------------------------


async def test_heartbeat_not_in_replay(
    started_app: FastAPI,
) -> None:
    """RED 5: replay phase yields persisted business events only.
    Heartbeat is a wire-layer concern (not in audit_log per ADR-0002 D8.5)
    and must never appear in replay output."""
    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/research/start", json={"query": "heartbeat replay test"})
        assert r.status_code == 201
        session_id = r.json()["session_id"]
        # Wait for completion so the stream returns purely from replay.
        await asyncio.sleep(0.8)
        body = await _drain_stream(client, f"/api/research/{session_id}/stream")

    frames = _parse_sse_frames(body)
    event_lines = [f.get("event", "") for f in frames]
    assert "heartbeat" not in event_lines, event_lines
    # Sanity: at least the 4 business events were replayed.
    business = [e for e in event_lines if e and e != "heartbeat"]
    assert len(business) >= 4, business


# ---------------------------------------------------------------------------
# RED 6 — task lifecycle cleanup (Codex H2)
# ---------------------------------------------------------------------------


async def test_task_lifecycle_cleanup(started_app: FastAPI) -> None:
    """RED 6 / Codex H2: client disconnect → SSE poller + heartbeat tasks
    cancel via the generator's finally clause; LangGraph producer
    naturally completes (stub stops after 4 events, ~0.4s); active_runs
    is empty within 5s.
    """
    sm: SessionManager = started_app.state.session_manager

    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/research/start", json={"query": "lifecycle cleanup test"})
        assert r.status_code == 201
        session_id = r.json()["session_id"]
        async with client.stream("GET", f"/api/research/{session_id}/stream") as resp:
            assert resp.status_code == 200
            # Read the first byte then disconnect.
            async for _chunk in resp.aiter_bytes():
                break

    async with asyncio.timeout(5.0):
        while sm.active_runs:
            await asyncio.sleep(0.05)
    assert len(sm.active_runs) == 0


# ---------------------------------------------------------------------------
# T7B D-HB v2 RED #3 — heartbeat 后断线重连不返 400
# ---------------------------------------------------------------------------


async def test_sse_stream_after_heartbeat_reconnect_uses_last_business_event_id(
    started_app: FastAPI,
    env_settings: Path,
) -> None:
    """T7B D-HB v2 RED #3 integration: reconnect after heartbeat must not 400.

    M1.0 hidden bug reproduction (fails before fix):
      1. POST /research/start -> producer pushes plan_created -> heartbeat (old id: heartbeat-*)
      2. Browser EventSource lastEventId overwritten by 'heartbeat-*'
      3. Reconnect sends 'heartbeat-*' as Last-Event-ID
      4. lookup_seq_by_event_id('heartbeat-*') -> not found -> 400

    T7B fix contract:
      1. heartbeat frame omits id: line (W3C SSE: lastEventId not updated)
      2. EventSource retains most-recent business event_id (e.g. plan_created.event_id) as LEID
      3. Reconnect sends business event_id -> lookup_seq_by_event_id hits -> 200 + replay from seq+1
    """
    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Start session
        r = await client.post("/api/research/start", json={"query": "T7B reconnect test"})
        assert r.status_code == 201, f"start failed: {r.text}"
        session_id = r.json()["session_id"]

        # Wait for business events to land in audit_log (plan_created is LangGraphStub first event)
        await asyncio.sleep(0.3)

        # Read plan_created.event_id from audit_log (simulates LEID the browser would hold)
        async with aiosqlite.connect(str(env_settings)) as conn:
            cur = await conn.execute(
                "SELECT event_id FROM lumen_audit_log "
                "WHERE session_id = ? AND event_type = 'plan_created' "
                "LIMIT 1",
                (session_id,),
            )
            row = await cur.fetchone()

        assert row is not None, "plan_created event must be in audit_log"
        plan_created_event_id = row[0]

        # Reconnect with business event_id as Last-Event-ID
        async with client.stream(
            "GET",
            f"/api/research/{session_id}/stream",
            headers={"Last-Event-ID": plan_created_event_id},
            timeout=5.0,
        ) as stream_response:
            # Key assertion: 200 not 400 (pre-fix got 400 because heartbeat-* not in audit_log)
            assert stream_response.status_code == 200, (
                f"Expected 200, got {stream_response.status_code}; "
                f"body={await stream_response.aread()!r}"
            )

            # Collect some bytes to confirm stream is functioning
            collected = bytearray()
            async for chunk in stream_response.aiter_bytes():
                collected.extend(chunk)
                if len(collected) > 256:  # any data means replay is working
                    break

        assert len(collected) > 0, "Stream should yield at least one frame after reconnect"


# ---------------------------------------------------------------------------
# Bonus — no router-level regression: /start still works alongside /stream
# ---------------------------------------------------------------------------


async def test_start_then_stream_replays_all_events(
    started_app: FastAPI,
) -> None:
    """End-to-end smoke: POST then GET (no Last-Event-ID) replays the
    full audit_log for the session. Establishes that the router mount
    + stream generator + DB read path work in concert."""
    transport = httpx.ASGITransport(app=started_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/research/start", json={"query": "e2e replay test"})
        assert r.status_code == 201
        session_id = r.json()["session_id"]
        await asyncio.sleep(0.8)
        body = await _drain_stream(client, f"/api/research/{session_id}/stream")

    frames = _parse_sse_frames(body)
    business = [
        json.loads(f["data"])["type"]
        for f in frames
        if f.get("event") and f.get("event") != "heartbeat"
    ]
    assert business == ["plan_created", "node_started", "node_progress", "node_completed"]
