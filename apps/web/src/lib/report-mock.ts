import type { BaseEvent } from "@/types/research-events";
import type {
  CitationRecord,
  ConflictRecord,
  KbDocumentRecord,
  ReportData,
  ReportSection,
} from "@/types/report";

/**
 * Mock-channel session identifier for the P3 reading page. Hooks return this
 * when consumers ask for the active report session id. Mirrors P2 mock
 * pattern (research-mock.ts MOCK_SESSION_ID).
 */
export const MOCK_REPORT_SESSION_ID = "mock-session-report-001";

/**
 * Permanently fixed sentinel — does NOT track today's date. Chosen at T3
 * implementation; must not be updated (stability > currency). Mock event_id
 * must be deterministic across renders (Codex M2): no Date.now() / new Date(),
 * which would invalidate React memoization on every render.
 */
const MOCK_REPORT_EVENT_TIMESTAMP = "2026-05-07T00:00:00.000Z";

/**
 * Mock BaseEvent triplet factory. Per ADR-0002 D7.1 + Codex M2: event_id is
 * a UI-key placeholder, NOT protocol-semantic — mock channel bypasses
 * audit_log persistence, replay cursors, and reducer idempotency.
 */
function makeMockReportBaseEvent(stableId: string): BaseEvent {
  return Object.freeze({
    event_id: `mock-evt-report-${stableId}`,
    session_id: MOCK_REPORT_SESSION_ID,
    timestamp: MOCK_REPORT_EVENT_TIMESTAMP,
  });
}

/**
 * Top-level mock report event. Useful when the consumer treats the entire
 * report as a single event (e.g., useReportData mock channel returning one
 * BaseEvent triplet for the report payload).
 */
export const MOCK_REPORT_TO_EVENT: Readonly<Record<string, BaseEvent>> =
  Object.freeze({
    report: makeMockReportBaseEvent("report"),
  });

/**
 * Per-KB-document mock events. Keys must align 1:1 with MOCK_KB_DOCUMENTS
 * ids (kd-1 .. kd-11). Verified by C2-12 / C2-12b dev-only asserts below.
 */
export const MOCK_KB_DOC_TO_EVENT: Readonly<Record<string, BaseEvent>> =
  Object.freeze({
    "kd-1": makeMockReportBaseEvent("kd-1"),
    "kd-2": makeMockReportBaseEvent("kd-2"),
    "kd-3": makeMockReportBaseEvent("kd-3"),
    "kd-4": makeMockReportBaseEvent("kd-4"),
    "kd-5": makeMockReportBaseEvent("kd-5"),
    "kd-6": makeMockReportBaseEvent("kd-6"),
    "kd-7": makeMockReportBaseEvent("kd-7"),
    "kd-8": makeMockReportBaseEvent("kd-8"),
    "kd-9": makeMockReportBaseEvent("kd-9"),
    "kd-10": makeMockReportBaseEvent("kd-10"),
    "kd-11": makeMockReportBaseEvent("kd-11"),
  });

