---
component: ResearchNodeCard
feature: lumen
stage: V2-3
date: 2026-04-20
---

# ResearchNodeCard

## Variants

| Variant | 描述 | 视觉 |
|---------|------|------|
| track-web | 公开 Web 轨道节点 | 圆角 `--radius-lg`；青色边框 `--track-web-border`；globe / search 图标；`--track-web-bg` 背景 |
| track-kb | 私有知识库轨道节点 | 直角 `--radius-xs`；紫色边框 `--track-kb-border`；database / lock 图标；`--track-kb-bg` 背景 |
| utility | 功能性骨架节点（Input / Merge / Report） | 中性灰边框 `--border`；无轨道色背景 |

## States

| 状态 | 触发条件 | 视觉变化 |
|------|---------|---------|
| planning | 节点创建、等待调度 | `--node-state-planning` 灰色边框；状态圆点脉冲动画 |
| retrieving | 节点开始执行（SSE `node_started`） | `--node-state-retrieving` 边框；loader 图标旋转；outer shadow blur-16，颜色为轨道色 alpha66 glow 效果 |
| completed | 节点执行完成（SSE `node_completed`） | `--node-state-completed` 圆点；显示 check 图标 |
| error | 节点执行失败 | `--node-state-error` 边框；显示 alert-triangle 图标 |

## Responsive

| 断点 | 布局 |
|------|------|
| 画布内（不设断点） | 由 React Flow zoom 控制整体缩放；节点固定尺寸 200×88px；字号属于"缩放预览"，豁免中文 ≥14px 规则 |

## Accessibility

- `role="group"` + `aria-label` 合成文本："{标题} · {轨道} · 状态 {state}"
- 状态采用三重编码：色彩（轨道色）+ 形状（track-web 圆角 / track-kb 直角）+ 图标（loader / check / alert-triangle）
- 进度文本"chunk 12/20"可被屏幕阅读器读取；通过 `aria-live="polite"` 实时播报进度更新
- 键盘：React Flow 节点可通过 Tab 聚焦；聚焦时显示标准聚焦环

## Implementation Mapping

- 基础组件：`@xyflow/react` custom node type
- `sourceHandle` 位置 = right；`targetHandle` 位置 = left
- 圆角/直角通过条件类：`cn("rounded-lg", track === "kb" && "rounded-xs")`
- SSE 事件消费：`node_started` → retrieving；`node_progress` → 更新进度文本；`node_completed` → completed
- 主标题字体：Geist 600 weight；进度 metadata：JetBrains Mono
- 注：TypeScript props 以源码为准

## Design Constraints

- 节点固定尺寸：200×88px；内边距 12px
- 状态圆点：6×6px
- active 态（retrieving）：outer shadow blur-16，颜色为轨道色 alpha66
- track-web 边框色：`--track-web-border`；背景：`--track-web-bg`
- track-kb 边框色：`--track-kb-border`；背景：`--track-kb-bg`；圆角 `--radius-xs`（直角）
- utility 边框色：`--border`

## 关联 Token

- `--track-web-border` — Web 轨道节点边框色
- `--track-web-bg` — Web 轨道节点背景色
- `--track-kb-border` — KB 轨道节点边框色
- `--track-kb-bg` — KB 轨道节点背景色
- `--border` — utility 节点边框色
- `--radius-lg` — track-web 圆角
- `--radius-xs` — track-kb 直角
- `--node-state-planning` — planning 状态边框色
- `--node-state-retrieving` — retrieving 状态边框色
- `--node-state-completed` — completed 状态圆点色
- `--node-state-error` — error 状态边框色
