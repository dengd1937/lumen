"use client";

import { ReactFlow, type EdgeTypes, type NodeTypes } from "@xyflow/react";
import { useMemo } from "react";

import { useResearchData } from "@/hooks/use-research-data";

import { ConflictNodeCard } from "./conflict-node";
import { DualTrackEdge } from "./dual-track-edge";
import { ResearchNodeCard } from "./research-node-card";

const NODE_TYPES: NodeTypes = {
  researchNode: ResearchNodeCard,
  conflictNode: ConflictNodeCard,
};

const EDGE_TYPES: EdgeTypes = {
  dualTrack: DualTrackEdge,
};

const PRO_OPTIONS = { hideAttribution: true } as const;

// 让 React Flow 画布背景跟随 themed `--bg` token（dark/light 主题切换）。
// `colorMode="dark"` 仍保留以满足内部句柄/选中样式（T4-11 验证 className 含 "dark"），
// 但 `--xy-background-color` 通过 inline style 强制指向 themed `var(--bg)` 覆盖默认 #141414。
const FLOW_STYLE = { background: "var(--bg)" } as const;

export function ResearchCanvas() {
  const { nodes: hookNodes, edges: hookEdges } = useResearchData();

  // @xyflow/react v12's `applyChange` writes selected/position/measured
  // directly onto each node object (strict-mode throw on frozen ones).
  // Hook returns ReadonlyArray<...frozen node>, so we shallow-copy each
  // element at the boundary to give React Flow mutable fields while
  // keeping the hook's Readonly contract intact upstream.
  // useMemo identity is stable across renders when hookNodes/hookEdges
  // references don't change (mock channel: never; SSE channel T13:
  // only when the reducer commits a new state).
  const nodes = useMemo(() => hookNodes.map((n) => ({ ...n })), [hookNodes]);
  const edges = useMemo(() => hookEdges.map((e) => ({ ...e })), [hookEdges]);

  return (
    <div
      data-testid="research-canvas"
      className="bg-bg w-full h-full"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        colorMode="dark"
        proOptions={PRO_OPTIONS}
        style={FLOW_STYLE}
      />
    </div>
  );
}
