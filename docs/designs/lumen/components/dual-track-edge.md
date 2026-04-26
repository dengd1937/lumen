---
component: DualTrackEdge
feature: lumen
stage: V2-3
date: 2026-04-20
---

# DualTrackEdge

## Variants

| Variant | 描述 | 视觉 |
|---------|------|------|
| web | 公开 Web 轨道连线 | 实线；颜色 `--track-web-border`；thickness 1.5 |
| kb | 私有知识库轨道连线 | 虚线；颜色 `--track-kb-border`；dashPattern [4,4] |
| conflict | 冲突路径连线 | 实线；颜色 `--conflict-border`；thickness 1.5 |
| neutral | 中性功能连线（Conflict→Merge / Merge→Report） | 灰色实线；颜色 `--border` |

## States

| 状态 | 触发条件 | 视觉变化 |
|------|---------|---------|
| idle | 连线默认静止状态 | 静态线段，无动画 |
| animated | 节点进入 retrieving 状态时，对应边激活 | `stroke-dashoffset` CSS 动画，方向从源节点流向目标节点；duration = `--duration-slow`（360ms），linear，循环播放 |
| completed | 节点进入 completed 状态 | 停止 dashoffset 动画，保持恒定颜色 |

## Responsive

| 断点 | 布局 |
|------|------|
| 画布内（不设断点） | 由 React Flow zoom 控制整体缩放；连线路径由 React Flow 自动计算 |

## Accessibility

- 边为纯装饰元素，设置 `role="presentation"`
- 语义信息由源节点和目标节点的 `aria-label` 承载
- 色盲用户通过线型辨识轨道：web = 实线，kb = 虚线（[4,4]），不依赖颜色单一编码

## Implementation Mapping

- 基础组件：`@xyflow/react` custom edge
- 路径算法：`getBezierPath` 或 `getSmoothStepPath`（由画布布局决定）
- kb 虚线：SVG `strokeDasharray="4,4"`
- animated 状态：CSS `@keyframes` 驱动 `stroke-dashoffset`，实现粒子流动效果
- 末端不带箭头（arrowhead 设为 none）
- 注：TypeScript props 以源码为准

## Design Constraints

- 线宽：1.5px（web、conflict、neutral）；kb 同为 1.5px
- kb dashPattern：[4, 4]
- animated 动画时长：`--duration-slow`（360ms），linear，infinite 循环
- 末端无箭头，保持简洁

## 关联 Token

- `--track-web-border` — web 轨道连线颜色
- `--track-kb-border` — kb 轨道连线颜色
- `--conflict-border` — 冲突连线颜色
- `--border` — neutral 连线颜色
- `--duration-slow` — animated 状态动画时长（360ms）
