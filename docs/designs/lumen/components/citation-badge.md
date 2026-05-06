---
component: CitationBadge
feature: lumen
stage: V2-3
date: 2026-04-20
---

# CitationBadge

## Variants

| Variant | 描述 | 视觉 |
|---------|------|------|
| primary | 主引用角标 | `--citation-badge`（#1E40AF）背景；`--primary-fg` 文字色 |
| web-track | 公开 Web 轨道引用角标 | `--track-web-bg` 背景；1px `--track-web-border` 边框；`--track-web-fg` 文字色 |
| kb-track | 私有知识库轨道引用角标 | `--track-kb-bg` 背景；1px `--track-kb-border` 边框；`--track-kb-fg` 文字色 |

## States

| 状态 | 触发条件 | 视觉变化 |
|------|---------|---------|
| default | 初始状态 | 各 variant 对应背景/边框/文字色 |
| hover | 鼠标悬停 | 亮度提升 +5%；shadcn `Tooltip` 显示来源预览（内容：标题 + URL + 相似度） |
| active | 用户点击角标后，对应 CitationPanel 打开时 | 高亮保持，视觉与 Panel 联动 |
| focus-visible | 键盘聚焦 | 显示聚焦环 `--ring` |

## Responsive

| 断点 | 布局 |
|------|------|
| 内联（不设断点） | `display: inline-block`，随正文文本自然换行；`white-space: nowrap` 保证角标数字不断行 |

## Accessibility

- `<button type="button">` 元素（native button 角色，不显式 `role` attribute；详见下方矩阵）+ `aria-label="引用 {n}，来源 {source title}"`
- 键盘 Enter / Space 触发点击（打开 CitationPanel）
- `aria-expanded` 标记对应 CitationPanel 是否已打开
- 双重编码：轨道色背景 + 文本数字 [n]，保证色觉障碍用户可识别
- 英文/数字字号豁免中文 ≥14px 规则（角标 12px 为设计规格）

## ARIA × Milestone 矩阵

| Milestone | 元素 | role 来源 | aria-* | 说明 |
|---|---|---|---|---|
| S2 P3 mock（当前） | `<button type="button">` | native button（隐式 button 角色，不显式 attribute） | `aria-label="引用 {n}，来源 {source title}"`、`aria-expanded={isOpen}` | CitationPanel 由 ReportMarkdownCanvas controlled state 决定开合；数据来自 `report-mock.ts` 静态 mock；isOpen + onToggle 始终成对传入（fully controlled） |
| v3 SSE live | `<button type="button">`（不变） | native button（不变） | `aria-label`（不变）、`aria-expanded`（不变） | 数据源切换为 SSE 流式 citation；ARIA 语义不变；`aria-expanded` 仍反映 CitationPanel 开合，与 hover 触发的 Tooltip 解耦 |

## Implementation Mapping

- 基础组件：shadcn `Tooltip` 作 hover 预览底层；角标本体为自绘 `<span>`
- Tooltip 内容：citation metadata（id / source title / URL / similarity）
- `display: inline-block`；`white-space: nowrap`
- 消费数据结构：citation metadata（id, source, similarity, track）
- 注：TypeScript props 以源码为准

## Design Constraints

- padding = [2px, 6px]
- `border-radius` = `--radius-sm`（4px）
- 字体：JetBrains Mono，fs-xs（12px），weight-600
- 英文/数字角标字号豁免 ≥14px 规则
- `white-space: nowrap`，角标不换行

## 关联 Token

- `--citation-badge` — primary variant 背景色（#1E40AF）
- `--primary-fg` — primary variant 文字色
- `--track-web-bg` — web-track variant 背景色
- `--track-web-border` — web-track variant 边框色
- `--track-web-fg` — web-track variant 文字色
- `--track-kb-bg` — kb-track variant 背景色
- `--track-kb-border` — kb-track variant 边框色
- `--track-kb-fg` — kb-track variant 文字色
- `--ring` — focus-visible 聚焦环色
- `--radius-sm` — 圆角（4px）
