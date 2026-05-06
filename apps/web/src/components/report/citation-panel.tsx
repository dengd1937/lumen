"use client";

import { X } from "lucide-react";
import type { CSSProperties, RefObject } from "react";


import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CitationRecord } from "@/types/report";

interface CitationPanelProps {
  citation: CitationRecord | null;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

const PANEL_TITLE_ID = "citation-panel-title";

const panelTransitionStyle: CSSProperties = {
  transitionDuration: "var(--duration-base)",
};

export function CitationPanel({
  citation,
  triggerRef,
  onClose,
}: CitationPanelProps) {
  const isOpen = citation !== null;

  // close button、ESC、outside-click 都最终经 onOpenChange(false) → onClose()。
  // base-ui Dialog 内部 focus management 会在关闭过程中重置焦点，因此 focus return
  // 必须在 `onOpenChangeComplete`（动画完成 + popup 卸载后）触发，不能在 onOpenChange
  // 同步阶段调用，否则被 base-ui 内部覆盖（WCAG 2.4.3）。
  return (
    <Sheet
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) triggerRef?.current?.focus();
      }}
    >
      <SheetContent
        data-testid="citation-panel"
        side="right"
        overlay={false}
        showCloseButton={false}
        aria-modal="false"
        aria-labelledby={PANEL_TITLE_ID}
        style={panelTransitionStyle}
        className={cn(
          "w-[360px] sm:max-w-[360px]",
          "data-[side=right]:w-[360px] data-[side=right]:sm:max-w-[360px]",
          "data-[side=right]:data-ending-style:translate-x-full",
          "data-[side=right]:data-starting-style:translate-x-full",
          "bg-surface text-fg shadow-md",
          "p-0 gap-0",
        )}
      >
        {citation ? (
          <>
            <SheetHeader className="flex-row items-start justify-between gap-2 px-5 py-4 border-b border-border">
              <SheetTitle
                id={PANEL_TITLE_ID}
                className="text-sm font-semibold flex-1 min-w-0"
              >
                <span className="font-mono text-fg-muted mr-2">
                  [{citation.index}]
                </span>
                {citation.sourceTitle}
              </SheetTitle>
              <button
                data-testid="citation-panel-close"
                type="button"
                onClick={onClose}
                aria-label="关闭引用浮窗"
                className={cn(
                  "shrink-0 rounded-sm p-1 text-fg-muted transition-colors hover:text-fg hover:bg-surface-elevated",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
                )}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
              <div
                data-testid="citation-snippet-body"
                className="bg-citation-highlight border-l-[3px] border-conflict-fg rounded-sm p-3 text-sm leading-loose text-fg"
              >
                {citation.snippet}
              </div>
              <dl className="text-xs text-fg-muted flex flex-col gap-1">
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">来源</dt>
                  <dd className="break-all">{citation.url}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">日期</dt>
                  <dd>{citation.date}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">相似度</dt>
                  <dd>{(citation.similarity * 100).toFixed(0)}%</dd>
                </div>
              </dl>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