const MOCK_CITATIONS: readonly CitationRecord[] = [
  {
    id: "c1",
    index: 1,
    track: "web",
    sourceTitle: "Gartner 2025 Enterprise AI Agent Adoption Report",
    url: "https://www.gartner.com/en/research/2025/enterprise-ai-agent-adoption",
    date: "2025-08-12",
    snippet:
      "头部企业 AI Agent 平均落地周期为 6-9 个月，端到端 ROI 通常在第 12 个月转正。",
    similarity: 0.91,
  },
  {
    id: "c2",
    index: 2,
    track: "web",
    sourceTitle: "McKinsey: Generative AI in Knowledge Work",
    url: "https://www.mckinsey.com/capabilities/quantumblack/our-insights/genai-knowledge-work",
    date: "2025-04-30",
    snippet:
      "在知识工作场景下，跨源串联与冲突标注比单纯检索增益的边际收益高出 2.4×。",
    similarity: 0.87,
  },
  {
    id: "c3",
    index: 3,
    track: "web",
    sourceTitle: "Forrester Wave: Enterprise Knowledge Platforms 2025",
    url: "https://www.forrester.com/report/enterprise-knowledge-platforms-2025",
    date: "2025-06-18",
    snippet:
      "权限审查 SLA 是知识平台落地的首要瓶颈，建议建立 ≤ 5 工作日的预审流程。",
    similarity: 0.82,
  },
  {
    id: "c4",
    index: 4,
    track: "kb",
    sourceTitle: "内部 KB · 2024Q3 知识平台需求调研",
    url: "kb://lumen/research/2024Q3-knowledge-platform-survey",
    date: "2024-09-25",
    snippet:
      "受访的 6 个业务部门中，有 4 个明确要求 AI Agent 能给出冲突来源说明而非单一答案。",
    similarity: 0.95,
  },
  {
    id: "c5",
    index: 5,
    track: "web",
    sourceTitle: "a16z: AI Agents in the Enterprise Stack",
    url: "https://a16z.com/ai-agents-enterprise-stack",
    date: "2025-02-11",
    snippet:
      "企业 Agent 栈的四大支柱：身份与权限、跨源检索、冲突仲裁、决策回放。",
    similarity: 0.84,
  },
  {
    id: "c6",
    index: 6,
    track: "kb",
    sourceTitle: "内部 KB · AI Agent PoC 项目复盘 (2025-09)",
    url: "kb://lumen/postmortem/ai-agent-poc-2025-09",
    date: "2025-09-30",
    snippet:
      "本次 PoC 实际落地周期 14 个月，超出行业基线 50%+，主因为法务合规审查反复。",
    similarity: 0.93,
  },
  {
    id: "c7",
    index: 7,
    track: "kb",
    sourceTitle: "内部 KB · 法务合规审查白皮书 v3",
    url: "kb://lumen/legal/compliance-review-whitepaper-v3",
    date: "2025-03-14",
    snippet:
      "现行合规框架要求 AI 处理涉密知识时必须经过 3 级人工复核，平均耗时 11 个工作日。",
    similarity: 0.89,
  },
];

const MOCK_CONFLICTS: readonly ConflictRecord[] = [
  {
    id: "C01",
    title: "ConflictSubgraph",
    subtitle: "AI Agent 落地周期不一致",
    columns: [
      {
        track: "web",
        label: "Gartner 数据",
        content:
          "头部企业平均落地周期 6-9 个月，端到端 ROI 在第 12 个月转正。",
      },
      {
        track: "kb",
        label: "内部复盘",
        content:
          "本组织 2024Q3-2025Q1 PoC 共耗时 14 个月，权限审查与合规验证为主因。",
      },
    ],
    aiNote:
      "AI 推断：内部 PoC 周期超出行业均值 50%+，瓶颈集中在跨部门权限审查与合规验证流程，建议引入 ≤ 5 工作日预审 SLA。",
  },
];

