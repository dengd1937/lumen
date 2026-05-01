"use client";

import { ReactFlow, type EdgeTypes, type NodeTypes } from "@xyflow/react";
import { useMemo } from "react";

import { MOCK_EDGES, MOCK_NODES } from "@/lib/research-mock";

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
  const nodes = useMemo(() => MOCK_NODES.map((n) => ({ ...n })), []);
  const edges = useMemo(() => MOCK_EDGES.map((e) => ({ ...e })), []);

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
