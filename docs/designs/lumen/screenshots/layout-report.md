# Layout Issues Report

---

**feature**: lumen
**stage**: V2-4 Phase 1 — Design-time visual checks
**date**: 2026-04-21
**tool**: Pencil MCP `snapshot_layout`
**source**: `docs/designs/lumen/design.pen`

---

## 概览

对 `design.pen` 全文档执行 `snapshot_layout({ problemsOnly: true })`，覆盖三个页面帧（P1 / P2 / P3），基准视口 1440×900，默认 Dark 主题。检查目标：溢出、裁切、元素重叠。

---

## 已检查屏幕

### P1 · 研究输入页（frame `272zW`）

| 区域 | Node ID | 尺寸 | 备注 |
|------|---------|------|------|
| Top Bar | `Zxg26` | 1440×64 | Branding 左对齐 (`tAv3c` 171×21)，Utility 右对齐 (`gBQa3` 128×20) |
| Hero Surface | `EDtBU` | 1440×836 | Hero Inner (`RRJ9q` 720×509) 居中，x=360 y=163.5 |

截图：[p1-research-input.png](p1-research-input.png)

---

### P2 · 研究进行页（frame `ES0Oe`）

| 区域 | Node ID | 尺寸 | 备注 |
|------|---------|------|------|
| Top Bar | `ti9ly` | 1440×64 | Brand 左 (`pBxcv` 161×21)，Session metadata 右 (`MCXTO` 181×32) |
| Split Layout | `hKf8U` | 1440×780 | Left Task Panel (`bseAr` 432×780) + Right Canvas (`M8ojG` 1008×780) |
| Bottom Active Node Bar | `U9Aaf` | 1440×56 | Active node (`YXGj3` 393×42) + SSE meta (`TuEqT` 121×24) + Controls (`lXgXo` 72×32) |

截图：[p2-research-progress.png](p2-research-progress.png)

---

### P3 · 报告阅读页（frame `K7xuz`）

| 区域 | Node ID | 尺寸 | 备注 |
|------|---------|------|------|
| Top Bar | `HyRZ4` | 1440×64 | Brand 左 (`Z7t4n` 161×21)，Export utilities 右 (`ypYdi` 183×32) |
| Three-Column Reader | `93PdK` | 1440×836 | KB Doc List (`jEf1o` 288×836) + Markdown Canvas (`dNcSC` 792×836) + Citation Panel (`XwPmS` 360×836) |

截图：[p3-report-reading.png](p3-report-reading.png)

---

## 问题列表

| 问题 | 位置 | 严重性 | 状态 |
|------|------|--------|------|
| — | — | — | — |

`snapshot_layout({ problemsOnly: true })` 扫描结果：**"No layout problems."**
零溢出 / 零裁切 / 零重叠。

---

## 已知豁免项

以下情况已在组件契约中显式记录，不计入问题列表。

### 豁免 1 — P2 React Flow 内部节点字体

Canvas 内部节点（P2 Right Canvas）在设计时 fit-view 缩放下字体标签视觉尺寸小于 14px。
生产环境 React Flow zoom 1.0 下实际渲染 ≥14px，符合中文字体可读性规则。

已记录于：
- `components/research-node-card.md`
- `components/dual-track-edge.md`
- `components/conflict-node.md`

### 豁免 2 — P1 Hero Inner 固定宽度 720px

`RRJ9q` 使用固定宽度 720px（`--hero-max-width`），该值为结构布局常量，不属于间距 token 体系，豁免 space-token 刻度检查。已记录于 `intent.md`。

---

## 关联截图（@2x）

- `screenshots/p1-research-input.png`
- `screenshots/p2-research-progress.png`
- `screenshots/p3-report-reading.png`

---

## 交接说明（V2-5 → 开发工作流 Step 1）

以下事项须在开发工作流 Step 1（`apps/web/` 初始化）中处理，消费设计 token 前必须完成。

### 1. Token 导入顺序

在 `apps/web/src/app/globals.css` 中按以下顺序导入，**shadcn 默认样式之前**：

```css
/* 1. Lumen design tokens */
@import "../../tokens/tokens.css";
/* 2. Tailwind v4 @theme block */
@import "../../tokens/tailwind-theme.css";
/* 3. shadcn overrides (after) */
```

### 2. Dark mode 策略统一

当前存在两套 dark mode 选择器冲突：
- tokens 侧：`[data-theme="dark"]` 属性
- shadcn 默认：`.dark` 类

**推荐方案**：统一使用 `[data-theme]` 属性，移除 shadcn `.dark` 变体。

### 3. CSS 变量冲突解决

以下变量在 lumen tokens 与 shadcn 默认值之间存在冲突，**lumen 优先**（依据 `intent.md` 第 91 行 orange-to-indigo 品牌覆盖规则）：

| 变量 | lumen 值 | shadcn 默认 | 决策 |
|------|---------|------------|------|
| `--primary` | `#1E40AF` | oklch near-black | lumen 覆盖 |
| `--border` | lumen token | shadcn default | lumen 覆盖 |
| `--radius-*` | lumen scale | shadcn default | lumen 覆盖 |

### 4. Tailwind v4 集成

`tokens/tailwind-preset.ts`（v3 JS 格式）已从 `tokens/` 移除。v4 集成仅使用 `tailwind-theme.css`，不引入 v3 preset。

### 5. Tailwind v4 theme 命名空间冲突（NI-1，已解决）

V2-4 复审（2026-04-21）标识的 LOW 问题：`tailwind-theme.css` 中 `--radius-*` / `--shadow-*` / `--font-sans` / `--font-mono` 自引用。

**处置（方案 A 已执行）**：
- `tokens.css` 中以下源名加 `--lumen-*` 前缀：`--lumen-radius-{xs,sm,md,lg,xl,full}`、`--lumen-shadow-{color,sm,md,lg}`、`--lumen-font-{sans,mono}`
- `tailwind-theme.css` 用非自引用形式暴露 Tailwind namespace：`--radius-lg: var(--lumen-radius-lg)` 等
- `--shadow-color` 原始名废弃，Tailwind 暴露为 `--color-shadow`；受影响的 `research-input-hero.md` 已同步更新引用
- 其他组件契约引用（`--radius-lg`、`--shadow-md` 等 Tailwind namespace 名）**无需变更**，由 `@theme inline` 写入 `:root` 后运行时可见
