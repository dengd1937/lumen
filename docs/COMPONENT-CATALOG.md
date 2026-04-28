# Component Catalog

**Last Updated:** 2026-04-28

## 领域特异组件（新建）

| 组件 | Feature | Base Component | 职责 | 契约文档 | 状态 |
|------|---------|---------------|------|---------|------|
| `ResearchNodeCard` | lumen | @xyflow/react custom node | React Flow 节点：状态徽章 + 进度文本 + 轨道标识 | [components/research-node-card.md](designs/lumen/components/research-node-card.md) | Design Done |
| `DualTrackEdge` | lumen | @xyflow/react custom edge | React Flow 边：公开/私有色彩区分 + 流向动画 | [components/dual-track-edge.md](designs/lumen/components/dual-track-edge.md) | Design Done |
| `ConflictNode` | lumen | @xyflow/react custom node | React Flow 冲突子图节点：橙色警示胶囊 | [components/conflict-node.md](designs/lumen/components/conflict-node.md) | Design Done |
| `CitationBadge` | lumen | shadcn/ui Tooltip | 报告正文内引用角标，hover 预览来源 | [components/citation-badge.md](designs/lumen/components/citation-badge.md) | Design Done |
| `CitationPanel` | lumen | shadcn/ui Sheet | P3 右侧滑入浮窗，原文高亮 360px | [components/citation-panel.md](designs/lumen/components/citation-panel.md) | Design Done |
| `ConflictBlock` | lumen | 自绘 + Tailwind | 报告正文内联冲突标注，双列对比 | [components/conflict-block.md](designs/lumen/components/conflict-block.md) | Design Done |
| `KbDocumentList` | lumen | 自绘列表 + Lucide icons | P3 左栏 KB 文档清单 + 章节高亮联动 | [components/kb-document-list.md](designs/lumen/components/kb-document-list.md) | Design Done |
| `ResearchInputHero` | lumen | shadcn/ui Textarea + Badge + Button | P1 主区：标题 + 副标题 + 双轨数据源切换(Web/KB) + 主题输入 + 启动按钮 | [components/research-input-hero.md](designs/lumen/components/research-input-hero.md) | Active |

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

> 上述组件通过 `globals.css` 的 shadcn 兼容别名层接入 Lumen token，别名映射：`--background`、`--card`、`--muted`、`--accent`、`--secondary`、`--input`（N3 差异化：muted→surface，accent/secondary→surface-elevated）。

> 设计来源：[docs/designs/lumen/intent.md](designs/lumen/intent.md)
> 组件契约均已在 V2-3 高保真阶段产出，V2-4 Design Review 于 2026-04-21 通过。
> 移交说明：[docs/designs/lumen/screenshots/layout-report.md](designs/lumen/screenshots/layout-report.md)
