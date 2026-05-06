import { Lightbulb, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ConflictRecord } from "@/types/report";

interface ConflictBlockProps {
  conflict: ConflictRecord;
  className?: string;
}

export function ConflictBlock({ conflict, className }: ConflictBlockProps) {
  const headerId = `conflict-block-${conflict.id}-heading`;

  // 使用 <div role="region"> 而非 <section>：<section> + aria-labelledby 隐式 region 与显式
  // role="region" 触发 jsx-a11y/no-redundant-roles。组件契约和 E2E spec 字面要求 role 属性可读，
  // 因此选择 div 元素让显式 role 不冲突。
  return (
    <div
      data-testid={`conflict-block-${conflict.id}`}
      role="region"
      aria-labelledby={headerId}
      className={cn(
        "bg-conflict-bg border-l-[3px] border-conflict-border rounded-md py-4 px-5 my-4",
        className,
      )}
    >
      <header className="flex items-center gap-2 mb-3">
        <TriangleAlert
          className="size-4 text-conflict-fg shrink-0"
          aria-hidden="true"
        />
        <h3 id={headerId} className="text-sm font-semibold text-fg">
          {conflict.title}
        </h3>
        <span className="text-fg-muted text-sm" aria-hidden="true">
          /
        </span>
        <span className="text-fg-muted text-sm">{conflict.subtitle}</span>
      </header>
      <div className="flex flex-row gap-3">
        {conflict.columns.map((col, i) => (
          // key 用 index：columns 是 readonly [ConflictColumn, ConflictColumn] 固定 2-tuple，
          // 位置而非 track 是天然稳定标识，避免未来类型放松后 track 重复导致 key collision。
          <div
            key={`${conflict.id}-col-${i}`}
            data-testid={`conflict-col-${i + 1}`}
            className={cn(
              "flex-1 bg-surface rounded-sm border p-3",
              col.track === "web"
                ? "border-track-web-border"
                : "border-track-kb-border",
            )}
          >
            <div
              className={cn(
                "text-xs font-mono font-semibold mb-2",
                col.track === "web"
                  ? "text-track-web-fg"
                  : "text-track-kb-fg",
              )}
            >
              {col.label}
            </div>
            <div className="text-sm text-fg leading-relaxed">{col.content}</div>
          </div>
        ))}
      </div>
      <div
        role="note"
        className="flex items-start gap-2 mt-3 text-sm font-medium text-fg-muted"
      >
        <Lightbulb
          className="size-4 text-conflict-fg mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <p>{conflict.aiNote}</p>
      </div>
    </div>
  );
}
