"use client";

import { Sparkles } from "lucide-react";

import { useSessionId } from "@/lib/session-id-context";

export function ReportTopBar() {
  const sessionId = useSessionId();
  return (
    <header
      data-testid="p3-topbar"
      className="h-16 flex items-center gap-2 px-6 border-b border-border shrink-0"
    >
      <Sparkles
        data-testid="p3-topbar-logo-icon"
        className="size-5 text-primary"
        aria-hidden="true"
      />
      <span className="font-semibold text-fg">Lumen</span>
      <span className="text-fg-muted text-sm" aria-hidden="true">
        /
      </span>
      <span className="text-fg-muted text-sm">研究报告</span>
      <span
        data-testid="report-session-meta"
        className="ml-auto text-fg-muted text-sm font-mono"
      >
        session · {sessionId}
      </span>
    </header>
  );
}