const MOCK_KB_DOCUMENTS: readonly KbDocumentRecord[] = [
  {
    id: "kd-1",
    track: "web",
    title: "Gartner 2025 Enterprise AI Agent Adoption Report",
    url: "https://www.gartner.com/en/research/2025/enterprise-ai-agent-adoption",
    date: "2025-08-12",
    citationIds: ["c1"],
  },
  {
    id: "kd-2",
    track: "web",
    title: "McKinsey: Generative AI in Knowledge Work",
    url: "https://www.mckinsey.com/capabilities/quantumblack/our-insights/genai-knowledge-work",
    date: "2025-04-30",
    citationIds: ["c2"],
  },
  {
    id: "kd-3",
    track: "web",
    title: "Forrester Wave: Enterprise Knowledge Platforms 2025",
    url: "https://www.forrester.com/report/enterprise-knowledge-platforms-2025",
    date: "2025-06-18",
    citationIds: ["c3"],
  },
  {
    id: "kd-4",
    track: "web",
    title: "a16z: AI Agents in the Enterprise Stack",
    url: "https://a16z.com/ai-agents-enterprise-stack",
    date: "2025-02-11",
    citationIds: ["c5"],
  },
  {
    id: "kd-5",
    track: "web",
    title: "Anthropic Enterprise Agent Case Studies",
    url: "https://www.anthropic.com/customers/enterprise-agent-cases",
    date: "2025-07-22",
    citationIds: [],
  },
  {
    id: "kd-6",
    track: "kb",
    title: "内部 KB · 2024Q3 知识平台需求调研",
    url: "kb://lumen/research/2024Q3-knowledge-platform-survey",
    date: "2024-09-25",
    citationIds: ["c4"],
  },
  {
    id: "kd-7",
    track: "kb",
    title: "内部 KB · AI Agent PoC 项目复盘 (2025-09)",
    url: "kb://lumen/postmortem/ai-agent-poc-2025-09",
    date: "2025-09-30",
    citationIds: ["c6"],
  },
  {
    id: "kd-8",
    track: "kb",
    title: "内部 KB · 法务合规审查白皮书 v3",
    url: "kb://lumen/legal/compliance-review-whitepaper-v3",
    date: "2025-03-14",
    citationIds: ["c7"],
  },
  {
    id: "kd-9",
    track: "kb",
    title: "内部 KB · 数据分类标准 v2",
    url: "kb://lumen/standard/data-classification-v2",
    date: "2024-11-04",
    citationIds: [],
  },
  {
    id: "kd-10",
    track: "kb",
    title: "内部 KB · 部门权限矩阵 (2025-Q1)",
    url: "kb://lumen/security/department-permission-matrix-2025q1",
    date: "2025-01-20",
    citationIds: [],
  },
  {
    id: "kd-11",
    track: "kb",
    title: "内部 KB · 安全审计指南 v4",
    url: "kb://lumen/security/audit-guideline-v4",
    date: "2025-05-08",
    citationIds: [],
  },
];

const MOCK_SECTIONS: readonly ReportSection[] = [
  {
    id: "s-conclusion",
    heading: "核心结论",
    bodyParts: [
      {
        type: "text",
        content:
          "在企业知识管理场景下，AI Agent 的价值不在于替代检索，而在于跨源串联、冲突标注、决策路径推荐。",
      },
      { type: "citation-inline", citationId: "c1" },
      { type: "text", content: "行业基线显示，跨源能力比单纯检索增益的边际收益高出 2.4×" },
      { type: "citation-inline", citationId: "c2" },
      { type: "text", content: "，且头部企业的端到端 ROI 通常在第 12 个月转正。" },
    ],
  },
  {
    id: "s-conflict",
    heading: "跨源冲突点",
    bodyParts: [
      {
        type: "text",
        content: "本次研究在公开 Web 数据与内部 KB 之间识别出 1 处显著冲突，需在落地路径中显式处理：",
      },
      { type: "conflict", conflictId: "C01" },
      {
        type: "text",
        content: "冲突的修复路径需结合权限审查 SLA 建议",
      },
      { type: "citation-inline", citationId: "c3" },
      { type: "text", content: "，建立 ≤ 5 工作日的预审流程。" },
    ],
  },
  {
    id: "s-roadmap",
    heading: "建议路径",
    bodyParts: [
      {
        type: "text",
        content: "短期（0-3 月）建议优先打通公开 Web 检索基线，对齐",
      },
      { type: "citation-inline", citationId: "c5" },
      {
        type: "text",
        content: "提到的四大支柱能力。中期（3-9 月）落地内部 KB 检索，参考",
      },
      { type: "citation-inline", citationId: "c4" },
      {
        type: "text",
        content: "的需求清单。长期（9-18 月）针对",
      },
      { type: "citation-inline", citationId: "c6" },
      {
        type: "text",
        content: "中暴露的法务瓶颈，参考",
      },
      { type: "citation-inline", citationId: "c7" },
      { type: "text", content: "落地合规预审框架。" },
    ],
  },
];

