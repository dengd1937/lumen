"use client";

import { Database, Globe } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import type { CitationRecord, KbDocumentRecord } from "@/types/report";

import { CitationBadge } from "./citation-badge";

type FilterTab = "all" | "web" | "kb";

interface KbDocumentListProps {
  documents: readonly KbDocumentRecord[];
  citations: readonly CitationRecord[];
}

const TAB_LABEL: Record<FilterTab, string> = {
  all: "全部",
  web: "Web",
  kb: "KB",
};

export function KbDocumentList({
  documents,
  citations,
}: KbDocumentListProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const filteredDocs = useMemo(
    () =>
      documents.filter((d) => (activeTab === "all" ? true : d.track === activeTab)),
    [documents, activeTab],
  );

  const citationsById = useMemo(
    () => new Map(citations.map((c) => [c.id, c])),
    [citations],
  );

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < filteredDocs.length) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, filteredDocs.length]);

  const handleTabClick = (tab: FilterTab) => {
    // 切 tab 时显式清空 itemRefs：React 会在 unmount 时把卸载项的 ref 置为 null（无 DOM 泄漏），
    // 但 array 长度不会自动缩短；显式 reset 让数组每次跟随 filteredDocs 重新填充，避免读者误解。
    itemRefs.current = [];
    setActiveTab(tab);
    setFocusedIndex(-1);
  };

  const handleItemKeyDown = (
    e: KeyboardEvent<HTMLDivElement>,
    idx: number,
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex(Math.min(idx + 1, filteredDocs.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex(Math.max(idx - 1, 0));
    }
  };

  return (
    <div
      data-testid="kb-document-list"
      className="flex flex-col h-full w-full border-r border-border"
    >
      <header className="px-5 py-4 border-b border-border shrink-0">
        <h2 className="text-fg font-semibold text-sm">证据来源</h2>
        <p className="text-fg-muted text-xs mt-1">
          共 {documents.length} 篇文档
        </p>
      </header>
      <div
        data-testid="filter-tabs"
        role="tablist"
        aria-label="按轨道筛选证据来源"
        className="flex gap-1 px-5 py-2 border-b border-border shrink-0"
      >
        {(["all", "web", "kb"] as const).map((tab) => (
          <button
            key={tab}
            data-testid={`tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls="kb-document-tabpanel"
            id={`tab-${tab}-trigger`}
            onClick={() => handleTabClick(tab)}
            className={cn(
              "px-2.5 py-1 rounded-sm text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
              activeTab === tab
                ? "bg-surface text-fg"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {TAB_LABEL[tab]}
          </button>
        ))}
      </div>
      <div
        id="kb-document-tabpanel"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}-trigger`}
        className="flex-1 overflow-y-auto"
      >
        <div role="list">
        {filteredDocs.map((doc, idx) => {
          const Icon = doc.track === "web" ? Globe : Database;
          const trackTextClass =
            doc.track === "web" ? "text-track-web-fg" : "text-track-kb-fg";
          const linkedCitation = doc.citationIds[0]
            ? citationsById.get(doc.citationIds[0])
            : undefined;
          return (
            /* 组件契约（docs/designs/lumen/components/kb-document-list.md）字面要求每项 role="listitem"
               + ArrowUp/Down 键盘导航。ARIA listitem 是 non-interactive role，因此 jsx-a11y 默认会 flag
               tabIndex 与 onKeyDown。本场景的键盘可达性是契约硬约束；保留 listitem 语义而非改用
               menuitem，因列表项不触发动作只激活焦点（active 联动由父 ReportMarkdownCanvas 决定）。 */
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 见上方 contract 注释
            <div
              key={doc.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              data-testid={`kb-item-${doc.id}`}
              role="listitem"
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 见上方 contract 注释
              tabIndex={0}
              onKeyDown={(e) => handleItemKeyDown(e, idx)}
              className={cn(
                "px-5 py-2.5 flex items-start gap-2.5 border-b border-border/50 cursor-pointer transition-colors",
                "hover:bg-surface focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
              )}
            >
              <Icon
                className={cn("size-4 mt-0.5 shrink-0", trackTextClass)}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {linkedCitation ? (
                    <CitationBadge
                      citation={linkedCitation}
                      variant={
                        doc.track === "web" ? "web-track" : "kb-track"
                      }
                    />
                  ) : null}
                  <span className="text-sm font-medium text-fg truncate">
                    {doc.title}
                  </span>
                </div>
                <p className="text-fg-muted text-xs mt-0.5 truncate">
                  {doc.url} · {doc.date}
                </p>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
