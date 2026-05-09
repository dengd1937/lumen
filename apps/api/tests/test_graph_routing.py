"""T5 -- test_graph_routing: fixture-driven tests for route_stream_event.

Loads streamevent_samples.json (174 samples, each with metadata_langgraph_node),
builds a minimal raw dict per sample, and asserts the expected lumen event type
(or None for filtered samples) per ADR-0003 D10.1 mapping table.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast
from unittest.mock import MagicMock

import pytest

from app.services.graph.routing import route_stream_event

# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "streamevent_samples.json"
SESSION_ID = "test-session-01234567"


def _load_samples() -> list[dict[str, Any]]:
    with FIXTURE_PATH.open() as f:
        data = json.load(f)
    return cast(list[dict[str, Any]], data["samples"])


# Module-level single load — avoids re-reading the fixture file for each
# parametrize expansion (LOW-4 DRY).
_SAMPLES: list[dict[str, Any]] = _load_samples()


def _build_raw(sample: dict[str, Any]) -> dict[str, Any]:
    """Convert a fixture sample to a minimal raw StreamEvent dict suitable
    for route_stream_event.

    Real LangGraph on_chat_model_stream passes data["chunk"] as an
    AIMessageChunk object; we replicate that with a MagicMock that exposes
    a .content attribute so the routing function can access chunk.content.
    """
    event = sample["event"]
    name = sample["name"]
    mlg_node = sample.get("metadata_langgraph_node")
    run_id = sample["run_id"]

    metadata: dict[str, Any] = {"metadata_langgraph_node": mlg_node}
    # Use the fixture field directly as the real runtime would provide via metadata.langgraph_node
    if mlg_node is not None:
        metadata["langgraph_node"] = mlg_node

    data: dict[str, Any] = {}

    if event == "on_chain_end" and name == "planner":
        # planner emits plan_nodes list (T5 node returns {"plan_nodes": [...]})
        data["output"] = {
            "plan_nodes": [
                {"id": "web-1", "title": "子任务1", "track": "web"},
                {"id": "web-2", "title": "子任务2", "track": "web"},
            ]
        }
    elif event == "on_chain_start" and name == "researcher":
        data["input"] = {"query": "test query"}
    elif event == "on_chain_end" and name == "researcher":
        data["output"] = {}
    elif event == "on_chat_model_stream":
        # Simulate AIMessageChunk with a .content attribute
        chunk = MagicMock()
        chunk.content = "X"
        data["chunk"] = chunk
    elif event == "on_chain_end" and name == "LangGraph":
        data["output"] = {}

    return {
        "event": event,
        "name": name,
        "run_id": run_id,
        "tags": sample.get("tags", []),
        "data": data,
        "metadata": metadata,
    }


def _expected_event_type(sample: dict[str, Any]) -> str | None:
    """Return expected lumen event type string (or None) per ADR-0003 D10.1."""
    event = sample["event"]
    name = sample["name"]
    mlg = sample.get("metadata_langgraph_node")

    if event == "on_chain_end" and mlg == "planner":
        return "plan_created"
    if event == "on_chain_start" and mlg == "researcher":
        return "node_started"
    if event == "on_chain_end" and mlg == "researcher":
        return "node_completed"
    if event == "on_chat_model_stream" and mlg == "writer":
        return "report_chunk"
    if event == "on_chain_end" and name == "LangGraph":
        return "done"
    return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_fixture_total_samples() -> None:
    """Gold standard: fixture must have exactly 174 samples."""
    assert len(_SAMPLES) == 174


def test_fixture_all_have_metadata_langgraph_node() -> None:
    """LangGraph 根级事件 metadata_langgraph_node 可为 None; 其他必须有非 None 值。"""
    missing = [
        i
        for i, s in enumerate(_SAMPLES)
        if s.get("metadata_langgraph_node") is None and s.get("name") != "LangGraph"
    ]
    assert missing == [], f"Non-LangGraph samples missing metadata_langgraph_node: {missing}"


@pytest.mark.parametrize(
    "sample",
    _SAMPLES,
    ids=[f"{i}-{s['event']}/{s['name']}" for i, s in enumerate(_SAMPLES)],
)
def test_route_stream_event_per_sample(sample: dict[str, Any]) -> None:
    """Each fixture sample maps to the expected lumen event type (or None)."""
    raw = _build_raw(sample)
    result = route_stream_event(raw, session_id=SESSION_ID)
    expected_type = _expected_event_type(sample)

    if expected_type is None:
        assert result is None, (
            f"Expected None for ({sample['event']}, {sample['name']}, "
            f"metadata_langgraph_node={sample.get('metadata_langgraph_node')}), "
            f"got {result}"
        )
    else:
        assert result is not None, (
            f"Expected {expected_type!r} for ({sample['event']}, {sample['name']}, "
            f"metadata_langgraph_node={sample.get('metadata_langgraph_node')}), "
            f"got None"
        )
        assert result.type == expected_type, f"Expected type={expected_type!r}, got {result.type!r}"


def test_route_stream_event_plan_created_nodes() -> None:
    """on_chain_end/planner yields PlanCreatedEvent with correct nodes list."""
    raw = {
        "event": "on_chain_end",
        "name": "planner",
        "run_id": "run-aabbccdd",
        "tags": [],
        "data": {
            "output": {
                "plan_nodes": [
                    {"id": "web-1", "title": "Web 检索", "track": "web"},
                    {"id": "kb-2", "title": "KB 检索", "track": "kb"},
                ]
            }
        },
        "metadata": {"langgraph_node": "planner"},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None
    assert result.type == "plan_created"
    assert len(result.nodes) == 2
    assert result.nodes[0].id == "web-1"


def test_route_stream_event_node_started_track() -> None:
    """on_chain_start/researcher yields NodeStartedEvent with track='web'."""
    raw = {
        "event": "on_chain_start",
        "name": "researcher",
        "run_id": "run-aabbccdd",
        "tags": [],
        "data": {"input": {}},
        "metadata": {"langgraph_node": "researcher"},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None
    assert result.type == "node_started"
    assert result.track == "web"
    assert result.node_id == "run-aabb"  # run_id[:8]


def test_route_stream_event_report_chunk_content() -> None:
    """on_chat_model_stream/writer yields ReportChunkEvent with chunk content."""
    chunk = MagicMock()
    chunk.content = "Hello world"
    raw = {
        "event": "on_chat_model_stream",
        "name": "FakeListChatModel",
        "run_id": "run-aabbccdd",
        "tags": [],
        "data": {"chunk": chunk},
        "metadata": {"langgraph_node": "writer"},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None
    assert result.type == "report_chunk"
    assert result.content == "Hello world"


def test_route_stream_event_done_report_id() -> None:
    """on_chain_end/LangGraph yields DoneEvent with report_id derived from session_id."""
    raw = {
        "event": "on_chain_end",
        "name": "LangGraph",
        "run_id": "run-aabbccdd",
        "tags": [],
        "data": {"output": {}},
        "metadata": {},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None
    assert result.type == "done"
    # report_id = "rpt-" + session_id[:8]
    assert result.report_id == f"rpt-{SESSION_ID[:8]}"


def test_route_stream_event_unknown_returns_none() -> None:
    """Unmatched event/name combinations return None (filtered)."""
    raw = {
        "event": "on_chain_start",
        "name": "planner",
        "run_id": "run-aabbccdd",
        "tags": [],
        "data": {},
        "metadata": {"langgraph_node": "planner"},
    }
    # on_chain_start/planner is NOT in the routing table -> None
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is None


def test_route_stream_event_metadata_fallback() -> None:
    """Fallback: if metadata.langgraph_node is absent, use metadata_langgraph_node."""
    chunk = MagicMock()
    chunk.content = "fallback test"
    raw = {
        "event": "on_chat_model_stream",
        "name": "FakeListChatModel",
        "run_id": "run-aabbccdd",
        "tags": [],
        "data": {"chunk": chunk},
        # no langgraph_node, only metadata_langgraph_node (fixture field)
        "metadata": {"metadata_langgraph_node": "writer"},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None
    assert result.type == "report_chunk"


def test_route_stream_event_empty_plan_nodes() -> None:
    """on_chain_end/planner with missing plan_nodes yields PlanCreatedEvent with empty list."""
    raw = {
        "event": "on_chain_end",
        "name": "planner",
        "run_id": "run-aabbccdd",
        "tags": [],
        "data": {"output": {}},
        "metadata": {"langgraph_node": "planner"},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None
    assert result.type == "plan_created"
    assert result.nodes == []


def test_state_schema_has_required_fields() -> None:
    """plan T5 RED: GraphState TypedDict 必须含 query/session_id/plan_nodes/report_chunks。"""
    from app.services.graph.state import GraphState

    annotations = GraphState.__annotations__
    assert "query" in annotations
    assert "session_id" in annotations
    assert "plan_nodes" in annotations
    assert "report_chunks" in annotations


# ---------------------------------------------------------------------------
# LOW-2: metadata fallback 分支覆盖 (3 个新测试)
# ---------------------------------------------------------------------------


def test_metadata_fallback_planner_path() -> None:
    """metadata_langgraph_node fallback works for planner on_chain_end."""
    raw = {
        "event": "on_chain_end",
        "name": "planner",
        "run_id": "x",
        "tags": [],
        "data": {"output": {"plan_nodes": []}},
        "metadata": {"metadata_langgraph_node": "planner"},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None and result.type == "plan_created"


def test_metadata_fallback_researcher_started() -> None:
    """metadata_langgraph_node fallback works for researcher on_chain_start."""
    raw = {
        "event": "on_chain_start",
        "name": "researcher",
        "run_id": "x",
        "tags": [],
        "data": {"input": {}},
        "metadata": {"metadata_langgraph_node": "researcher"},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None and result.type == "node_started"


def test_metadata_fallback_researcher_completed() -> None:
    """metadata_langgraph_node fallback works for researcher on_chain_end."""
    raw = {
        "event": "on_chain_end",
        "name": "researcher",
        "run_id": "x",
        "tags": [],
        "data": {"output": {}},
        "metadata": {"metadata_langgraph_node": "researcher"},
    }
    result = route_stream_event(raw, session_id=SESSION_ID)
    assert result is not None and result.type == "node_completed"
