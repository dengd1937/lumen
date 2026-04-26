# Lumen — Design Intent

## 元信息

| 字段 | 值 |
|------|-----|
| feature | lumen |
| stage | V2-1 Design Intent |
| author | dengdi |
| date | 2026-04-19 |
| input docs | `docs/product/lumen.md` · `docs/architecture/adr/0001-lumen-baseline-architecture.md` |
| design system base | Pencil lunaris（100 个 reusable components + 完整 Light/Dark token） |

---

## 设计方向

「Editorial Scientific（编辑科学）+ Blueprint Technical（蓝图技术）」混合调性。

- 咨询顾问审美：冷静、专业、数据密集、信息留白
- AI Agentic 工具气质：技术深度感、过程可视化
- 字体：JetBrains Mono（等宽，技术感）+ Geist（Sans 主文）
- 默认 Dark 主题（咨询场景长时阅读 + 演示对比度强 + 技术调性），提供 Light 切换

---

## 参考资料

- Perplexity — P1 研究输入页 Hero 极简布局参考
- McKinsey / BCG 报告视觉语言 — 靛蓝专业调性参考
- ADR-0001 D2 — SSE 事件 schema 契约（前后端不可漂移）
- lunaris design system — 100 个 reusable 组件 + 完整 Light/Dark token

---

## UI 范围

### 涉及页面

| 页面 | 布局原型 | 核心区域 |
|------|---------|---------|
| **P1 研究输入页** | Perplexity 风 Hero 极简屏 | 居中大标题 + 多行 Textarea + KB 状态指示卡 + 启动按钮 |
| **P2 研究进行页** | 左右分屏 30/70 | 左：任务规划列表 + 子任务进度；右：React Flow 双轨画布；底：活跃节点状态栏 |
| **P3 报告阅读页** | 三栏 20/55/25（右栏默认隐藏） | 左：KB 文档清单面板（高亮联动）；中：Markdown 报告 + 引用角标 + 内联冲突块；右（懒显）：引用原文片段浮窗 |

**仅桌面**：min 1280×800，设计目标 1440×900，不做移动/平板。

### 涉及组件（新建，领域特异）

| 组件 | 职责 | 实现技术 |
|------|------|---------|
| `ResearchNodeCard` | React Flow 节点：状态徽章 + 进度文本 + 轨道标识 | @xyflow/react custom node |
| `DualTrackEdge` | React Flow 边：公开/私有色彩区分 | @xyflow/react custom edge |
| `ConflictNode` | React Flow 冲突子图节点：橙色警示 | @xyflow/react custom node |
| `CitationBadge` | 报告正文内引用角标，hover 预览 | shadcn Tooltip + 自绘徽章 |
| `CitationPanel` | 右侧滑入浮窗，原文高亮 | shadcn Sheet |
| `ConflictBlock` | 报告正文内联冲突标注 | 自绘 + Tailwind |
| `KbDocumentList` | KB 文档清单 + 高亮联动 | 自绘列表 + Lucide icons |
| `ResearchInputHero` | P1 主区：大标题 + 大输入框 + KB 卡 | 组合 lunaris 已有组件 |

### 关键交互

| 交互 | 触发 | 反应 |
|------|------|------|
| P1 → P2 | 点击启动按钮 | 路由跳转 + 立即建立 SSE 连接 |
| 节点状态切换 | SSE `node_started / node_progress / node_completed` | planning（pulse）→ retrieving（spinner）→ completed（check + 渐显边框色） |
| 引用角标点击 | 用户点击角标 | 右侧浮窗 `transform: translateX(0)` 滑入（300ms ease-out）+ 原文片段黄底 highlight |
| 冲突标注 | SSE `conflict_detected` + 报告渲染时 | 报告正文内联：左竖条警示 + 双列对比（公开 vs 内部） |
| KB 文档高亮联动 | P3 阅读章节切换 | 当前章节引用的 KB 文档在左栏高亮 1px 描边 |

---

## 可复用资产

### 直接复用 lunaris（无需新建）

Button、Icon Button、Input、Textarea、Search Box、Card、Sidebar、Tabs、Alert、Dialog、Modal、Tooltip、Progress、Avatar、Dropdown

### 直接复用 shadcn/ui

Sheet（CitationPanel 底层）、Tooltip（CitationBadge 底层）

---

## 约束

- **平台约束**：仅桌面，min 1280×800，不做响应式移动端
- **前后端契约**：SSE 事件 schema 已在 ADR-0001 D2 冻结，前端 UI 状态机必须严格对应，不可漂移
- **工程约束**：1 人 30 天交付，优先复用 lunaris + shadcn/ui，避免过度工程化
- **React Flow**：`@xyflow/react` 实现 P2 双轨可视化，自定义节点/边复用其扩展点
- **主色覆盖**：lunaris 默认 `--primary = #FF8400`（橙）在 lumen 中覆盖为 `#1E40AF`（靛蓝）；橙色 `#FF8400` 移至 `--conflict-*` 语义色
- **字号最小值**：中文字号最小 14px

---

## 主色与双轨视觉语言

### 主色

