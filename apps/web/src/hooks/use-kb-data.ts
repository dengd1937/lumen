"use client";

/**
 * useKbData — P3 reading page knowledge-base panel hook.
 *
 * SSE channel (T13): derives kbDocuments from `node_completed.sources`
 * (each source becomes a KbDocumentRecord). Citations are not on the
 * wire in M1.0 (defer to M1.A backend); SSE channel returns an empty
 * citations array until then.
 *
 * Decoupled from useReportData so a future KB-only view can mount
 * without loading the full report payload, and so the kb panel
 * lights up as soon as the first node_completed lands rather than
 * waiting for `done`.
 */

import { useEffect, useReducer } from "react";

import { DATA_SOURCE, SSE_API_BASE_URL } from "@/lib/data-source";
import { MOCK_REPORT } from "@/lib/report-mock";
import { useSessionId } from "@/lib/session-id-context";
import { createSseClient } from "@/lib/sse-client";
import type {
  CitationRecord,
  KbDocumentRecord,
} from "@/types/report";
import type { AnyWireEvent } from "@/types/research-events";

export interface UseKbDataResult {
  readonly kbDocuments: ReadonlyArray<KbDocumentRecord>;
  readonly citations: ReadonlyArray<CitationRecord>;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

const MOCK_RESULT: UseKbDataResult = Object.freeze({
  kbDocuments: MOCK_REPORT.kbDocuments,
  citations: MOCK_REPORT.citations,
  isLoading: false,
  error: null,
});

interface SseAccum {
  readonly docs: ReadonlyArray<KbDocumentRecord>;
  readonly seenEventIds: ReadonlySet<string>;
  readonly seenDocIds: ReadonlySet<string>;
  readonly received: number;
  readonly error: Error | null;
}

const SSE_INITIAL: SseAccum = Object.freeze({
  docs: [],
  seenEventIds: new Set<string>(),
  seenDocIds: new Set<string>(),
  received: 0,
  error: null,
});

type SseAction =
  | { readonly kind: "event"; readonly event: AnyWireEvent }
  | { readonly kind: "error"; readonly error: Error };

function sseReducer(state: SseAccum, action: SseAction): SseAccum {
  if (action.kind === "error") return { ...state, error: action.error };
  const ev = action.event;
  if (ev.type === "heartbeat") return state;
  if (state.seenEventIds.has(ev.event_id)) return state;

  switch (ev.type) {
    case "node_completed": {
      const seenE = new Set(state.seenEventIds);
      seenE.add(ev.event_id);
      const seenD = new Set(state.seenDocIds);
      const newDocs: KbDocumentRecord[] = [];
      for (const s of ev.sources) {
        if (seenD.has(s.id)) continue;
        seenD.add(s.id);
        newDocs.push({
          id: s.id,
          // SourceRef has no track field; default to "web" until M1.A
          // backend tags origin per source. Renderer's track-only
          // styling stays inert.
          track: "web",
          title: s.title,
          url: s.url ?? "",
          date: "",
          citationIds: [],
        });
      }
      return {
        ...state,
        seenEventIds: seenE,
        seenDocIds: seenD,
        docs: [...state.docs, ...newDocs],
        received: state.received + 1,
      };
    }
    case "plan_created":
    case "node_started":
    case "node_progress":
    case "conflict_detected":
    case "report_chunk":
    case "done":
    case "error":
      // Not consumed by the kb hook. Returning original state keeps
      // identity stable for downstream re-render avoidance.
      return state;
  }
}

export function useKbData(): UseKbDataResult {
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
      kbDocuments: state.docs,
      citations: [],
      isLoading: state.received === 0 && state.error === null,
      error: state.error,
    };
  }
  return MOCK_RESULT;
}
