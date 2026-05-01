# Feature Catalog

**Last Updated:** 2026-05-01
<!-- design-workflow V2-4 Gate 3 passed，已移交 V2-5 开发工作流 -->
<!-- S1 Token Integration 完成于 2026-04-26 -->
<!-- S2 P1 Research Input Page 完成于 2026-04-28 -->
<!-- S2 P2 Research Progress Page 完成于 2026-05-01 -->

| Feature | Status | Product Doc | Design Status | Implementation Status | Architecture Status |
|---------|--------|-------------|---------------|-----------------------|---------------------|
| lumen | In Progress | [docs/product/lumen.md](product/lumen.md) | V2-4 Passed（2026-04-21），已移交 V2-5 | S1 Done（token pipeline、globals.css、shadcn compat、layout.tsx、/token-test 路由、E2E smoke 19 tests）；S2 P1 Done（ResearchInputHero、page.tsx、E2E 29 specs）；S2 P2 Done（ResearchCanvas + 4 节点/边组件 + TopBar/TaskPanel/TaskItem/BottomActiveBar；E2E 100 specs） | 基线架构已确立 ([ADR-0001](architecture/ADR-INDEX.md)) |
| lumen-s2-p1-research-input | Active | [docs/product/lumen.md](product/lumen.md) | Done（[ResearchInputHero 契约](designs/lumen/components/research-input-hero.md)） | Done（`apps/web/src/app/page.tsx`、`apps/web/src/components/research/research-input-hero.tsx`；E2E 29 specs T1×19+T2×8+T3×2） | — |
| lumen-s2-p2-research-progress | Active | [docs/product/lumen.md](product/lumen.md) | Done（[ResearchNodeCard](designs/lumen/components/research-node-card.md)/[ConflictNode](designs/lumen/components/conflict-node.md)/[DualTrackEdge](designs/lumen/components/dual-track-edge.md) 契约） | Done（`apps/web/src/app/research/[id]/page.tsx` + `apps/web/src/components/flow/*` + `apps/web/src/components/research/{research-progress-page,research-progress-top-bar,task-panel,task-item,bottom-active-bar}.tsx`；E2E 100 specs T1-T9） | — |
