import {
  BaseEdge,
  getBezierPath,
  type Edge as RFEdge,
  type EdgeProps,
} from "@xyflow/react";
import type { CSSProperties } from "react";

import type { EdgeVariant } from "@/types/research";

type DualTrackData = { variant: EdgeVariant } & Record<string, unknown>;
type RFDualTrackEdge = RFEdge<DualTrackData, "dualTrack">;
export type DualTrackEdgeProps = EdgeProps<RFDualTrackEdge>;

const VARIANT_STROKE: Record<EdgeVariant, string> = {
  web: "var(--track-web-border)",
  kb: "var(--track-kb-border)",
  conflict: "var(--conflict-border)",
  neutral: "var(--border)",
};

export function DualTrackEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: DualTrackEdgeProps) {
  const variant: EdgeVariant = data?.variant ?? "neutral";
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const style: CSSProperties = {
    stroke: VARIANT_STROKE[variant],
    strokeWidth: 1.5,
    fill: "none",
    ...(variant === "kb" ? { strokeDasharray: "4,4" } : {}),
  };

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      role="presentation"
      aria-hidden="true"
    />
  );
}
