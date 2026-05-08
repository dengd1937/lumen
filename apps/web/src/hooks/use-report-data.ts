"use client";

/**
 * useReportData — P3 reading page report-payload hook.
 *
 * Returns the full `ReportData` for the active session (sections,
 * citations, conflicts, kbDocuments embedded). Channel selection
 * mirrors useResearchData (NEXT_PUBLIC_LUMEN_DATA_SOURCE).
 *
 * Mock-channel `event_id` is the singleton MOCK_REPORT_TO_EVENT.report
 * placeholder; no audit_log / replay semantics (Codex M2).
 */

import { DATA_SOURCE } from "@/lib/data-source";
import { MOCK_REPORT } from "@/lib/report-mock";
import { useSessionId } from "@/lib/session-id-context";
import type { ReportData } from "@/types/report";

export interface UseReportDataResult {
  readonly report: ReportData | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

const SSE_PLACEHOLDER: UseReportDataResult = Object.freeze({
  report: null,
  isLoading: true,
  error: null,
});

const MOCK_RESULT: UseReportDataResult = Object.freeze({
  report: MOCK_REPORT,
  isLoading: false,
  error: null,
});

export function useReportData(): UseReportDataResult {
  const sessionId = useSessionId();

  if (DATA_SOURCE === "sse") {
    // TODO(T13): pass sessionId to the SSE client subscriber here.
    void sessionId;
    return SSE_PLACEHOLDER;
  }
  return MOCK_RESULT;
}
