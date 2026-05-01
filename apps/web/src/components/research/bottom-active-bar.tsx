import { Pause } from "lucide-react";

export function BottomActiveBar() {
  return (
    <footer
      data-testid="bottom-active-bar"
      className="h-14 w-full shrink-0 bg-surface border-t border-border flex items-center px-6 gap-6"
    >
      <span
        data-testid="active-node-label"
        className="flex-1 min-w-0 text-fg text-base truncate"
      >
        正在检索 · 公开 Web · 竞品分析
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
