"use client";

import { Pause } from "lucide-react";

import { useResearchData } from "@/hooks/use-research-data";
import type { ResearchFlowNode } from "@/types/research";

const IDLE_LABEL = "等待研究启动";

function getActiveLabel(activeNode: ResearchFlowNode | null): string {
  // pickActiveNode currently only returns researchNode (mock channel),
  // but this function is the future-proof seam for T13: when SSE
  // events surface a conflictNode as active, we render the conflict
  // copy instead of silently falling through to IDLE_LABEL.
  if (activeNode === null) return IDLE_LABEL;
  if (activeNode.type === "researchNode") {
    return `正在检索 · ${activeNode.data.title}`;
  }
  return `冲突检测中 · ${activeNode.data.title}`;
}

export function BottomActiveBar() {
  const { activeNode } = useResearchData();
  const label = getActiveLabel(activeNode);

  return (
    <footer
      data-testid="bottom-active-bar"
      className="h-14 w-full shrink-0 bg-surface border-t border-border flex items-center px-6 gap-6"
    >
      <span
        data-testid="active-node-label"
        className="flex-1 min-w-0 text-fg text-base truncate"
      >
        {label}
      </span>
      <span
        data-testid="sse-meta"
        className="text-fg-muted text-sm font-mono whitespace-nowrap"
      >
        2 events / s
      </span>
      <div
        data-testid="controls-area"
        className="flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          data-testid="btn-pause"
          aria-label="暂停研究"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pause className="size-4" aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}
