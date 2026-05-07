import type { BaseEvent } from "@/types/research-events";
import type {
  ResearchEdge,
  ResearchFlowNode,
  TaskRecord,
} from "@/types/research";

/**
 * Mock-channel session identifier. Hook returns this when consumers ask for
 * the active session id without going through the SSE channel.
 */
export const MOCK_SESSION_ID = "mock-session-demo-001";

/**
 * Permanently fixed sentinel — does NOT track today's date. Chosen at T2
 * implementation; must not be updated (stability > currency). Mock event_id
 * must be deterministic across renders, so we don't use Date.now() /
 * new Date().toISOString() — that would invalidate React memoization on
 * every render and break Codex M2 stability requirement.
 */
const MOCK_EVENT_TIMESTAMP = "2026-05-07T00:00:00.000Z";

/**
 * Mock BaseEvent triplets per node / task id. Hook layer reads this map at
 * the wire boundary so consumers see the same shape regardless of source
 * channel (mock or sse).
 *
 * Per ADR-0002 D7.1 + Codex M2: the event_id values here are UI-key
 * placeholders — they do NOT participate in audit_log persistence, replay
 * cursors, or reducer idempotency (mock channel bypasses all of those).
 * They exist purely to give every hook return value a stable, snake_case
 * BaseEvent shape.
 */
function makeMockBaseEvent(stableId: string): BaseEvent {
  return Object.freeze({
    event_id: `mock-evt-${stableId}`,
    session_id: MOCK_SESSION_ID,
    timestamp: MOCK_EVENT_TIMESTAMP,
  });
}

export const MOCK_NODE_TO_EVENT: Readonly<Record<string, BaseEvent>> =
  Object.freeze({
    input: makeMockBaseEvent("input"),
    "web-1": makeMockBaseEvent("web-1"),
    "web-2": makeMockBaseEvent("web-2"),
    "kb-1": makeMockBaseEvent("kb-1"),
    "kb-2": makeMockBaseEvent("kb-2"),
    "conflict-c01": makeMockBaseEvent("conflict-c01"),
    merge: makeMockBaseEvent("merge"),
  });

export const MOCK_TASK_TO_EVENT: Readonly<Record<string, BaseEvent>> =
  Object.freeze({
    t1: makeMockBaseEvent("t1"),
    t2: makeMockBaseEvent("t2"),
    t3: makeMockBaseEvent("t3"),
    t4: makeMockBaseEvent("t4"),
    t5: makeMockBaseEvent("t5"),
    t6: makeMockBaseEvent("t6"),
  });

export const MOCK_NODES: ReadonlyArray<ResearchFlowNode> = [
  {
    id: "input",
    type: "researchNode",
    position: { x: 20, y: 346 },
    data: {
      title: "用户研究主题",
      track: "utility",
      state: "completed",
      icon: "sparkles",
      progress: "已规划",
    },
  },
  {
    id: "web-1",
    type: "researchNode",
    position: { x: 240, y: 180 },
    data: {
      title: "公开 Web · 行业报告",
      track: "web",
      state: "completed",
      icon: "globe",
      progress: "12/12 sources",
    },
  },
  {
    id: "web-2",
    type: "researchNode",
    position: { x: 480, y: 180 },
    data: {
      title: "公开 Web · 竞品分析",
      track: "web",
      state: "retrieving",
      icon: "search",
      progress: "5/20 sources",
    },
  },
  {
    id: "kb-1",
    type: "researchNode",
    position: { x: 240, y: 492 },
    data: {
      title: "私有 KB · 项目案例",
      track: "kb",
      state: "completed",
      icon: "database",
      progress: "8/8 docs",
    },
  },
  {
    id: "kb-2",
    type: "researchNode",
    position: { x: 480, y: 492 },
    data: {
      title: "私有 KB · 技术文档",
      track: "kb",
      state: "retrieving",
      icon: "lock",
      progress: "3/12 docs",
    },
  },
  {
    id: "conflict-c01",
    type: "conflictNode",
    position: { x: 380, y: 370 },
    data: {
      title: "ConflictSubgraph",
      conflictId: "C01",
      state: "detected",
      summary: "公开 Web 与私有 KB 在落地路径上结论不一致",
    },
  },
  {
    id: "merge",
    type: "researchNode",
    position: { x: 720, y: 346 },
    data: {
      title: "合并与报告生成",
      track: "utility",
      state: "planning",
      icon: "sparkles",
      progress: "等待上游",
    },
  },
];

