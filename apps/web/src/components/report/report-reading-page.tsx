import { TooltipProvider } from "@/components/ui/tooltip";
import { MOCK_REPORT } from "@/lib/report-mock";

import { KbDocumentList } from "./kb-document-list";
import { ReportMarkdownCanvas } from "./report-markdown-canvas";
import { ReportTopBar } from "./report-top-bar";

interface ReportReadingPageProps {
  sessionId: string;
}

export function ReportReadingPage({ sessionId }: ReportReadingPageProps) {
  return (
    <TooltipProvider delay={0}>
      <main
        data-testid="p3-root"
        className="bg-bg text-fg min-h-screen flex flex-col"
      >
        <ReportTopBar sessionId={sessionId} />
        <div data-testid="p3-split" className="flex h-[836px] shrink-0">
          <aside
            data-testid="p3-kb-panel"
            className="w-[288px] h-full"
            aria-label="知识库文档列表"
          >
            {/* border-r 由 KbDocumentList 自身承载，让 list root w-full = aside width (288px) 含 border 后仍 288px (box-sizing: border-box)。 */}
            <KbDocumentList
              documents={MOCK_REPORT.kbDocuments}
              citations={MOCK_REPORT.citations}
            />
          </aside>
          <section
            data-testid="p3-canvas"
            className="flex-1 min-w-0 h-full"
            aria-label="报告正文画布"
          >
            <ReportMarkdownCanvas report={MOCK_REPORT} />
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
