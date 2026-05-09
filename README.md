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

详细架构决策见 [ADR-INDEX](docs/architecture/ADR-INDEX.md)（当前：[ADR-0001 基线架构](docs/architecture/adr/0001-lumen-baseline-architecture.md)、[ADR-0002 SSE 协议、Mock 桥接、Demo 部署](docs/architecture/adr/0002-sse-protocol-and-demo-deployment.md)）。

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

## Demo Runbook (M1.0)

M1.0 SSE skeleton 验证流程。前后端分别启动，通过 curl 直连 SSE 协议端点验证骨架闭环。前端 mock 通道在 P1/P2/P3 渲染层稳定运行；SSE 端到端 happy-path 由 curl + Playwright `e2e/sse-protocol.spec.ts`（T15）覆盖。

```bash
# 1. 注入秘钥（1Password CLI）
op inject -i .env.tpl -o apps/api/.env

# 2. 后端
cd apps/api
uv sync
uv run uvicorn main:app --reload --workers 1 --port 8000

# 3. 前端（另一个终端）
cd apps/web
pnpm install
NEXT_PUBLIC_LUMEN_DATA_SOURCE=sse pnpm dev    # 切到 sse 通道访问后端

# 4. 验证 SSE 协议骨架（直连后端，绕过前端）
curl -X POST http://localhost:8000/api/research/start \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"demo-001"}'
curl -N http://localhost:8000/api/research/demo-001/stream

# 5. 浏览器访问前端验证 mock 通道渲染
#    http://localhost:3000/             — P1 输入页
#    http://localhost:3000/research/demo-001         — P2 进度页
#    http://localhost:3000/research/demo-001/report  — P3 报告页
```

> ⚠ **`--workers 1` 是硬约束**（ADR-0001 D5）：单 worker 下 ChromaDB embedded + SQLite 才能避免并发写入争用；M1.0 demo 单用户场景不受影响。

### M1.0 限制

- **P1 输入框不接 API**：M1.0 P1 页面的 "开始研究" 按钮目前是 mock-only，不会触发 `POST /api/research/start`。要验证 SSE 协议端到端，请用上面 step 4 的 `curl` 命令直连后端；M1.A 会把 P1 与后端串起来。
- **`activeNode` 等派生字段在 SSE 通道仅有占位语义**：M1.0 backend 目前只 emit 4 个事件的固定序列（LangGraphStub），不发送节点位置 / 引用元数据 / 冲突结构化数据。前端在 SSE 模式下用 React Flow auto-layout 兜底，citations 默认为空。这些都是 M1.A backend 真接入后才补全。
- **三个 hook 各开一个 SSE 连接**：`useResearchData` / `useReportData` / `useKbData` 在 SSE 模式下分别 open 一个 `EventSource`，同时连同一个端点。M1.0 单用户 demo 没问题；M1.A 加 connection-multiplex 层。
- **Last-Event-ID 续传由浏览器自动填充**：第一次连接后浏览器会在断线重连时自动带上最近收到的 `id:` 行；客户端层面无需手动传递（除非在 `createSseClient` 构造时显式覆盖 `lastEventId`）。

---

## Demo Runbook (M1.A)

M1.A 真实 LangGraph 接入验证流程。后端由 LangGraphStub 切换为三节点真实图（planner → researcher → writer），前端 P1 输入框完成与 API 的串联。

> ⚠ **首次运行 M1.A 前必须删除旧 DB**：M1.A schema 相比 M1.0 已演化，直接复用旧文件会导致迁移错误。

```bash
# 0. 删除旧 DB（schema 已演化，必须重建）
rm -f apps/api/lumen.db

# 1. 注入密钥（1Password CLI）；.env.tpl 新增了 DASHSCOPE_BASE_URL + LLM_MODEL
op inject -i .env.tpl -o apps/api/.env

# 2. 同步依赖（M1.A 新增 langgraph、langchain-openai 等）
cd apps/api
uv sync

# 3. 启动后端
uv run uvicorn main:app --reload --workers 1 --port 8000

# 4. 前端（另一个终端）
cd apps/web
pnpm install
NEXT_PUBLIC_LUMEN_DATA_SOURCE=sse pnpm dev    # 切到 SSE 通道

# 5. 验证 M1.A SSE 协议（真实 LangGraph，直连后端）
#    普通请求：
curl -X POST http://localhost:8000/api/research/start \
  -H 'Content-Type: application/json' \
  -d '{"query":"什么是量子计算？"}'
# 返回 {"session_id":"<id>"}，用该 id 监听流：
curl -N http://localhost:8000/api/research/<session_id>/stream

# 6. 浏览器访问前端（P1 输入框已串联后端）
#    http://localhost:3000/    — 在 P1 输入框输入问题并点击"开始研究"
```

