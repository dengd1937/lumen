"use client";

/**
 * useKbData — P3 reading page knowledge-base panel hook.
 *
 * Returns the kbDocuments + citations slice of the report (the
 * left-rail KbDocumentList consumes both). Decoupled from useReportData
 * so a future KB-only view (e.g. citation explorer) can mount without
 * loading the full report payload.
 *
 * Channel selection mirrors useResearchData. Mock channel sources from
 * MOCK_REPORT (single source of truth across the report page).
 */

import { DATA_SOURCE } from "@/lib/data-source";
import { MOCK_REPORT } from "@/lib/report-mock";
import { useSessionId } from "@/lib/session-id-context";
import type {
  CitationRecord,
  KbDocumentRecord,
} from "@/types/report";

export interface UseKbDataResult {
  readonly kbDocuments: ReadonlyArray<KbDocumentRecord>;
  readonly citations: ReadonlyArray<CitationRecord>;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

const SSE_PLACEHOLDER: UseKbDataResult = Object.freeze({
  kbDocuments: [],
  citations: [],
  isLoading: true,
  error: null,
});

const MOCK_RESULT: UseKbDataResult = Object.freeze({
  kbDocuments: MOCK_REPORT.kbDocuments,
  citations: MOCK_REPORT.citations,
  isLoading: false,
  error: null,
});

export function useKbData(): UseKbDataResult {
  const sessionId = useSessionId();

  if (DATA_SOURCE === "sse") {
    // TODO(T13): pass sessionId to the SSE client subscriber here. KB
    // panel subscribes independently of the full-report channel — KB
    // documents may stream earlier than the report itself completes.
    void sessionId;
    return SSE_PLACEHOLDER;
  }
  return MOCK_RESULT;
}
