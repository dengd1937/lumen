import { ResearchCanvas } from "@/components/flow/research-canvas";
import { SessionIdProvider } from "@/lib/session-id-context";

import { BottomActiveBar } from "./bottom-active-bar";
import { ResearchProgressTopBar } from "./research-progress-top-bar";
import { TaskPanel } from "./task-panel";

interface ResearchProgressPageProps {
  sessionId: string;
}

export function ResearchProgressPage({ sessionId }: ResearchProgressPageProps) {
  return (
    <SessionIdProvider sessionId={sessionId}>
      <main
        data-testid="p2-root"
        className="bg-bg text-fg min-h-screen flex flex-col"
      >
        <ResearchProgressTopBar />
        <div data-testid="p2-split" className="flex h-[780px] shrink-0">
          <aside
            data-testid="p2-task-panel"
            className="w-[432px] h-full border-r border-border"
            aria-label="任务规划面板"
          >
            <TaskPanel />
          </aside>
          <section
            data-testid="p2-canvas"
            className="flex-1 min-w-0 h-full"
            aria-label="研究进行画布"
          >
            <ResearchCanvas />
          </section>
        </div>
        <BottomActiveBar />
      </main>
    </SessionIdProvider>
  );
}
