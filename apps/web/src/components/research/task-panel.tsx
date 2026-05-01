import { MOCK_TASKS } from "@/lib/research-mock";

import { TaskItem } from "./task-item";

export function TaskPanel() {
  return (
    <div
      data-testid="task-panel"
      className="h-full flex flex-col text-base"
    >
      <header className="px-6 py-4 border-b border-border shrink-0">
        <h2 className="text-fg font-semibold text-md">任务规划</h2>
        <p className="text-fg-muted text-xs mt-1">
          双轨检索 · 实时状态
        </p>
      </header>
      <ul className="flex-1 overflow-y-auto" aria-live="polite">
        {MOCK_TASKS.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </ul>
    </div>
  );
}
