"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { useKbData } from "@/hooks/use-kb-data";
import { useReportData } from "@/hooks/use-report-data";
import { SessionIdProvider } from "@/lib/session-id-context";

import { KbDocumentList } from "./kb-document-list";
import { ReportMarkdownCanvas } from "./report-markdown-canvas";
import { ReportTopBar } from "./report-top-bar";

interface ReportReadingPageProps {
  sessionId: string;
}

export function ReportReadingPage({ sessionId }: ReportReadingPageProps) {
  return (
    <SessionIdProvider sessionId={sessionId}>
      <ReportReadingPageContent />
    </SessionIdProvider>
  );
}

function ReportReadingPageContent() {
  const { report, isLoading: reportLoading, error: reportError } =
    useReportData();
  const {
    kbDocuments,
    citations,
    isLoading: kbLoading,
    error: kbError,
  } = useKbData();

  // TODO(T13): when SSE is wired, surface report+kb errors separately
  // (current `??` collapse silently drops kbError when reportError fires
  // — fine while skeleton has no error UI, but masks debug info once
  // T13 renders an actual error message).
  const error = reportError ?? kbError;

  // error UI 分支 — 优先于 Skeleton（error 是终态，不应继续 loading）
  if (error) {
    return <ReportReadingError message={error.message} />;
  }

  const isLoading = reportLoading || kbLoading;
  if (isLoading || !report) {
    return <ReportReadingSkeleton />;
  }

  return (
    <TooltipProvider delay={0}>
      <main
        data-testid="p3-root"
        className="bg-bg text-fg min-h-screen flex flex-col"
      >
        <ReportTopBar />
        <div data-testid="p3-split" className="flex h-[836px] shrink-0">
          <aside
            data-testid="p3-kb-panel"
            className="w-[288px] h-full"
            aria-label="知识库文档列表"
          >
            {/* border-r 由 KbDocumentList 自身承载，让 list root w-full = aside width (288px) 含 border 后仍 288px (box-sizing: border-box)。 */}
            <KbDocumentList
              documents={kbDocuments}
              citations={citations}
            />
          </aside>
          <section
            data-testid="p3-canvas"
            className="flex-1 min-w-0 h-full"
            aria-label="报告正文画布"
          >
            <ReportMarkdownCanvas report={report} />
          </section>
          <div
            data-testid="p3-citation-panel-slot"
            className="w-[360px] h-full border-l border-border"
            aria-hidden="true"
          >
            {/* layout reservation：保留 360px 让 canvas 不延伸到右边缘。CitationPanel 通过
                base-ui Dialog Portal 渲染到 body 顶层 fixed 定位（视口锚定，DOM 父级与视觉
                位置无关），视觉上恰好覆盖此区域。空 div + aria-hidden=true 把它从 a11y tree
                移除，避免 SR 朗读空 landmark；DOM 结构 vs layout intent 的语义 gap 由此说明。 */}
          </div>
        </div>
      </main>
    </TooltipProvider>
  );
}

/**
 * Error UI shown when useReportData or useKbData enters a terminal error
 * state (e.g. backend emits an ErrorEvent over the SSE channel). This is
 * a final state — the page does not retry or continue loading.
 * data-state="error" mirrors data-state="loading" on ReportReadingSkeleton
 * for SR / test query symmetry.
 */
function ReportReadingError({ message }: { message: string }) {
  return (
    <main
      data-testid="p3-root"
      data-state="error"
      className="bg-bg text-fg min-h-screen flex flex-col"
    >
      <ReportTopBar />
      <div className="flex-1 flex items-center justify-center p-12">
        <div
          data-testid="p3-error"
          role="alert"
          className="max-w-lg space-y-3 text-center"
        >
          <p className="text-fg text-lg font-semibold">研究执行出错</p>
          <p data-testid="p3-error-message" className="text-fg-muted text-sm">
            {message}
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * Skeleton placeholder shown while the SSE channel (T13) waits for
 * useReportData / useKbData to flush. Mirrors the live-tree layout so
 * layout-pure specs (height, slot widths) keep passing in either
 * channel — only inner content differs. Mock channel never reaches
 * this branch (isLoading defaults to false).
 */
function ReportReadingSkeleton() {
  return (
    <main
      data-testid="p3-root"
      data-state="loading"
      className="bg-bg text-fg min-h-screen flex flex-col"
      // aria-busy at the <main> level so AT marks the whole page (not
      // just the canvas section) as updating; otherwise the kb-panel
      // aside is announced as ready while it's still empty.
      aria-busy="true"
    >
      <ReportTopBar />
      <div
        data-testid="p3-split"
        className="flex h-[836px] shrink-0 animate-pulse"
      >
        <aside
          data-testid="p3-kb-panel"
          // TODO(T13): when KbDocumentList gets its own skeleton variant
          // and is rendered inside this aside, REMOVE `border-r` here —
          // it duplicates the border the live tree gets from
          // KbDocumentList itself (see live-tree comment below). Right
          // now the aside is empty so we apply the visual compensation
          // directly.
          className="w-[288px] h-full border-r border-border"
          aria-label="知识库文档列表"
        />
        <section
          data-testid="p3-canvas"
          className="flex-1 min-w-0 h-full"
          aria-label="报告正文画布"
        >
          <p className="p-12 text-fg-muted text-sm">加载报告中…</p>
        </section>
        <div
          data-testid="p3-citation-panel-slot"
          className="w-[360px] h-full border-l border-border"
          aria-hidden="true"
        />
      </div>
    </main>
  );
}