- **`--primary` = `#1E40AF`（深靛蓝）**
- 选择理由：McKinsey/BCG 咨询专业调性；与私有轨紫罗兰（`#8B5CF6`）色相差 30°视觉清晰；与公开轨青（`#0EA5E9`）色相差 40°；与冲突橙（`#FF8400`）严格对立色相

### 双轨道视觉语言

| 元素 | 公开轨（Web） | 私有轨（KB） |
|------|--------------|-------------|
| 主色调 | 青 `#0EA5E9` | 紫罗兰 `#8B5CF6` |
| 节点形状 | 圆角矩形（开放/流动） | 直角矩形（沉稳/封闭） |
| 节点图标 | `globe` / `search`（Lucide） | `database` / `lock`（Lucide） |
| 连线样式 | 实线 | 虚线（暗示"内部"） |
| 泳道标签 | "公开" + 全球图标 | "私有 KB" + 锁图标 |

**ConflictSubgraph 节点**：lunaris 橙 `#FF8400` 作为警示色，居中位于双轨汇聚处。

---

## Token 扩展需求

在 V2-2 / V2-3 阶段落地，扩展自 lunaris 基础 token，不重建基础层。

```
# 双轨语义色
--track-web-fg / -bg / -border / -muted     # 公开轨配色
--track-kb-fg / -bg / -border / -muted      # 私有轨配色

# 节点状态色
--node-state-planning   # 规划中
--node-state-retrieving # 检索中
--node-state-completed  # 完成
--node-state-error      # 错误

# 冲突标注（复用橙系）
--conflict-fg / -bg / -border

# 引用追溯
--citation-badge        # 角标徽章
--citation-highlight    # 原文片段黄底高亮

# 补全 lunaris 缺失档位
--radius-sm = 4
--radius-lg = 24
```

---

## 设计契约 ↔ SSE 事件映射

| SSE 事件（ADR-0001 D2） | UI 反应 |
|------------------------|---------|
| `plan_created` | P2 渲染初始节点拓扑 + 左侧任务列表 |
| `node_started` | 对应节点变 retrieving 态（spinner + 高亮边） |
| `node_progress` | 节点内进度文本更新 |
| `node_completed` | 节点变 completed 态（check + 渐显成功色） |
| `conflict_detected` | ConflictNode 出现 + 报告中预占冲突块 |
| `report_chunk` | P3 Markdown 流式渲染（chunk by chunk） |
| `done` | 跳转 P3 + 完整报告就绪 |
| `error` | Alert / Error 全局横幅 |

---

## 可访问性目标

- 引用角标 + 节点状态：色彩以外附图标/形状双重区分（色觉无障碍）
- 聚焦环 `--ring` 在 Dark 主题下使用浅灰，保证可见
- SSE 实时更新对屏幕阅读器友好（`aria-live="polite"`）
- 中文字号最小 14px

---

## 决策理由

选择「Editorial Scientific + Blueprint Technical」混合调性而非其他方案：

1. **与竞品差异化**：秘塔 AI 采用单轨浅色 UI，lumen 以深色 + 双轨可视化形成视觉区隔
2. **靛蓝主色**：相较于 lunaris 默认橙色，靛蓝在咨询领域更具专业认同感，且与双轨配色系统（青、紫）构成和谐色相层级；橙色专用于冲突警示语义，不用作品牌色
3. **Dark 默认**：咨询场景长时阅读减少视疲劳，演示场景对比度更强，与 JetBrains Mono 技术调性吻合
4. **形状 + 色彩双重编码**：圆角 vs 直角区分公开/私有轨，解决色觉障碍用户无法通过颜色区分的问题
5. **优先复用 lunaris**：避免重建基础组件，30 天周期内 8 个领域特异新组件是可控工程量

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 双轨色（青 vs 紫）色觉障碍用户难分辨 | 形状（圆角 vs 直角）+ 图标（globe vs database）双重区分 |
| Dark 主题下 React Flow 节点对比度不足 | V2-2 截图实测，必要时调整 `--node-state-*` 亮度 |
| 引用浮窗 300ms 滑入感觉慢 | V2-3 真机实测，必要时降至 200ms |
| Demo 评委忽略冲突标注 | 冲突块左竖条 + 背景色 + 双列对比三重叠加，V2-3 反复打磨视觉权重 |

---

## 后续工作流

- **V2-2**：在 `wireframes.pen` 中搭 3 页面线框 + 注入第一批 token
- **V2-3**：高保真设计，8 个新组件逐一输出组件契约（`component-contract` 模板）
- **V2-4**：Design Review，产出 `review-verdict.md` + `layout-report.md`
- **设计系统衔接**：基于 lunaris 100 个 reusable 组件做覆盖式扩展，不重建基础组件

---

## 验收标准（Gate 1）

- [x] 产品文档 + ADR 已对齐
- [x] 风格定位、主色、双轨色已确认
- [x] 3 页面信息架构已明确
- [x] 复用策略与新建组件清单已列
- [x] Token 扩展清单已列
- [x] 设计契约与 SSE 事件映射已对齐 ADR-0001 D2
