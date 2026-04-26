---
component: CitationPanel
feature: lumen
stage: V2-3
date: 2026-04-20
---

# CitationPanel

## Variants

| Variant | 描述 | 视觉 |
|---------|------|------|
| 单一 | P3 右侧引用原文浮窗，仅一种形态 | 固定宽度 360px，从页面右侧滑入 |

## States

| 状态 | 触发条件 | 视觉变化 |
|------|---------|---------|
| closed | Panel 初始或被关闭后 | `translateX(100%)`，完全隐藏在视口右侧外 |
| opening | CitationBadge 被点击 | `transform` 动画：`translateX(100%)` → `translateX(0)`；duration = `--duration-base`（240ms），`--easing-out` |
| open | 动画结束，Panel 稳定 | `translateX(0)`；展示完整 metadata + 原文片段 + 高亮定位 |
| closing | 用户按 ESC 或点击关闭按钮 | `transform` 反向动画：`translateX(0)` → `translateX(100%)`；同参数 |

## Responsive

| 断点 | 布局 |
|------|------|
| 桌面（min-width 1280px） | 固定 width 360px，从右侧滑入；不做移动/平板适配 |

## Accessibility

- `role="dialog"` + `aria-modal="false"`（Panel 打开时报告主内容仍可滚动操作）
- `aria-labelledby` 关联 Panel Header 元素 ID
- ESC 键关闭 Panel
- 不做 focus-trap（设计意图：用户需同时与报告正文交互）
- **Focus return on close**：Panel 打开时保存触发它的 `CitationBadge` 元素引用；ESC 或点击关闭按钮时，必须将焦点显式返回到该 badge，避免键盘用户每次开关引用都丢失阅读位置（WCAG 2.4.3 Focus Order）
- 关闭按钮 `aria-label="关闭引用浮窗"`
- backdrop 不加暗化，保持报告正文可读性

## Implementation Mapping

- 基础组件：shadcn `Sheet`（side="right"）作底层抽屉
- 四段内部结构：
  1. **Panel Header**：标题 + 关闭按钮；`padding [16px, 20px]` + `border-bottom`
  2. **Source Meta**：来源 URL、日期、轨道标识等 metadata
  3. **Snippet Body**：原文片段展示区；内部支持独立滚动（`overflow-y: auto`）
  4. **Panel Footer**：辅助操作区
- 黄底高亮：`--citation-highlight` 背景色段落；左侧 3px `--conflict-fg` 边框标记冲突定位点
- backdrop 不加暗化
- 注：TypeScript props 以源码为准

## Design Constraints

- Panel 宽度：360px（固定）
- opening / closing 动画：duration = `--duration-base`（240ms），easing = `--easing-out`
- Panel Header：padding = [16px, 20px]，底部 `border-bottom` 分隔线
- 原文高亮段落：`--citation-highlight` 黄底背景 + 左 3px `--conflict-fg` 边框
- 原文英文文本：fs-sm（13px），lh-loose（1.75）；英文豁免 ≥14px 规则

## 关联 Token

- `--surface` — Panel 容器背景
- `--surface-elevated` — Snippet Body 内嵌背景层
- `--border` — Panel Header `border-bottom` 与 Footer 分隔线
- `--duration-base` — opening/closing 动画时长（240ms）
- `--easing-out` — opening/closing 动画曲线
- `--citation-highlight` — 原文高亮段落背景色（黄底）
- `--conflict-fg` — 原文冲突定位左边框色
- `--shadow-md` — Panel 滑入后右侧浮层阴影
- `--space-4` / `--space-5` — Panel Header padding
