/**
 * Lumen Research Flow — type contracts for the P2 progress page.
 *
 * Shapes mirror @xyflow/react Node/Edge but stay decoupled so the design
 * contracts in docs/designs/lumen/components/*.md remain authoritative.
 */

export type NodeTrack = "web" | "kb" | "utility";

export type NodeState = "planning" | "retrieving" | "completed" | "error";

export type EdgeVariant = "web" | "kb" | "conflict" | "neutral";

export type ConflictState = "detected" | "resolved" | "pending";

// Values currently match NodeState by coincidence; the two domains are kept
// separate because task-list states may diverge from node states later (e.g.
// a task may add "cancelled" without changing node lifecycle).
export type TaskState = "planning" | "retrieving" | "completed" | "error";

export type NodeIconKey = "globe" | "search" | "database" | "lock" | "sparkles";

export interface XYPosition {
  x: number;
  y: number;
}

export interface ResearchNode {
  id: string;
  type: "researchNode";
  position: XYPosition;
  data: {
    title: string;
    track: NodeTrack;
    state: NodeState;
    icon?: NodeIconKey;
    progress?: string;
  };
}

export interface ConflictNode {
  id: string;
  type: "conflictNode";
  position: XYPosition;
  data: {
    title: string;
    conflictId: string;
    state: ConflictState;
    summary: string;
  };
}

export type ResearchFlowNode = ResearchNode | ConflictNode;

export interface ResearchEdge {
  id: string;
  source: string;
  target: string;
  type: "dualTrack";
  data: { variant: EdgeVariant };
}

export interface TaskRecord {
  id: string;
  title: string;
  state: TaskState;
  detail?: string;
}
