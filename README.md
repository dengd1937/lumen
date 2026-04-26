# Lumen

面向咨询顾问的 Agentic Deep Research 工作台。公开 + 私有双轨混合检索，跨源验证与冲突标注，输出带完整证据链的研究简报。

> 公司内部 AI 竞赛参赛项目（1 人 / 30 天）。详见 [`docs/product/lumen.md`](docs/product/lumen.md)。

---

## 仓库结构

```
lumen/
├── apps/
│   ├── web/             # Next.js 16 + Tailwind v4 + shadcn/ui + React Flow
│   └── api/             # FastAPI + LangGraph + ChromaDB + uv（Python 3.12）
├── docs/
│   ├── product/         # 产品定义
│   ├── architecture/    # ADR
│   ├── designs/         # Pencil 设计产物（Design Workflow L2）— 已完成 lumen feature（intent / tokens / components / screenshots）
│   └── kb_docs/         # 模拟内部知识库源文档（注入 ChromaDB）
└── .claude/             # 项目 skill / agent / rule 配置
```

详细架构决策见 [`docs/architecture/adr/0001-lumen-baseline-architecture.md`](docs/architecture/adr/0001-lumen-baseline-architecture.md)。

---

## 启动

需要两个终端窗口（前后端分离）。

### 前端 — `apps/web`

```bash
cd apps/web
pnpm install        # 首次
pnpm dev            # http://localhost:3000
```

### 后端 — `apps/api`

```bash
cd apps/api
cp .env.example .env    # 首次：填入 DASHSCOPE_API_KEY、FIRECRAWL_API_KEY、LANGSMITH_API_KEY
uv sync                 # 首次
uv run uvicorn main:app --reload --workers 1 --port 8000
```

> ⚠ **必须 `--workers 1`**（ADR-0001 D5 约束）：ChromaDB embedded 与 SQLite 在多 worker 下会出现并发写入争用。Demo 单用户场景不受单 worker 影响。

---

## 技术栈

| 层 | 选型 | 来源 |
|---|---|---|
| 前端框架 | Next.js 16 + React 19 + Tailwind v4 | `apps/web` |
| UI 组件 | shadcn/ui + Lucide | `apps/web` |
| 可视化 | `@xyflow/react`（React Flow，双轨 Plan 树） | `apps/web` |
| SSE 解析 | Vercel AI SDK (`ai`) | `apps/web` |
| 设计 token | style-dictionary（pipeline，由 Pencil 输出消费） | `apps/web` |
| 后端框架 | FastAPI + uvicorn | `apps/api` |
| Agent 编排 | LangGraph（fork 自 `langchain-ai/open_deep_research`，最小 delta） | `apps/api` |
| 持久化 | SQLite（统一存：LangGraph Checkpoint / 引用元数据 / 审计日志） | `apps/api` |
| 向量库 | ChromaDB embedded | `apps/api` |
| 模型 | Qwen-Max via DashScope OpenAI-compatible endpoint | `apps/api` |
| Embedding | DashScope `text-embedding-v3` | `apps/api` |
| 网页抓取 | Firecrawl | `apps/api` |
| 可观测性 | LangSmith | `apps/api` |

---

## 文档导航

- 产品定义：[`docs/product/lumen.md`](docs/product/lumen.md)
- 基线架构 ADR：[`docs/architecture/adr/0001-lumen-baseline-architecture.md`](docs/architecture/adr/0001-lumen-baseline-architecture.md)
- ADR 索引：[`docs/architecture/ADR-INDEX.md`](docs/architecture/ADR-INDEX.md)
- Feature Catalog：[`docs/FEATURE-CATALOG.md`](docs/FEATURE-CATALOG.md)
- Component Catalog：[`docs/COMPONENT-CATALOG.md`](docs/COMPONENT-CATALOG.md)
- 项目规则与工作流：[`CLAUDE.md`](CLAUDE.md) + [`.claude/rules/`](.claude/rules/)
