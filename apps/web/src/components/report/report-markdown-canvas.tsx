"use client";

import { useMemo, useRef, useState } from "react";

import type { ReportData } from "@/types/report";

import { CitationBadge } from "./citation-badge";
import { CitationPanel } from "./citation-panel";
import { ConflictBlock } from "./conflict-block";

interface ReportMarkdownCanvasProps {
  report: ReportData;
}

function assertNever(x: never): null {
  if (process.env.NODE_ENV !== "production") {
    console.error("Unhandled ReportBodyPart type:", x);
  }
  return null;
}

export function ReportMarkdownCanvas({ report }: ReportMarkdownCanvasProps) {
  // 默认打开第 1 条引用（contract: T6-12）。useState 仅在 mount 时捕获该值；report
  // prop 当前是模块级 MOCK_REPORT 静态常量，不会变。若未来切换为动态数据源，需要在
  // sessionId 变化时通过 key 重建组件或加同步 effect。
  const [openCitationId, setOpenCitationId] = useState<string | null>(
    report.citations[0]?.id ?? null,
  );
  const badgeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const triggerRef = useRef<HTMLElement | null>(null);

  const citationsById = useMemo(
    () => new Map(report.citations.map((c) => [c.id, c])),
    [report.citations],
  );
  const conflictsById = useMemo(
    () => new Map(report.conflicts.map((c) => [c.id, c])),
    [report.conflicts],
  );

  const openCitation = openCitationId
    ? (citationsById.get(openCitationId) ?? null)
    : null;

  const handleToggle = (citationId: string) => {
    const button = badgeRefs.current.get(citationId);
    if (button) {
      triggerRef.current = button;
    }
    setOpenCitationId((current) =>
      current === citationId ? null : citationId,
    );
  };

  const handleClose = () => setOpenCitationId(null);

  return (
    <div
      data-testid="report-canvas"
      className="h-full overflow-y-auto px-8 py-6 text-base text-fg"
    >
      <h1 className="text-2xl font-bold mb-6 text-fg leading-tight">
        {report.title}
      </h1>
      {report.sections.map((section) => (
        <section key={section.id} className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-fg">
            {section.heading}
          </h2>
          <div className="text-fg leading-relaxed">
            {section.bodyParts.map((part, idx) => {
              if (part.type === "text") {
                return (
                  <span key={`${section.id}-text-${idx}`}>{part.content}</span>
                );
              }
              if (part.type === "citation-inline") {
                const citation = citationsById.get(part.citationId);
                if (!citation) {
                  // mock 数据契约 C2-10 保证有效引用；运行时缺失则跳过渲染。
                  return null;
                }
                return (
                  <CitationBadge
                    key={`${section.id}-citation-${idx}`}
                    ref={(el) => {
                      if (el) badgeRefs.current.set(citation.id, el);
                      else badgeRefs.current.delete(citation.id);
                    }}
                    citation={citation}
                    isOpen={openCitationId === citation.id}
                    onToggle={() => handleToggle(citation.id)}
                  />
                );
              }
              if (part.type === "conflict") {
                const conflict = conflictsById.get(part.conflictId);
                if (!conflict) {
                  return null;
                }
                return (
                  <ConflictBlock
                    key={`${section.id}-conflict-${idx}`}
                    conflict={conflict}
                  />
                );
              }
              // 编译期穷举检查：ReportBodyPart 联合扩展时 tsc 会在此处报错。
              return assertNever(part);
            })}
          </div>
        </section>
      ))}
      <CitationPanel
        citation={openCitation}
        triggerRef={triggerRef}
        onClose={handleClose}
      />
    </div>
  );
}
