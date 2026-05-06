# Component Catalog

**Last Updated:** 2026-05-06

## 领域特异组件（新建）

| 组件 | Feature | Base Component | 职责 | 契约文档 | 状态 |
|------|---------|---------------|------|---------|------|
| `ResearchNodeCard` | lumen | @xyflow/react custom node | React Flow 节点：状态徽章 + 进度文本 + 轨道标识 | [components/research-node-card.md](designs/lumen/components/research-node-card.md) | Active（impl: `apps/web/src/components/flow/research-node-card.tsx`） |
| `DualTrackEdge` | lumen | @xyflow/react custom edge | React Flow 边：公开/私有色彩区分 + 流向动画 | [components/dual-track-edge.md](designs/lumen/components/dual-track-edge.md) | Active（impl: `apps/web/src/components/flow/dual-track-edge.tsx`；注：animated 状态 SSE 驱动 stroke-dashoffset 动画已延期至 v3 SSE 集成，当前仅实现 idle 状态） |
| `ConflictNode` | lumen | @xyflow/react custom node | React Flow 冲突子图节点：橙色警示胶囊 | [components/conflict-node.md](designs/lumen/components/conflict-node.md) | Active（impl: `apps/web/src/components/flow/conflict-node.tsx`） |
| `CitationBadge` | lumen | shadcn/ui Tooltip | 报告正文内引用角标，hover 预览来源 | [components/citation-badge.md](designs/lumen/components/citation-badge.md) | Active（impl: `apps/web/src/components/report/citation-badge.tsx`） |
| `CitationPanel` | lumen | shadcn/ui Sheet | P3 右侧滑入浮窗，原文高亮 360px | [components/citation-panel.md](designs/lumen/components/citation-panel.md) | Active（impl: `apps/web/src/components/report/citation-panel.tsx`） |
| `ConflictBlock` | lumen | 自绘 + Tailwind | 报告正文内联冲突标注，双列对比 | [components/conflict-block.md](designs/lumen/components/conflict-block.md) | Active（impl: `apps/web/src/components/report/conflict-block.tsx`） |
| `KbDocumentList` | lumen | 自绘列表 + Lucide icons | P3 左栏 KB 文档清单 + 章节高亮联动 | [components/kb-document-list.md](designs/lumen/components/kb-document-list.md) | Active（impl: `apps/web/src/components/report/kb-document-list.tsx`） |
| `ResearchInputHero` | lumen | shadcn/ui Textarea + Badge + Button | P1 主区：标题 + 副标题 + 双轨数据源切换(Web/KB) + 主题输入 + 启动按钮 | [components/research-input-hero.md](designs/lumen/components/research-input-hero.md) | Active |
| `ResearchCanvas` | lumen | @xyflow/react ReactFlow | P2 画布容器：注册 nodeTypes/edgeTypes、强制 themed `--bg` 背景 | 无独立设计契约（属于 page 组合层） | Active（impl: `apps/web/src/components/flow/research-canvas.tsx`） |
| `ResearchProgressTopBar` | lumen | 自绘 + Lucide | P2 顶栏：Lumen 标识 + 面包屑 + session meta | 含于 [intent.md](designs/lumen/intent.md) P2 区域 | Active（impl: `apps/web/src/components/research/research-progress-top-bar.tsx`） |
| `TaskPanel` | lumen | 自绘 | P2 左侧任务列表容器 | 含于 [intent.md](designs/lumen/intent.md) P2 区域 | Active（impl: `apps/web/src/components/research/task-panel.tsx`） |
| `TaskItem` | lumen | 自绘 + Lucide | P2 单个任务条目（state 徽章 + 标题 + detail） | 含于 [intent.md](designs/lumen/intent.md) P2 区域 | Active（impl: `apps/web/src/components/research/task-item.tsx`） |
| `BottomActiveBar` | lumen | 自绘 + Lucide | P2 底部活跃节点条：当前节点标签 + SSE meta + 暂停按钮 | 含于 [intent.md](designs/lumen/intent.md) P2 区域 | Active（impl: `apps/web/src/components/research/bottom-active-bar.tsx`） |
| `ReportTopBar` | lumen | 自绘 + Lucide | P3 顶栏：Lumen 标识 + 面包屑 + session meta | 含于 [intent.md](designs/lumen/intent.md) P3 区域 | Active（impl: `apps/web/src/components/report/report-top-bar.tsx`） |
| `ReportReadingPage` | lumen | 自绘 + TooltipProvider | P3 页面组合：三栏布局 (288 / flex / 360) + 接入 KbDocumentList + ReportMarkdownCanvas | 含于 [intent.md](designs/lumen/intent.md) P3 区域 | Active（impl: `apps/web/src/components/report/report-reading-page.tsx`） |
| `ReportMarkdownCanvas` | lumen | 自绘 + Client | P3 中央画布：按 ReportData.sections.bodyParts 分派 text/citation-inline/conflict；管 openCitationId 状态 + badgeRefs | 含于 [intent.md](designs/lumen/intent.md) P3 区域 | Active（impl: `apps/web/src/components/report/report-markdown-canvas.tsx`） |

## lunaris 直接复用（无需新建）

| 组件 | Feature | Base Component | 状态 |
|------|---------|---------------|------|
| Button | lumen | lunaris | Active |
| Icon Button | lumen | lunaris | Active |
| Input | lumen | lunaris | Active |
| Textarea | lumen | lunaris | Active |
| Search Box | lumen | lunaris | Active |
| Card | lumen | lunaris | Active |
| Sidebar | lumen | lunaris | Active |
| Tabs | lumen | lunaris | Active |
| Alert | lumen | lunaris | Active |
| Dialog | lumen | lunaris | Active |
| Modal | lumen | lunaris | Active |
| Tooltip | lumen | lunaris | Active |
| Progress | lumen | lunaris | Active |
| Avatar | lumen | lunaris | Active |
| Dropdown | lumen | lunaris | Active |

## shadcn/ui 已安装原语（`apps/web/src/components/ui/`）

| 组件 | Feature | Base Component | 安装时间 | 状态 |
|------|---------|---------------|---------|------|
| `Button` | lumen | shadcn/ui Button | S1 Token Integration（2026-04-26 前已存在） | Active |
| `Input` | lumen | shadcn/ui Input | S1 Token Integration（2026-04-26） | Active |
| `Card` | lumen | shadcn/ui Card | S1 Token Integration（2026-04-26） | Active |
| `Textarea` | lumen | shadcn/ui Textarea | S2 P1 Research Input（2026-04-28） | Active |
| `Badge` | lumen | shadcn/ui Badge | S2 P1 Research Input（2026-04-28） | Active |
| `Tooltip` | lumen | shadcn/ui Tooltip（base-nova，wraps `@base-ui/react/tooltip`） | S2 P3 Report Reading（2026-05-05） | Active |
| `Sheet` | lumen | shadcn/ui Sheet（base-nova，wraps `@base-ui/react/dialog`，加 `overlay?: boolean` opt-out prop） | S2 P3 Report Reading（2026-05-05） | Active |

> 上述组件通过 `globals.css` 的 shadcn 兼容别名层接入 Lumen token，别名映射：`--background`、`--card`、`--muted`、`--accent`、`--secondary`、`--input`（N3 差异化：muted→surface，accent/secondary→surface-elevated）。

> 设计来源：[docs/designs/lumen/intent.md](designs/lumen/intent.md)
> 组件契约均已在 V2-3 高保真阶段产出，V2-4 Design Review 于 2026-04-21 通过。
> 移交说明：[docs/designs/lumen/screenshots/layout-report.md](designs/lumen/screenshots/layout-report.md)