export const MOCK_REPORT: ReportData = {
  sessionId: MOCK_REPORT_SESSION_ID,
  title: "AI Agent 在企业知识管理中的最佳落地路径",
  generatedAt: "2026-05-01",
  sections: MOCK_SECTIONS,
  citations: MOCK_CITATIONS,
  conflicts: MOCK_CONFLICTS,
  kbDocuments: MOCK_KB_DOCUMENTS,
};

// Dev-only data contract self-checks. Skipped in production to avoid SSR log
// noise from `console.assert` (which writes to stderr on failure even when
// the assertion is the only side effect). Mirrors P2 mock pattern.
if (process.env.NODE_ENV !== "production") {
  const CITATION_IDS = new Set(MOCK_REPORT.citations.map((c) => c.id));

  console.assert(
    MOCK_REPORT.citations.length >= 6 && MOCK_REPORT.citations.length <= 8,
    "C2-1: citations.length must be in [6, 8]",
  );
  console.assert(
    MOCK_REPORT.citations.some((c) => c.track === "web"),
    "C2-2: at least one web-track citation required",
  );
  console.assert(
    MOCK_REPORT.citations.filter((c) => c.track === "web").length === 4,
    "C2-2+: exactly 4 web-track citations required per plan spec",
  );
  console.assert(
    MOCK_REPORT.citations.some((c) => c.track === "kb"),
    "C2-3: at least one kb-track citation required",
  );
  console.assert(
    MOCK_REPORT.citations.filter((c) => c.track === "kb").length === 3,
    "C2-3+: exactly 3 kb-track citations required per plan spec",
  );
  console.assert(
    MOCK_REPORT.conflicts.length === 1,
    "C2-4: conflicts.length must equal 1",
  );
  console.assert(
    MOCK_REPORT.conflicts[0]?.columns.length === 2,
    "C2-5: conflicts[0].columns.length must equal 2",
  );
  console.assert(
    MOCK_REPORT.kbDocuments.length === 11,
    "C2-6: kbDocuments.length must equal 11",
  );
  console.assert(
    MOCK_REPORT.kbDocuments.filter((d) => d.track === "web").length >= 4,
    "C2-7: kbDocuments web-track count must be >= 4",
  );
  console.assert(
    MOCK_REPORT.kbDocuments.filter((d) => d.track === "kb").length >= 5,
    "C2-8: kbDocuments kb-track count must be >= 5",
  );
  console.assert(
    MOCK_REPORT.citations.every(
      (c) => typeof c.sourceTitle === "string" && c.sourceTitle.length > 0,
    ),
    "C2-9: every citation must have non-empty sourceTitle",
  );
  console.assert(
    MOCK_REPORT.kbDocuments.every((d) =>
      d.citationIds.every((id) => CITATION_IDS.has(id)),
    ),
    "C2-10: every kbDocument.citationIds must reference existing citation ids",
  );
  console.assert(
    MOCK_REPORT_TO_EVENT["report"] !== undefined,
    "C2-11: MOCK_REPORT_TO_EVENT must contain a 'report' top-level entry",
  );
  console.assert(
    MOCK_REPORT.kbDocuments.every(
      (d) => MOCK_KB_DOC_TO_EVENT[d.id] !== undefined,
    ),
    "C2-12: every kbDocument must have a MOCK_KB_DOC_TO_EVENT mapping",
  );
  const KB_DOC_IDS = new Set(MOCK_REPORT.kbDocuments.map((d) => d.id));
  console.assert(
    Object.keys(MOCK_KB_DOC_TO_EVENT).every((k) => KB_DOC_IDS.has(k)),
    "C2-12b: MOCK_KB_DOC_TO_EVENT must not contain keys absent from kbDocuments",
  );
}
