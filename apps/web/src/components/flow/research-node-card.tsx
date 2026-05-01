import {
  AlertTriangle,
  Check,
  Database,
  Globe,
  Loader2,
  Lock,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  Handle,
  Position,
  type Node as RFNode,
  type NodeProps,
} from "@xyflow/react";

import { cn } from "@/lib/utils";
import type {
  NodeIconKey,
  NodeState,
  NodeTrack,
  ResearchNode,
} from "@/types/research";

type ResearchNodeData = ResearchNode["data"] & Record<string, unknown>;
type RFResearchNode = RFNode<ResearchNodeData, "researchNode">;
export type ResearchNodeCardProps = NodeProps<RFResearchNode>;

const ICON_MAP: Record<NodeIconKey, LucideIcon> = {
  globe: Globe,
  search: Search,
  database: Database,
  lock: Lock,
  sparkles: Sparkles,
};

const TRACK_RADIUS: Record<NodeTrack, string> = {
  web: "rounded-lg",
  kb: "rounded-xs",
  utility: "rounded-lg",
};

const TRACK_BORDER: Record<NodeTrack, string> = {
  web: "border-track-web-border",
  kb: "border-track-kb-border",
  utility: "border-border",
};

const TRACK_BG: Record<NodeTrack, string> = {
  web: "bg-track-web-bg",
  kb: "bg-track-kb-bg",
  utility: "bg-surface",
};

const TRACK_LABEL: Record<NodeTrack, string> = {
  web: "公开 Web",
  kb: "私有 KB",
  utility: "功能",
};

const STATE_DOT: Record<NodeState, string> = {
  planning: "bg-node-state-planning",
  retrieving: "bg-node-state-retrieving",
  completed: "bg-node-state-completed",
  error: "bg-node-state-error",
};

const STATE_LABEL: Record<NodeState, string> = {
  planning: "规划中",
  retrieving: "检索中",
  completed: "已完成",
  error: "错误",
};

const RETRIEVING_GLOW: Record<NodeTrack, string> = {
  web: "shadow-[0_0_16px_var(--track-web-glow)]",
  kb: "shadow-[0_0_16px_var(--track-kb-glow)]",
  utility: "shadow-[0_0_16px_var(--node-state-retrieving)]",
};

export function ResearchNodeCard({ id, data }: ResearchNodeCardProps) {
  const { title, track, state, icon, progress } = data;
  const Icon = icon ? ICON_MAP[icon] : null;
  const ariaLabel = `${title} · ${TRACK_LABEL[track]} · 状态 ${STATE_LABEL[state]}`;

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div
        data-testid={`node-inner-${id}`}
        role="group"
        aria-label={ariaLabel}
        className={cn(
          "w-[200px] h-[88px] p-3 border-2 flex flex-col gap-1 font-sans",
          TRACK_BG[track],
          TRACK_BORDER[track],
          TRACK_RADIUS[track],
          state === "retrieving" && RETRIEVING_GLOW[track],
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              STATE_DOT[state],
              state === "planning" && "animate-pulse",
            )}
            aria-hidden="true"
          />
          {Icon && (
            <Icon
              className="size-3.5 text-fg-muted shrink-0"
              aria-hidden="true"
            />
          )}
          {state === "retrieving" && (
            <Loader2
              className="size-3.5 animate-spin text-node-state-retrieving shrink-0"
              aria-hidden="true"
            />
          )}
          {state === "completed" && (
            <Check
              className="size-3.5 text-node-state-completed shrink-0"
              aria-hidden="true"
            />
          )}
          {state === "error" && (
            <AlertTriangle
              className="size-3.5 text-node-state-error shrink-0"
              aria-hidden="true"
            />
          )}
          <span className="text-fg font-semibold text-sm truncate">
            {title}
          </span>
        </div>
        {progress && (
          <p
            data-testid={`node-progress-${id}`}
            className="text-fg-muted text-xs font-mono truncate"
            aria-live="polite"
          >
            {progress}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