> ⚠ **`--workers 1` 是硬约束**（ADR-0001 D5）：ChromaDB embedded + SQLite 在多 worker 下出现并发写争用；M1.A demo 单用户场景不受影响。

### TESTING_MODE / TESTING_TOKEN 安全说明

`LUMEN_TESTING_MODE` 和 `LUMEN_TESTING_TOKEN` 是**测试 backdoor**，**生产环境严禁开启**：

- 两个变量**不在** `.env.tpl` 中，防止误配置到生产。
- 仅 Playwright e2e webServer 内部通过环境变量注入，外部永远关闭。
- `__inject_close_after:N__` / `__inject_error__` 前缀是测试专用 query prefix，需配合 `X-Lumen-Test-Token` header 和双重 guard（TESTING_MODE=true + token 匹配）才能激活；单独发送前缀在生产环境完全无效（被当普通 query 处理）。

### M1.A 配置说明

`.env.tpl` 相比 M1.0 新增两项必填变量：

| 变量 | 说明 | 示例 |
|---|---|---|
| `DASHSCOPE_BASE_URL` | DashScope OpenAI-compatible endpoint | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `LLM_MODEL` | 使用的大模型标识符 | `qwen-max` |

### Demo Day

Demo Day 现场使用 replay 兜底路径，避免 qwen-max 真跑慢/挂时无救援机制（SSE-2 断线重连只救连接中断，不救 LLM hang）。

**发布前（Demo Day-1）**：

```bash
# 用真实 DashScope 跑一次，输出落入 apps/api/data/demo_session.json
DASHSCOPE_API_KEY=op://... DASHSCOPE_BASE_URL=op://... LLM_MODEL=qwen-max \
uv run python scripts/prerender_demo_session.py --query "AI 在医疗领域的应用前景"
```

生成的 fixture 入 git（已通过 .gitignore `!apps/api/data/demo_session.json` 例外放行），与代码一起部署。

**Demo 现场**：

访问 `https://demo.lumen.app/research/demo`：

1. Next.js Server Component 调 `GET /api/research/demo-session-id` 拿到 fixture session_id
2. 服务端 307 redirect 到 `/research/{id}`
3. P2 进度页挂载 SSE 通道，URL 命中后端 demo session_id
4. 三层 guard 校验：浏览器自动附 `Origin: https://demo.lumen.app` 命中 `DEMO_ALLOWED_ORIGINS` allowlist → 放行
5. 后端 0.1s 间隔逐帧 yield fixture events，前端 reducer 正常累积渲染

**安全约束**：

- `DEMO_ALLOWED_ORIGINS`（默认 `["https://demo.lumen.app"]`）/ `DEMO_REPLAY_TOKEN`（默认 None）/ `TESTING_MODE`（默认 False，须配合 `TESTING_TOKEN`）三层 guard 任一通过即放行；缺所有 → 403 Forbidden
- 生产严禁开启 `TESTING_MODE`；该字段仅 e2e webServer / dev convenience 使用
- 非 Demo Day 部署可设 `DEMO_ALLOWED_ORIGINS='[]'` 通过 env 关闭 origin 通道

### Release Checklist

发布前必跑（本地）：

```bash
# 1. 默认 CI 测试（FakeListChatModel，3-5s）
cd apps/api && uv run pytest

# 2. 真实 DashScope smoke（≤10 分钟，需 op inject 真实 key）
cd apps/api && uv run pytest -m release_smoke
```

`release_smoke` 标记的测试在 CI 默认 `addopts` 中通过 `-m 'not release_smoke'` 排除，不会消耗 DashScope 配额。
本地 release 前必须显式运行验证 `init_chat_model` / `StateGraph.compile()` / `astream_events(version="v2")` 真实路径。

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
