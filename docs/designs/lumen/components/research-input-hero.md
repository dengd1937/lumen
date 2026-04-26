---
component: ResearchInputHero
feature: lumen
stage: V2-3
date: 2026-04-20
---

# ResearchInputHero

## Variants

| Variant | 描述 | 视觉 |
|---------|------|------|
| 无（单一实例） | 仅一个全局实例，整合 Badge + 标题 + 副标题 + Textarea Card + Source Pills + Submit 按钮 + 底部 Meta | — |

## States

| 状态 | 触发条件 | 视觉变化 |
|------|---------|---------|
| idle | 默认状态，页面加载后 | Input Card 无 ring；Submit 按钮显示 arrow-right 图标 |
| focused | Textarea 获得焦点 | Input Card 显示 ring（Dark 主题使用 `--ring` #E4E4E7） |
| submitting | 用户点击启动按钮 | Submit 按钮 arrow-right 替换为 loading spinner；按钮禁用态；触发 P1→P2 路由切换并建立 SSE 连接 |

## Responsive

| 断点 | 布局 |
|------|------|
| 桌面 min-width 1280px（高度 ≥800px） | Hero Inner 固定 max-width 720px（命名布局常量 `--hero-max-width`，豁免于 space token 系统），水平居中；Flex 垂直排列；不做平板/移动适配 |

## Accessibility

- Textarea 关联 `<label>` "研究主题"，通过 `htmlFor` / `aria-labelledby` 绑定
- Submit 按钮 `aria-label="启动研究"`
- Source Pills 使用 `aria-pressed` 标记双轨选中状态（公开 Web / 内部 KB 独立切换）
- 聚焦 ring：Dark 主题下使用 `--ring`（#E4E4E7），保证对比度
- 键盘：Tab 顺序依次为 Textarea → Source Pills → Submit 按钮

## Implementation Mapping

- 基础组件：shadcn/ui `Textarea`、`Button`、`Badge`；外层 Input Card 自绘
- 布局：`Flex` vertical，子元素间距通过 gap 控制
- Badge：位于标题上方，显示"公开 Web + 私有 KB · 双轨验证"
- Source Pills：两个 toggle 按钮（公开 Web / 内部 KB），双轨可同时选中
- Submit 按钮：点击后触发 idle → submitting 状态，执行路由 P1→P2 并建立 SSE 连接
- 注：TypeScript props 以源码为准

## Design Constraints

- Input Card：`radius` = `--radius-lg`（24px）；`box-shadow` = shadow-lg（y=12, blur=32, color=`--color-shadow`）
- 主标题"研究什么主题？"：`font-size` = fs-4xl（40px），`font-weight` = 700，`line-height` = lh-tight（1.2）
- 副标题说明文本：`font-size` = fs-md（16px），`line-height` = lh-normal（1.5），颜色 = `--fg-muted`
- Submit 按钮：`--primary` 背景 + `--primary-fg` 文字色；hover 背景 `--primary-hover`；`border-radius` = `--radius-md`；padding = `--space-3 --space-5`
- Badge："公开 Web + 私有 KB · 双轨验证"；`border-radius` = `--radius-full`；padding = `--space-1_5 --space-3`
- 正文中文字号 ≥ 14px；底部 Meta（本地化·数据不出境 / 完整证据链·引用可溯）字号遵循同规则

## 关联 Token

- `--primary` — Submit 按钮背景色
- `--primary-fg` — Submit 按钮文字色
- `--primary-hover` — Submit 按钮 hover 背景色
- `--ring` — focused 态聚焦环色
- `--radius-lg` — Input Card 圆角（24px）
- `--radius-md` — Submit 按钮圆角（8px）
- `--radius-full` — Badge 圆角
- `--shadow-lg` / `--color-shadow` — Input Card 阴影
- `--fg-muted` — 副标题颜色
- `--space-1_5` / `--space-3` / `--space-5` — Submit 按钮与 Badge padding
