"use client";

/**
 * useResearchData — P2 progress page data hook.
 *
 * Per ADR-0002 D7 (mock vs sse channel) + plan T11: returns the
 * research-flow nodes/edges/tasks for the active session. Channel
 * selection is driven by `NEXT_PUBLIC_LUMEN_DATA_SOURCE`:
 *
 *   "mock" (default) — returns the static MOCK_NODES/EDGES/TASKS
 *   "sse"            — placeholder until T13 wires the SSE client
 *
 * Mock-channel `event_id` values are UI-key placeholders defined by
 * MOCK_NODE_TO_EVENT (see src/lib/research-mock.ts) and do NOT enter
 * audit_log persistence, replay cursors, or reducer idempotency
 * (Codex M2). Object identity is stable across renders because the
 * mock data is module-level frozen — no useMemo needed.
 */

import { DATA_SOURCE } from "@/lib/data-source";
import {
  MOCK_EDGES,
  MOCK_NODES,
  MOCK_TASKS,
} from "@/lib/research-mock";
import { useSessionId } from "@/lib/session-id-context";
import type {
  ResearchEdge,
  ResearchFlowNode,
  TaskRecord,
} from "@/types/research";

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

const SSE_PLACEHOLDER: UseResearchDataResult = Object.freeze({
  nodes: [],
  edges: [],
  tasks: [],
  activeNode: null,
  isLoading: true,
  error: null,
});

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

export function useResearchData(): UseResearchDataResult {
  // Read sessionId — preserved as a named binding so T13 sees the seam
  // when wiring the SSE client (`sseClient.subscribe(sessionId, ...)`).
  // The mock branch ignores it; the side effect (Context-not-mounted →
  // throw) is what we rely on at the wiring layer in mock mode.
  const sessionId = useSessionId();

  if (DATA_SOURCE === "sse") {
    // TODO(T13): pass sessionId to the SSE client subscriber here.
    void sessionId;
    return SSE_PLACEHOLDER;
  }
  return MOCK_RESULT;
}
