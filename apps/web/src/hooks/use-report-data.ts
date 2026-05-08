"use client";

/**
 * useReportData — P3 reading page report-payload hook.
 *
 * Returns the full `ReportData` for the active session. Channel
 * selection mirrors useResearchData (NEXT_PUBLIC_LUMEN_DATA_SOURCE).
 *
 * SSE channel (T13): accumulates `report_chunk` content; finalizes a
 * minimal ReportData shape on `done`. Full sections/citations/conflicts
 * structure is wired in M1.A when the backend emits structured report
 * events; M1.0 surfaces the streamed markdown text into a single
 * "stream" section so downstream renderers can light up.
 */

import { useEffect, useReducer } from "react";

import { DATA_SOURCE, SSE_API_BASE_URL } from "@/lib/data-source";
import { MOCK_REPORT } from "@/lib/report-mock";
import { useSessionId } from "@/lib/session-id-context";
import { createSseClient } from "@/lib/sse-client";
import type { ReportData } from "@/types/report";
import type { AnyWireEvent } from "@/types/research-events";

export interface UseReportDataResult {
  readonly report: ReportData | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

const MOCK_RESULT: UseReportDataResult = Object.freeze({
  report: MOCK_REPORT,
  isLoading: false,
  error: null,
});

interface SseAccum {
  readonly chunks: ReadonlyArray<string>;
  readonly seenEventIds: ReadonlySet<string>;
  readonly done: boolean;
  readonly error: Error | null;
  readonly reportId: string | null;
  readonly sessionId: string;
}

type SseAction =
  | { readonly kind: "event"; readonly event: AnyWireEvent }
  | { readonly kind: "error"; readonly error: Error }
  | { readonly kind: "reset"; readonly sessionId: string };

function makeInitial(sessionId: string): SseAccum {
  return Object.freeze({
    chunks: [],
    seenEventIds: new Set<string>(),
    done: false,
    error: null,
    reportId: null,
    sessionId,
  });
}

function sseReducer(state: SseAccum, action: SseAction): SseAccum {
  if (action.kind === "reset") {
    // Triggered when sessionId changes — reducer state is bound to a
    // single session because state.sessionId feeds buildReport.
    return makeInitial(action.sessionId);
  }
  if (action.kind === "error") return { ...state, error: action.error };

  const ev = action.event;
  if (ev.type === "heartbeat") return state;

  switch (ev.type) {
    case "report_chunk": {
      if (state.seenEventIds.has(ev.event_id)) return state;
      const seen = new Set(state.seenEventIds);
      seen.add(ev.event_id);
      return {
        ...state,
        seenEventIds: seen,
        chunks: [...state.chunks, ev.content],
      };
    }
    case "done": {
      if (state.seenEventIds.has(ev.event_id)) return state;
      const seen = new Set(state.seenEventIds);
      seen.add(ev.event_id);
      return { ...state, seenEventIds: seen, done: true, reportId: ev.report_id };
    }
    case "error": {
      if (state.seenEventIds.has(ev.event_id)) return state;
      const seen = new Set(state.seenEventIds);
      seen.add(ev.event_id);
      return { ...state, seenEventIds: seen, error: new Error(ev.message) };
    }
    case "plan_created":
    case "node_started":
    case "node_progress":
    case "node_completed":
    case "conflict_detected":
      // Out of scope for the report hook (research/kb hooks consume).
      // Returning original `state` keeps identity stable so consumer
      // re-renders are minimized.
      return state;
  }
}

function buildReport(state: SseAccum): ReportData | null {
  if (state.chunks.length === 0 && !state.done) return null;
  return {
    sessionId: state.sessionId,
    title: "研究报告",
    generatedAt: new Date().toISOString().slice(0, 10),
    sections: [
      {
        id: "stream",
        heading: "实时输出",
        bodyParts: [{ type: "text", content: state.chunks.join("") }],
      },
    ],
    citations: [],
    conflicts: [],
    kbDocuments: [],
  };
}

export function useReportData(): UseReportDataResult {
  const sessionId = useSessionId();
  const [state, dispatch] = useReducer(sseReducer, sessionId, makeInitial);

  useEffect(() => {
    if (DATA_SOURCE !== "sse") return;
    // Reset reducer state — useReducer's lazy init runs only on mount,
    // but session rotation must clear stale chunks before the new
    // session's events land (else buildReport stitches them together).
    dispatch({ kind: "reset", sessionId });
    const client = createSseClient({
      url: `${SSE_API_BASE_URL}/api/research/${encodeURIComponent(sessionId)}/stream`,
      onEvent: (event) => {
        dispatch({ kind: "event", event });
        // Backend-emitted error events are terminal — close the client
        // to avoid the idle-reconnect cycle still firing 60s later
        // (the EventSource itself stays open through onmessage).
        if (event.type === "error") client.close();
      },
      onError: (error) => dispatch({ kind: "error", error }),
    });
    client.start();
    return () => {
      client.close();
    };
  }, [sessionId]);

  if (DATA_SOURCE === "sse") {
    const report = buildReport(state);
    return {
      report,
      isLoading: report === null && state.error === null,
      error: state.error,
    };
  }
  return MOCK_RESULT;
}
