/**
 * Lumen Report Reading — type contracts for the S2 P3 reading page.
 *
 * Shapes are decoupled from any rendering library so the design contracts in
 * docs/designs/lumen/components/{citation-badge,citation-panel,conflict-block,
 * kb-document-list}.md remain authoritative.
 */

export type CitationTrack = "web" | "kb";

export interface CitationRecord {
  id: string;
  index: number; // 1-based 角标编号
  track: CitationTrack;
  sourceTitle: string;
  url: string;
  date: string; // YYYY-MM-DD
  snippet: string; // 原文片段，CitationPanel 中作为高亮段呈现
  similarity: number; // 0-1
}

export interface ConflictColumn {
  track: CitationTrack;
  label: string;
  content: string;
}

export interface ConflictRecord {
  id: string;
  title: string;
  subtitle: string;
  columns: readonly [ConflictColumn, ConflictColumn]; // 强制双列
  aiNote: string;
}

export interface KbDocumentRecord {
  id: string;
  track: CitationTrack;
  title: string;
  url: string;
  date: string;
  citationIds: readonly string[];
}

export type ReportBodyPart =
  | { type: "text"; content: string }
  | { type: "citation-inline"; citationId: string }
  | { type: "conflict"; conflictId: string };

export interface ReportSection {
  id: string;
  heading: string;
  bodyParts: readonly ReportBodyPart[];
}

export interface ReportData {
  sessionId: string;
  title: string;
  generatedAt: string;
  sections: readonly ReportSection[];
  citations: readonly CitationRecord[];
  conflicts: readonly ConflictRecord[];
  kbDocuments: readonly KbDocumentRecord[];
}
