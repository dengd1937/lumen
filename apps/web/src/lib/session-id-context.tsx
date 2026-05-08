"use client";

/**
 * Session-ID Context — process-wide carrier for the active research
 * session_id. Per Codex H4 + plan T11: hooks (useResearchData /
 * useReportData / useKbData) read the session_id via this Context
 * rather than accepting it as a parameter, so consumers don't need to
 * thread sessionId through every component layer (which is awkward
 * across React Flow Provider boundaries).
 *
 * Strict mode: `useSessionId()` THROWS when no Provider wraps the
 * subtree. Silent fallback to a stub session_id would mask wiring bugs
 * (an SSE connection opened with a placeholder id would hang forever,
 * with the failure surface delayed to the user-visible "no events").
 */

import { createContext, useContext, type ReactNode } from "react";

const SessionIdContext = createContext<string | null>(null);

interface SessionIdProviderProps {
  readonly sessionId: string;
  readonly children: ReactNode;
}

export function SessionIdProvider({
  sessionId,
  children,
}: SessionIdProviderProps) {
  return (
    <SessionIdContext.Provider value={sessionId}>
      {children}
    </SessionIdContext.Provider>
  );
}

export function useSessionId(): string {
  const id = useContext(SessionIdContext);
  if (id === null) {
    throw new Error(
      "useSessionId must be used within a <SessionIdProvider>",
    );
  }
  return id;
}
