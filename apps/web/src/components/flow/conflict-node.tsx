import { TriangleAlert } from "lucide-react";
import {
  Handle,
  Position,
  type Node as RFNode,
  type NodeProps,
} from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { ConflictNode as ConflictNodeType } from "@/types/research";

type ConflictData = ConflictNodeType["data"] & Record<string, unknown>;
type RFConflictNode = RFNode<ConflictData, "conflictNode">;
export type ConflictNodeCardProps = NodeProps<RFConflictNode>;

const STATE_BORDER: Record<ConflictNodeType["data"]["state"], string> = {
  detected: "border-conflict-border border-solid",
  resolved: "border-fg-muted border-solid",
  pending: "border-conflict-border border-dashed",
};

const STATE_GLOW: Record<ConflictNodeType["data"]["state"], string> = {
  detected: "shadow-[0_0_20px_var(--conflict-glow)]",
  resolved: "",
  pending: "",
};

export function ConflictNodeCard({ id, data }: ConflictNodeCardProps) {
  const { title, conflictId, state, summary } = data;
  const ariaLabel = `冲突节点 · ${title} #${conflictId} · ${summary}`;

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div
        data-testid={`node-inner-${id}`}
        role="group"
        aria-label={ariaLabel}
        className={cn(
          "h-12 py-2.5 px-4 rounded-full border-[1.5px] bg-conflict-bg",
          "flex items-center gap-3 font-sans",
          STATE_BORDER[state],
          STATE_GLOW[state],
        )}
      >
        <TriangleAlert
          className="size-3.5 text-conflict-fg shrink-0"
          aria-hidden="true"
        />
        <span
          data-testid="conflict-divider"
          className="w-px h-5 bg-conflict-border shrink-0"
          aria-hidden="true"
        />
        <span
          data-testid="conflict-identifier"
          className="text-fg text-xs font-mono whitespace-nowrap"
        >
          {title} · #{conflictId}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
