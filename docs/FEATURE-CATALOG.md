# Feature Catalog

**Last Updated:** 2026-05-06
<!-- design-workflow V2-4 Gate 3 passed，已移交 V2-5 开发工作流 -->
<!-- S1 Token Integration 完成于 2026-04-26 -->
<!-- S2 P1 Research Input Page 完成于 2026-04-28 -->
<!-- S2 P2 Research Progress Page 完成于 2026-05-01 -->
<!-- S2 P3 Research Report Page 完成于 2026-05-06 -->

| Feature | Status | Product Doc | Design Status | Implementation Status | Architecture Status |
|---------|--------|-------------|---------------|-----------------------|---------------------|
| lumen | In Progress | [docs/product/lumen.md](product/lumen.md) | V2-4 Passed（2026-04-21），已移交 V2-5 | S1 Done（token pipeline、globals.css、shadcn compat、layout.tsx、/token-test 路由、E2E smoke 19 tests）；S2 P1 Done（ResearchInputHero、page.tsx、E2E 29 specs）；S2 P2 Done（ResearchCanvas + 4 节点/边组件 + TopBar/TaskPanel/TaskItem/BottomActiveBar；E2E 100 specs）；S2 P3 Done（ReportTopBar/ReportReadingPage/ReportMarkdownCanvas + 4 P3 组件 CitationBadge/CitationPanel/ConflictBlock/KbDocumentList + tooltip/sheet shadcn 原语；E2E 70 specs T2-T8） | 基线架构已确立 ([ADR-0001](architecture/ADR-INDEX.md)) |
| lumen-s2-p1-research-input | Active | [docs/product/lumen.md](product/lumen.md) | Done（[ResearchInputHero 契约](designs/lumen/components/research-input-hero.md)） | Done（`apps/web/src/app/page.tsx`、`apps/web/src/components/research/research-input-hero.tsx`；E2E 29 specs T1×19+T2×8+T3×2） | — |
| lumen-s2-p2-research-progress | Active | [docs/product/lumen.md](product/lumen.md) | Done（[ResearchNodeCard](designs/lumen/components/research-node-card.md)/[ConflictNode](designs/lumen/components/conflict-node.md)/[DualTrackEdge](designs/lumen/components/dual-track-edge.md) 契约） | Done（`apps/web/src/app/research/[id]/page.tsx` + `apps/web/src/components/flow/*` + `apps/web/src/components/research/{research-progress-page,research-progress-top-bar,task-panel,task-item,bottom-active-bar}.tsx`；E2E 100 specs T1-T9） | — |
| lumen-s2-p3-report-reading | Active | [docs/product/lumen.md](product/lumen.md) | Done（[CitationBadge](designs/lumen/components/citation-badge.md)/[CitationPanel](designs/lumen/components/citation-panel.md)/[ConflictBlock](designs/lumen/components/conflict-block.md)/[KbDocumentList](designs/lumen/components/kb-document-list.md) 契约 + 4 份 ARIA × Milestone 矩阵） | Done（apps/web/src/app/research/[id]/report/page.tsx + apps/web/src/components/report/* 7 文件 + ui/{tooltip,sheet}.tsx + lib/report-mock.ts + types/report.ts；E2E 70 specs T2-T8 含 axe 0 critical/serious + dark/light 视觉回归 baseline） | — |
