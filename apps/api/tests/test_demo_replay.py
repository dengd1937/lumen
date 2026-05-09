"""T13a -- Demo replay path + three-tier guard tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_settings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FIXTURE_PATH = Path(__file__).resolve().parents[1] / "data" / "demo_session.json"


def _load_fixture() -> dict[str, Any]:
    raw: dict[str, Any] = json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))
    return raw


# ---------------------------------------------------------------------------
# 1. fixture 文件存在且 JSON 有效 + 包含必要字段
# ---------------------------------------------------------------------------


def test_demo_fixture_exists_and_is_valid() -> None:
    assert _FIXTURE_PATH.exists(), "Demo fixture missing at expected path"
    data = _load_fixture()
    assert "session_id" in data
    assert "query" in data
    assert "events" in data and isinstance(data["events"], list)
    assert len(data["events"]) >= 5
    types = {ev["type"] for ev in data["events"]}
    assert {"plan_created", "node_started", "node_completed", "report_chunk", "done"} <= types


# ---------------------------------------------------------------------------
# 2. demo session_id 不在 router 源码中硬编码
# ---------------------------------------------------------------------------


def test_demo_session_id_not_hardcoded_in_router() -> None:
    router_text = (
        Path(__file__).resolve().parents[1] / "app" / "routers" / "research.py"
    ).read_text(encoding="utf-8")
    assert "01HZD9DEMOREPLAY" not in router_text, (
        "Demo session_id must not be hardcoded in router source"
    )


# ---------------------------------------------------------------------------
# 3. production app 代码不依赖 tests/fixtures/demo 路径
# ---------------------------------------------------------------------------


def test_fixture_path_not_in_tests_directory() -> None:
    app_dir = Path(__file__).resolve().parents[1] / "app"
    for py in app_dir.rglob("*.py"):
        text = py.read_text(encoding="utf-8")
        assert "tests/fixtures/demo" not in text, (
            f"{py} references tests/fixtures/demo (production must not depend on tests/)"
        )


# ---------------------------------------------------------------------------
# 4. GET /demo-session-id 返回 fixture 中的 session_id
# ---------------------------------------------------------------------------


def test_demo_session_id_endpoint_returns_fixture_id(env_settings: object) -> None:
    from main import app

    with TestClient(app) as client:
        r = client.get("/api/research/demo-session-id")
        assert r.status_code == 200
        body = r.json()
        assert "session_id" in body
        fixture = _load_fixture()
        assert body["session_id"] == fixture["session_id"]


# ---------------------------------------------------------------------------
# 5. demo replay stream 在 TESTING_MODE 下放行 (200 + SSE)
# ---------------------------------------------------------------------------


def test_demo_replay_authorized_via_testing_mode(env_settings: object) -> None:
    from main import app

    fixture = _load_fixture()
    sid = fixture["session_id"]
    with TestClient(app) as client:
        # env_settings fixture 在 conftest 中设置 TESTING_MODE=true
        r = client.get(f"/api/research/{sid}/stream")
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")


# ---------------------------------------------------------------------------
# 6. demo replay 缺所有 guard → 403
# ---------------------------------------------------------------------------


def test_demo_replay_unauthorized_returns_403(
    monkeypatch: pytest.MonkeyPatch, env_settings: object
) -> None:
    monkeypatch.setenv("TESTING_MODE", "false")
    monkeypatch.delenv("TESTING_TOKEN", raising=False)
    monkeypatch.delenv("DEMO_REPLAY_TOKEN", raising=False)
    get_settings.cache_clear()

    from main import app

    fixture = _load_fixture()
    sid = fixture["session_id"]
    with TestClient(app) as client:
        r = client.get(f"/api/research/{sid}/stream")
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 7. demo replay via Origin allowlist
# ---------------------------------------------------------------------------


def test_demo_replay_authorized_via_origin_allowlist(
    monkeypatch: pytest.MonkeyPatch, env_settings: object
) -> None:
    monkeypatch.setenv("TESTING_MODE", "false")
    monkeypatch.setenv("DEMO_ALLOWED_ORIGINS", '["https://demo.lumen.app"]')
    get_settings.cache_clear()

    from main import app

    fixture = _load_fixture()
    sid = fixture["session_id"]
    with TestClient(app) as client:
        r = client.get(
            f"/api/research/{sid}/stream",
            headers={"Origin": "https://demo.lumen.app"},
        )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 8. demo replay via X-Lumen-Demo-Token
# ---------------------------------------------------------------------------


def test_demo_replay_authorized_via_demo_token(
    monkeypatch: pytest.MonkeyPatch, env_settings: object
) -> None:
    monkeypatch.setenv("TESTING_MODE", "false")
    monkeypatch.setenv("DEMO_REPLAY_TOKEN", "demo-secret-001")
    get_settings.cache_clear()

    from main import app

    fixture = _load_fixture()
    sid = fixture["session_id"]
    with TestClient(app) as client:
        r = client.get(
            f"/api/research/{sid}/stream",
            headers={"X-Lumen-Demo-Token": "demo-secret-001"},
        )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 9. wrong token → 403
# ---------------------------------------------------------------------------


def test_demo_replay_wrong_token_returns_403(
    monkeypatch: pytest.MonkeyPatch, env_settings: object
) -> None:
    monkeypatch.setenv("TESTING_MODE", "false")
    monkeypatch.setenv("DEMO_REPLAY_TOKEN", "demo-secret-001")
    get_settings.cache_clear()

    from main import app

    fixture = _load_fixture()
    sid = fixture["session_id"]
    with TestClient(app) as client:
        r = client.get(
            f"/api/research/{sid}/stream",
            headers={"X-Lumen-Demo-Token": "wrong-token"},
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 10. non-demo session_id 走原路径 (404 -- session not found)
# ---------------------------------------------------------------------------


def test_non_demo_session_id_falls_through_to_normal_path(env_settings: object) -> None:
    from main import app

    with TestClient(app) as client:
        r = client.get("/api/research/non-existent-session/stream")
        # 不是 demo session_id → 走正常 stream_session_endpoint → 404 (session not found)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 11. C1: referer 子域名绕过攻击向量被阻断
# ---------------------------------------------------------------------------


def test_demo_replay_evil_subdomain_referer_returns_403(
    monkeypatch: pytest.MonkeyPatch, env_settings: object
) -> None:
    """C1: referer 'https://demo.lumen.app.evil.com/' 不应绕过 allowlist."""
    monkeypatch.setenv("TESTING_MODE", "false")
    monkeypatch.delenv("TESTING_TOKEN", raising=False)
    monkeypatch.setenv("DEMO_ALLOWED_ORIGINS", '["https://demo.lumen.app"]')
    get_settings.cache_clear()

    from main import app

    fixture = _load_fixture()
    sid = fixture["session_id"]
    with TestClient(app) as client:
        # attack vector 1: subdomain hijack (startswith old logic would pass, new logic => 403)
        r = client.get(
            f"/api/research/{sid}/stream",
            headers={"Referer": "https://demo.lumen.app.evil.com/page"},
        )
        assert r.status_code == 403, "subdomain hijack referer must be rejected"

        # attack vector 2: no / boundary suffix (XYZ immediately follows allowed origin)
        r = client.get(
            f"/api/research/{sid}/stream",
            headers={"Referer": "https://demo.lumen.appXYZ"},
        )
        assert r.status_code == 403, "non-boundary suffix referer must be rejected"

        # valid referer: exact match
        r = client.get(
            f"/api/research/{sid}/stream",
            headers={"Referer": "https://demo.lumen.app"},
        )
        assert r.status_code == 200, "exact-match referer must be authorized"

        # valid referer: path suffix with / boundary
        r = client.get(
            f"/api/research/{sid}/stream",
            headers={"Referer": "https://demo.lumen.app/research/demo"},
        )
        assert r.status_code == 200, "referer with path suffix must be authorized"


# ---------------------------------------------------------------------------
# 12. H1: malformed JSON / missing-field fixture degrades to None, not 500
# ---------------------------------------------------------------------------


def test_load_demo_session_returns_none_on_invalid_json(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """H1: malformed JSON fixture degrades to None, not 500."""
    bad_path = tmp_path / "demo_session.json"
    bad_path.write_text("not valid json {{", encoding="utf-8")

    from app.routers import research as router_module

    monkeypatch.setattr(router_module, "_DEMO_FIXTURE_PATH", bad_path)
    router_module._load_demo_session.cache_clear()

    assert router_module._load_demo_session() is None


def test_load_demo_session_returns_none_on_missing_keys(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """H1: fixture with missing top-level keys degrades to None."""
    bad_path = tmp_path / "demo_session.json"
    bad_path.write_text(
        json.dumps({"session_id": "x"}), encoding="utf-8"
    )  # missing query, events

    from app.routers import research as router_module

    monkeypatch.setattr(router_module, "_DEMO_FIXTURE_PATH", bad_path)
    router_module._load_demo_session.cache_clear()

    assert router_module._load_demo_session() is None


def test_load_demo_session_returns_none_on_non_object(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """H1: fixture that is a JSON array (not object) degrades to None."""
    bad_path = tmp_path / "demo_session.json"
    bad_path.write_text(json.dumps([1, 2, 3]), encoding="utf-8")

    from app.routers import research as router_module

    monkeypatch.setattr(router_module, "_DEMO_FIXTURE_PATH", bad_path)
    router_module._load_demo_session.cache_clear()

    assert router_module._load_demo_session() is None


# ---------------------------------------------------------------------------
# 13. H2: malformed event aborts replay cleanly, not 500
# ---------------------------------------------------------------------------


def test_replay_aborts_on_malformed_event(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, env_settings: object
) -> None:
    """H2: malformed event in fixture stops replay cleanly (no 500)."""
    bad_fixture = {
        "session_id": "01HZD9DEMOREPLAY0000000000",
        "query": "test",
        "events": [
            {
                "event_id": "evt1",
                "session_id": "01HZD9DEMOREPLAY0000000000",
                "timestamp": "2026-05-09T00:00:00.000000Z",
                "type": "plan_created",
                "nodes": [],
            },
            {"event_id": "evt2"},  # missing 'type' — malformed
        ],
    }
    bad_path = tmp_path / "demo_session.json"
    bad_path.write_text(json.dumps(bad_fixture), encoding="utf-8")

    from app.routers import research as router_module

    monkeypatch.setattr(router_module, "_DEMO_FIXTURE_PATH", bad_path)
    router_module._load_demo_session.cache_clear()

    from main import app

    with TestClient(app) as client:
        r = client.get(f"/api/research/{bad_fixture['session_id']}/stream")
        # TESTING_MODE=true + TESTING_TOKEN set → authorized via Tier 3
        assert r.status_code == 200
        body = r.text
        assert "evt1" in body  # first valid event emitted
        assert "evt2" not in body  # malformed event aborted before emit
