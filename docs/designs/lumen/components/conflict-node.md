---
component: ConflictNode
feature: lumen
stage: V2-3
date: 2026-04-20
---

# ConflictNode

## Variants

| Variant | 描述 | 视觉 |
|---------|------|------|
| 单一（胶囊形） | ConflictSubgraph 子图中双轨汇聚处的唯一警示节点形态 | 橙色胶囊外形；`border-radius` = `--radius-full` |

## States

| 状态 | 触发条件 | 视觉变化 |
|------|---------|---------|
| detected | SSE `conflict_detected` 事件触发，节点首次出现 | `--conflict-bg` 背景；`--conflict-border` 1.5px 边框；outer shadow blur-20 alpha55 glow；首次出现时 pulse 入场动画 |
| resolved | 冲突已解决（报告生成完成） | 背景灰化；边框颜色切换为 `--fg-muted` |
| pending | 冲突检测中，尚未确认 | 虚线边框 |

## Responsive

| 断点 | 布局 |
|------|------|
| 画布内（不设断点） | 由 React Flow zoom 控制整体缩放 |

## Accessibility

- **Role lifecycle**：
  - 首次出现时（SSE `conflict_detected` 触发的首帧）挂载 `role="alert"`，携带隐式 `aria-live="assertive"`，保证屏幕阅读器立即中断并播报
  - 初次播报完成后（建议下一次 `requestAnimationFrame` 或挂载后 500ms）切换为 `role="status"`，携带隐式 `aria-live="polite"`，后续的状态切换（detected → resolved / pending）以非侵入方式播报
  - 不得同时设置 `role="alert"` 与显式 `aria-live="polite"`，两者语义冲突，行为在 NVDA/VoiceOver 间不一致
- 三重视觉编码：triangle-alert 图标 + 橙色背景 + 胶囊形状，保证色盲可辨识
- `aria-label` 包含冲突概述文本
- 键盘：可通过 Tab 聚焦；聚焦时显示标准聚焦环

## Implementation Mapping

- 基础组件：`@xyflow/react` custom node
- `cornerRadius` = `--radius-full`（胶囊形）
- detected 态由 SSE `conflict_detected` 事件触发，更新节点状态
- triangle-alert 图标：Lucide，尺寸 14×14
- 分隔线：1px `--conflict-border`，位于图标与文本之间
- 标识文本"ConflictSubgraph · #C01"使用 JetBrains Mono fs-xs
- 注：TypeScript props 以源码为准

## Design Constraints

- 节点高度：48px；padding = [10px, 16px]
- triangle-alert 图标：14×14px
- 分隔线：1px `--conflict-border`
- 标识文本：JetBrains Mono，fs-xs
- detected 态 glow：outer shadow blur-20，颜色 `--conflict-border` alpha55
- resolved 态：边框色 `--fg-muted`，视觉降权

## 关联 Token

- `--conflict-bg` — detected 态背景色
- `--conflict-border` — 边框色 / 分隔线 / glow 色
- `--radius-full` — 胶囊圆角
- `--fg-muted` — resolved 态边框灰化色
