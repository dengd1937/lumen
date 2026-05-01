import { Check, Clock, Loader2 } from "lucide-react";

import type { TaskRecord, TaskState } from "@/types/research";

const DOT_CLASS: Record<TaskState, string> = {
  planning: "bg-node-state-planning",
  retrieving: "bg-node-state-retrieving",
  completed: "bg-node-state-completed",
  error: "bg-node-state-error",
};

interface TaskItemProps {
  task: TaskRecord;
}

export function TaskItem({ task }: TaskItemProps) {
  const { id, title, state, detail } = task;
  return (
    <li
      data-testid={`task-item-${id}-${state}`}
      className="px-6 py-3 flex items-start gap-3 border-b border-border/50"
    >
      <span
        data-testid={`task-item-dot-${id}`}
        className={`${DOT_CLASS[state]} mt-1.5 size-2 rounded-full shrink-0`}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-fg font-medium">{title}</span>
          {state === "planning" && (
            <Clock
              data-testid="task-item-clock"
              className="size-3.5 text-node-state-planning shrink-0"
              aria-hidden="true"
            />
          )}
          {state === "retrieving" && (
            <Loader2
              data-testid="task-item-spinner"
              className="size-3.5 text-node-state-retrieving animate-spin shrink-0"
              aria-hidden="true"
            />
          )}
          {state === "completed" && (
            <Check
              data-testid="task-item-check"
              className="size-3.5 text-node-state-completed shrink-0"
              aria-hidden="true"
            />
          )}
        </div>
        {detail && <p className="text-fg-muted text-xs mt-0.5">{detail}</p>}
      </div>
    </li>
  );
}
