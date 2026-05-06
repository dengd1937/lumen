---
component: ConflictBlock
feature: lumen
stage: V2-3
date: 2026-04-20
---

# ConflictBlock

## Variants

| Variant | 描述 | 视觉 |
|---------|------|------|
| 单一（列数可变） | P3 报告正文内联冲突标注块；默认 2 栏双轨对比；极少情况扩展为 3 栏 | `--conflict-bg` 背景；左侧 3px `--conflict-border` 竖条；`--radius-md`（8px）圆角 |

## States

| 状态 | 触发条件 | 视觉变化 |
|------|---------|---------|
| default | 常规展开态 | 展示双列对比（公开 vs 内部）+ footer AI 推断结论 |
| collapsed | 用户折叠（可选交互） | 仅显示 header 标题行，隐藏双列内容与 footer |
| highlighted | 报告正文导航（跳转锚点）到此块 | outline 2px `--conflict-fg`，标记当前活跃冲突块 |

## Responsive

| 断点 | 布局 |
|------|------|
| 桌面（min-width 1280px） | 2 栏 flex horizontal，gap-3；不做窄屏塌陷 |

## Accessibility

- `role="region"` + `aria-labelledby` 关联 header 中的冲突标题元素
- 左竖条（3px `--conflict-border`）作为颜色之外的冗余视觉提示
- footer"AI 推断"行设置 `role="note"`
- 三重编码保证色盲可辨识：triangle-alert 图标 + 橙色左边框 + 结构化区块形状
- 键盘：可聚焦（collapsed/expanded 切换按钮）；聚焦时显示标准聚焦环

## ARIA × Milestone 矩阵

| Milestone | 元素 | role | aria-* | 说明 |
|---|---|---|---|---|
| S2 P3 mock（当前） | 外层 `<div>` + 内嵌 `<header>` / 双列 `<div>` / footer `<div>` | 外层 `role="region"`；footer `role="note"` | `aria-labelledby="conflict-block-{id}-heading"` 关联 `<h3>` | 用 `<div role="region">` 而非 `<section>`：避免 `<section aria-labelledby>` 隐式 region 与显式 role 触发 `jsx-a11y/no-redundant-roles`；TriangleAlert + Lightbulb 图标均 `aria-hidden="true"`；当前未实现 collapsed/highlighted 状态 |
| v3 SSE live | （不变） | （不变） | （不变） | 数据源切换为 SSE 流式 conflict 检测；ARIA 语义不变；如未来引入 collapsed 切换按钮，按钮上加 `aria-expanded` 反映折叠态，highlighted 态由父容器通过 outline 视觉指示，不影响 region/note 语义 |

## Implementation Mapping

- 自绘组件 + Tailwind，无第三方 UI 底层
- 整体背景：`--conflict-bg`；`border-radius` = `--radius-md`（8px）；左边框 3px `--conflict-border`
- **Header**：横向排列，icon（triangle-alert）+ 冲突标题 + 分隔线 + 副标题
- **双栏（cols）**：`flex-row gap-3`；每栏内部 surface 背景 + 轨道色 1px 边框
- **Footer**：lightbulb icon + AI 推断文本；`role="note"`
- 注：TypeScript props 以源码为准

## Design Constraints

- 整体 padding = [16px, 20px]
- 左边框：3px `--conflict-border`
- header 标题：fs-base（14px），weight-600
- 双栏内文：fs-base（14px），lh-normal（1.5）
- footer 文本：fs-base（14px），weight-500
- highlighted 态：outline 2px `--conflict-fg`

## 关联 Token

- `--conflict-bg` — 整体背景色
- `--conflict-border` — 左竖条边框色
- `--conflict-fg` — highlighted 态 outline 色
- `--radius-md` — 圆角（8px）
