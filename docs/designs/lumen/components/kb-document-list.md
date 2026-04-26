---
component: KbDocumentList
feature: lumen
stage: V2-3
date: 2026-04-20
---

# KbDocumentList

## Variants

| Variant | 描述 | 视觉 |
|---------|------|------|
| 单一容器 | P3 左栏证据文档列表容器，按轨道分组 | 固定 width 288px；包含 Header + Filter Tabs + 可滚动列表 |
| web-item（子型） | 公开 Web 轨道文档列表项 | `--track-web-fg` 色系；globe 图标 |
| kb-item（子型） | 私有知识库轨道文档列表项 | `--track-kb-fg` 色系；database 图标 |

## States

| 状态 | 触发条件 | 视觉变化 |
|------|---------|---------|
| idle | 默认展示 | 全部文档按分组列出，无特殊高亮 |
| active | 当前报告章节引用了该文档（匹配引用 ID 集合） | 左边框 2px 轨道色；背景 `--surface-elevated`；CitationBadge 角标切换为主色 |
| filtered-out | Filter Tabs 筛选排除该轨道 | 对应分组/条目隐藏（display: none） |
| hover | 鼠标悬停 | 背景微提升至 `--surface-elevated` |

## Responsive

| 断点 | 布局 |
|------|------|
| 桌面（min-width 1280px） | 固定 width 288px；高度跟随报告主区域，内部列表区域独立滚动 |

## Accessibility

- 外层容器：`role="list"`
- 每条文档项：`role="listitem"` + `aria-current="true"` when active
- 键盘导航：ArrowUp / ArrowDown 在列表项间移动
- 分组标题（"公开 Web" / "内部 KB"）：`<h3>` heading，提供语义分组
- Filter Tabs：`role="tablist"`；每个 tab `role="tab"`，配合 `aria-selected` 标记当前激活筛选

## Implementation Mapping

- 自绘列表 + Lucide icons（globe → web-item；database → kb-item）
- 结构：
  1. **Header**：标题"证据来源" + count chip（显示当前文档总数）
  2. **Filter Tabs**：全部 / Web / KB 三个 tab，控制列表分组可见性
  3. **可滚动列表区**（`overflow-y: auto`）：按轨道分组；每 item = [CitationBadge 角标] + 文档标题 + metadata（URL · 日期）
- active 联动：报告章节切换时，匹配该章节的引用 ID 集合，更新对应 item 的 active 状态
- 注：TypeScript props 以源码为准

## Design Constraints

- Header padding = `--space-4 --space-5`（16/20）
- 列表项 padding = `--space-2_5 --space-5`（10/20），gap = `--space-2_5`（各元素间距）
- active 态：左 `--space-0_5`（2px）轨道色边框
- 分组标题样式：JetBrains Mono，fs-xs，weight-600，颜色 `--fg-subtle`（类大写标签风格）
- 文档标题：Geist，fs-base，weight-500

## 关联 Token

- `--track-web-fg` — web-item 文字/图标色系
- `--track-web-border` — web-item active 态左边框色
- `--track-kb-fg` — kb-item 文字/图标色系
- `--track-kb-border` — kb-item active 态左边框色
- `--surface-elevated` — active / hover 态背景色提升
- `--fg-subtle` — 分组标题颜色
- `--border-subtle` — 列表项之间分隔线（可选）
- `--space-0_5` / `--space-2_5` / `--space-4` / `--space-5` — Header/列表项 padding 与边框宽度
