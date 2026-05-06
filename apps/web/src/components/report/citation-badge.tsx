"use client";

import { useState } from "react";
import type { Ref } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CitationRecord } from "@/types/report";

export type CitationBadgeVariant = "primary" | "web-track" | "kb-track";

interface CitationBadgeProps {
  citation: CitationRecord;
  variant?: CitationBadgeVariant;
  isOpen?: boolean;
  onToggle?: () => void;
  /**
   * Forward a ref to the underlying button. Used by parent (e.g.
   * ReportMarkdownCanvas) to focus-return after CitationPanel closes.
   * React 19 ref-as-prop pattern; no `forwardRef` needed.
   */
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT_CLASSES: Record<CitationBadgeVariant, string> = {
  primary: "bg-citation-badge text-primary-fg",
  "web-track":
    "bg-track-web-bg border border-track-web-border text-track-web-fg",
  "kb-track":
    "bg-track-kb-bg border border-track-kb-border text-track-kb-fg",
};

export function CitationBadge({
  citation,
  variant = "primary",
  isOpen,
  onToggle,
  ref,
}: CitationBadgeProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpen ?? internalOpen;

  const toggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalOpen((s) => !s);
    }
  };

  // aria-expanded 反映关联 CitationPanel（T6）的开合状态，与 hover 触发的 Tooltip 无关。
  // 元素是 native <button>（TooltipTrigger 默认 render），自带 button 角色，无需显式
  // role="button"。aria-label 提供可访问名。
  return (
    <Tooltip>
      <TooltipTrigger
        ref={ref}
        data-testid={`citation-badge-${citation.id}`}
        type="button"
        aria-label={`引用 ${citation.index}，来源 ${citation.sourceTitle}`}
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          "inline-flex items-center justify-center px-1.5 py-0.5 rounded-sm text-xs font-mono font-semibold whitespace-nowrap cursor-pointer transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
          VARIANT_CLASSES[variant],
        )}
      >
        [{citation.index}]
      </TooltipTrigger>
      <TooltipContent role="tooltip" className="max-w-xs">
        <div className="text-xs leading-relaxed text-left">
          <div className="font-semibold">{citation.sourceTitle}</div>
          <div className="opacity-80 break-all">{citation.url}</div>
          <div className="opacity-80">
            相似度 {(citation.similarity * 100).toFixed(0)}%
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