export const MOCK_EDGES: ReadonlyArray<ResearchEdge> = [
  {
    id: "e-input-web1",
    source: "input",
    target: "web-1",
    type: "dualTrack",
    data: { variant: "neutral" },
  },
  {
    id: "e-input-kb1",
    source: "input",
    target: "kb-1",
    type: "dualTrack",
    data: { variant: "neutral" },
  },
  {
    id: "e-web1-web2",
    source: "web-1",
    target: "web-2",
    type: "dualTrack",
    data: { variant: "web" },
  },
  {
    id: "e-kb1-kb2",
    source: "kb-1",
    target: "kb-2",
    type: "dualTrack",
    data: { variant: "kb" },
  },
  {
    id: "e-web2-conflict",
    source: "web-2",
    target: "conflict-c01",
    type: "dualTrack",
    data: { variant: "conflict" },
  },
  {
    id: "e-kb2-conflict",
    source: "kb-2",
    target: "conflict-c01",
    type: "dualTrack",
    data: { variant: "conflict" },
  },
  {
    id: "e-conflict-merge",
    source: "conflict-c01",
    target: "merge",
    type: "dualTrack",
    data: { variant: "neutral" },
  },
];

export const MOCK_TASKS: ReadonlyArray<TaskRecord> = [
  {
    id: "t1",
    title: "规划检索路径",
    state: "completed",
    detail: "已生成双轨任务清单",
  },
  {
    id: "t2",
    title: "公开 Web 检索：行业报告",
    state: "completed",
    detail: "12 篇文献",
  },
  {
    id: "t3",
    title: "公开 Web 检索：竞品分析",
    state: "retrieving",
    detail: "5 / 20 sources",
  },
  {
    id: "t4",
    title: "私有 KB 检索：项目案例",
    state: "completed",
    detail: "8 篇文档",
  },
  {
    id: "t5",
    title: "私有 KB 检索：技术文档",
    state: "retrieving",
    detail: "3 / 12 docs",
  },
  {
    id: "t6",
    title: "冲突识别与合并",
    state: "planning",
    detail: "等待上游完成",
  },
];

// Dev-only data contract self-checks. Skipped in production to avoid SSR log
// noise from `console.assert` (which writes to stderr on failure even when
// the assertion is the only side effect).
if (process.env.NODE_ENV !== "production") {
  const NODE_IDS = new Set(MOCK_NODES.map((n) => n.id));

  console.assert(
    MOCK_NODES.length >= 3,
    "C1-1: MOCK_NODES must have >= 3 entries",
  );
  console.assert(
    MOCK_NODES.some((n) => n.type === "researchNode" && n.data.track === "web"),
    "C1-2: at least one web-track researchNode required",
  );
  console.assert(
    MOCK_NODES.some((n) => n.type === "researchNode" && n.data.track === "kb"),
    "C1-3: at least one kb-track researchNode required",
  );
  console.assert(
    MOCK_NODES.some((n) => n.type === "conflictNode"),
    "C1-4: at least one conflictNode required",
  );
  console.assert(
    MOCK_EDGES.some((e) => e.data.variant === "web"),
    "C1-5: at least one edge with variant=web required",
  );
  console.assert(
    MOCK_EDGES.some((e) => e.data.variant === "kb"),
    "C1-6: at least one edge with variant=kb required",
  );
  console.assert(
    MOCK_TASKS.length >= 5 && MOCK_TASKS.length <= 7,
    "C1-7: MOCK_TASKS length must be in [5, 7]",
  );
  console.assert(
    MOCK_TASKS.some((t) => t.state === "planning"),
    "C1-8a: at least one planning task required",
  );
  console.assert(
    MOCK_TASKS.some((t) => t.state === "retrieving"),
    "C1-8b: at least one retrieving task required",
  );
  console.assert(
    MOCK_TASKS.some((t) => t.state === "completed"),
    "C1-8c: at least one completed task required",
  );
  console.assert(
    MOCK_NODES.every(
      (n) => typeof n.data.title === "string" && n.data.title.length > 0,
    ),
    "C1-9: every node must have non-empty data.title",
  );
  console.assert(
    MOCK_EDGES.every(
      (e) => NODE_IDS.has(e.source) && NODE_IDS.has(e.target),
    ),
    "C1-10: every edge source/target must reference an existing node id",
  );
  console.assert(
    MOCK_NODES.every((n) => MOCK_NODE_TO_EVENT[n.id] !== undefined),
    "C1-11: every MOCK_NODES entry must have a MOCK_NODE_TO_EVENT mapping",
  );
  console.assert(
    Object.keys(MOCK_NODE_TO_EVENT).every((k) => NODE_IDS.has(k)),
    "C1-11b: MOCK_NODE_TO_EVENT must not contain keys absent from MOCK_NODES",
  );
  console.assert(
    MOCK_TASKS.every((t) => MOCK_TASK_TO_EVENT[t.id] !== undefined),
    "C1-12: every MOCK_TASKS entry must have a MOCK_TASK_TO_EVENT mapping",
  );
  const TASK_IDS = new Set(MOCK_TASKS.map((t) => t.id));
  console.assert(
    Object.keys(MOCK_TASK_TO_EVENT).every((k) => TASK_IDS.has(k)),
    "C1-12b: MOCK_TASK_TO_EVENT must not contain keys absent from MOCK_TASKS",
  );
}
