"use client";

/**
 * useResearchData — P2 progress page data hook.
 *
 * Per ADR-0002 D7 (mock vs sse channel) + plan T11/T13: returns the
 * research-flow nodes/edges/tasks for the active session. Channel
 * selection is driven by `NEXT_PUBLIC_LUMEN_DATA_SOURCE`:
 *
 *   "mock" (default) — returns the static MOCK_NODES/EDGES/TASKS
 *   "sse"            — opens an SseClient, accumulates events into a
 *                      reducer-managed state. Returns isLoading=true
 *                      until plan_created lands; thereafter exposes
 *                      live nodes/edges/tasks.
 *
 * Reducer-level idempotency: T13 sse-client already drops duplicate
 * event_ids before invoking onEvent, but the reducer is a defense-in-
 * depth so a hook user that bypasses the client (e.g. a test stub)
 * can't double-apply.
 */

import { useEffect, useReducer } from "react";

import { DATA_SOURCE, SSE_API_BASE_URL } from "@/lib/data-source";
import {
  MOCK_EDGES,
  MOCK_NODES,
  MOCK_TASKS,
} from "@/lib/research-mock";
import { useSessionId } from "@/lib/session-id-context";
import { createSseClient } from "@/lib/sse-client";
import type {
  ResearchEdge,
  ResearchFlowNode,
  TaskRecord,
} from "@/types/research";
import type { AnyWireEvent } from "@/types/research-events";

export interface UseResearchDataResult {
  readonly nodes: ReadonlyArray<ResearchFlowNode>;
  readonly edges: ReadonlyArray<ResearchEdge>;
  readonly tasks: ReadonlyArray<TaskRecord>;
  /**
   * Currently active (in-flight) research node. Mock channel returns
   * the first `state="retrieving"` node found in document order. SSE
   * channel (T13) will derive this from the most recent `node_started`
   * event without a matching `node_completed` — pickActiveNode is mock-
   * only and gets replaced, not extended.
   */
  readonly activeNode: ResearchFlowNode | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

function pickActiveNode(
  nodes: ReadonlyArray<ResearchFlowNode>,
): ResearchFlowNode | null {
  for (const n of nodes) {
    if (n.type === "researchNode" && n.data.state === "retrieving") {
      return n;
    }
  }
  return null;
}

const MOCK_RESULT: UseResearchDataResult = Object.freeze({
  nodes: MOCK_NODES,
  edges: MOCK_EDGES,
  tasks: MOCK_TASKS,
  activeNode: pickActiveNode(MOCK_NODES),
  isLoading: false,
  error: null,
});

interface SseAccum {
  readonly nodes: ReadonlyArray<ResearchFlowNode>;
  readonly edges: ReadonlyArray<ResearchEdge>;
  readonly tasks: ReadonlyArray<TaskRecord>;
  readonly seenEventIds: ReadonlySet<string>;
  readonly received: number;
  readonly error: Error | null;
  readonly activeNodeId: string | null;
}

const SSE_INITIAL: SseAccum = Object.freeze({
  nodes: [],
  edges: [],
  tasks: [],
  seenEventIds: new Set<string>(),
  received: 0,
  error: null,
  activeNodeId: null,
});

type SseAction =
  | { readonly kind: "event"; readonly event: AnyWireEvent }
  | { readonly kind: "error"; readonly error: Error };

function sseReducer(state: SseAccum, action: SseAction): SseAccum {
  if (action.kind === "error") {
    return { ...state, error: action.error };
  }
  const ev = action.event;
  if (ev.type === "heartbeat") {
    // Heartbeats keep the channel warm; reducer state is unchanged.
    return state;
  }
  // Reducer-level idempotency: defense-in-depth in case a duplicate
  // somehow bypassed the sse-client dedupe (e.g. test stub injection).
  if (state.seenEventIds.has(ev.event_id)) return state;

  switch (ev.type) {
    case "plan_created": {
      const seen = new Set(state.seenEventIds);
      seen.add(ev.event_id);
      // Positions are not on the wire yet (M1.A); React Flow's
      // auto-layout takes over until then.
      return {
        ...state,
        seenEventIds: seen,
        received: state.received + 1,
        nodes: ev.nodes.map((n) => ({
          id: n.id,
          type: "researchNode" as const,
          position: { x: 0, y: 0 },
          data: {
            title: n.title,
            track: n.track,
            state: "planning" as const,
          },
        })),
      };
    }
    case "node_started": {
      const seen = new Set(state.seenEventIds);
      seen.add(ev.event_id);
      return {
        ...state,
        seenEventIds: seen,
        received: state.received + 1,
        activeNodeId: ev.node_id,
        nodes: state.nodes.map((n) =>
          n.id === ev.node_id && n.type === "researchNode"
            ? { ...n, data: { ...n.data, state: "retrieving" as const } }
            : n,
        ),
      };
    }
    case "node_progress": {
      const seen = new Set(state.seenEventIds);
      seen.add(ev.event_id);
      return {
        ...state,
        seenEventIds: seen,
        received: state.received + 1,
        nodes: state.nodes.map((n) =>
          n.id === ev.node_id && n.type === "researchNode"
            ? { ...n, data: { ...n.data, progress: ev.message } }
            : n,
        ),
      };
    }
    case "node_completed": {
      const seen = new Set(state.seenEventIds);
      seen.add(ev.event_id);
      return {
        ...state,
        seenEventIds: seen,
        received: state.received + 1,
        activeNodeId:
          state.activeNodeId === ev.node_id ? null : state.activeNodeId,
        nodes: state.nodes.map((n) =>
          n.id === ev.node_id && n.type === "researchNode"
            ? { ...n, data: { ...n.data, state: "completed" as const } }
            : n,
        ),
      };
    }
    case "conflict_detected":
    case "report_chunk":
    case "done":
    case "error":
      // Routed to use-report-data — return original state to keep
      // identity stable.
      return state;
  }
}

export function useResearchData(): UseResearchDataResult {
  const sessionId = useSessionId();
  const [state, dispatch] = useReducer(sseReducer, SSE_INITIAL);

  useEffect(() => {
    if (DATA_SOURCE !== "sse") return;
    const client = createSseClient({
      url: `${SSE_API_BASE_URL}/api/research/${encodeURIComponent(sessionId)}/stream`,
      onEvent: (event) => dispatch({ kind: "event", event }),
      onError: (error) => dispatch({ kind: "error", error }),
    });
    client.start();
    return () => {
      client.close();
    };
  }, [sessionId]);

  if (DATA_SOURCE === "sse") {
    return {
      nodes: state.nodes,
      edges: state.edges,
      tasks: state.tasks,
      activeNode:
        state.activeNodeId === null
          ? null
          : (state.nodes.find((n) => n.id === state.activeNodeId) ?? null),
      isLoading: state.received === 0 && state.error === null,
      error: state.error,
    };
  }
  return MOCK_RESULT;
}
