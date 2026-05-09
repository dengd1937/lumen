# 实现计划：Lumen M1.A — LLM 实接（LangGraph + DashScope + 前端路由）

> **修订记录**：
> - v1（2026-05-08）：基于 ADR-0003 v1 产出，13 任务（T0-T12）
> - v2（2026-05-09 早）：经 Codex 一轮反审，处理 2 CRITICAL + 6 HIGH + 2 MEDIUM。新增 T7B / T_SMOKE / T13。
> - v2.1（2026-05-09 晚）：经 Codex 二轮反审 N1-N5。N1 D10 论据精确化；N2 T7B 列出现有断言重写；N3 T1 加 TESTING_TOKEN：SecretStr；N4 prefix guard 上移到 router 层（service 接 inject_directive）；N5 demo fixture 移出 tests/ + 三层 guard。N6/N7 推迟。
> - v2.2（2026-05-09 晚-2）：经 Codex 三轮反审 NN1-NN4。NN1 inject_directive 接口贯穿 T4/T6/T_SMOKE（Protocol/Stub/Service/SessionManager 都加 inject_directive=None 参数）；NN2 _parse_inject_directive 返回 (directive, clean_query) 元组，router 用 clean_query 入 DB 和传 service，避免 query 字段被 prefix 字面量污染。NN3 + NN4 推迟。
> - **v2.3（2026-05-09 晚-3）：经 Codex 四轮反审 NNN1-NNN4。NNN4 SessionManager `_run(session_id, query, *, inject_directive)` 直接参数传递（不用实例字段），避免 asyncio 多 task 交错时 directive 串台；补 NN2 strip 测试覆盖（`__inject_error__` + malformed prefix）；NNN3 regex 限制 N=1-100；同步孤立签名（概述 + 架构表）+ 验收标准。NNN3 (MEDIUM) 已修；NN3/NN4/N6/N7 接受为 execution 期 backlog。** v2.3 修订完成后**直接进 T0**（用户决策：不再走五轮 Codex）。

## 执行方式

本计划通过 `/task-driven-development` skill 执行。禁止直接按文本逐步实现。以下任务描述是 skill 的输入规格，不是直接执行指令。

**铁律（执行时强制）**：
- 铁律 1：每个任务独立走 RED→GREEN→IMPROVE，禁止跨任务合并审查
- 铁律 2：降级必须用户明确批准，模型不可自判
- 铁律 3：没有通过审查的代码不允许 commit

## 概述

M1.A 以 ADR-0003 v2 的四项主决策（D10–D13）+ 四项二级决策（SDec-1~4）+ v2 新增的两项决策（D-HB heartbeat id / D13.5 client_request_id / D-TM TESTING_MODE 双 guard）为输入约束，将 M1.0 的 `LangGraphStub` 替换为真实 LangGraph 三节点图（planner→researcher→writer），接入 DashScope qwen-max via OpenAI-compatible endpoint，完成前端 P1 输入框 → POST /research/start → P2 路由 → SSE 流的完整链路，封住 SSE-2 / SSE-3 两个 SKIP，并落实 Demo Day-1 预跑兜底（ADR-0001 D6 L3）。

整个过程不破坏现有 M1.0 SSE e2e 双跑（3 项已实现：SSE-1 / SSE-4 / SSE-5），`LangGraphService` 接口（v2：通过 `LangGraphProtocol` 类型注解约束）与 `LangGraphStub` 同质（v2.2 NN1 接口贯穿：`astream_events(session_id, query, *, inject_directive: InjectDirective | None = None)`）。M1.A 完成后后端保留 `LangGraphStub` 供测试注入，生产路径走 `LangGraphService`。

T0 是强制前置 spike（R-M1A-1，v2 扩为三节点 + 全 event 类型 fixture），需用户审批 StreamEvent→AnyEvent 映射表后才能进入 T1+。T7B（heartbeat id 修复）必须在 T11（SSE-2 e2e）前完成，否则 SSE-2 e2e 必失败（M1.0 遗留 bug 经 Codex 反审发现）。

## 需求

来自 ADR-0003 v2 的可验收需求清单：

- **D10**：自建 StateGraph 三节点图（planner→researcher→writer），`LangGraphService.astream_events(session_id, query, *, inject_directive: InjectDirective | None = None)` 接口与 `LangGraphStub` 同质（v2.2 NN1 接口贯穿）；论据基于 git 无 fork 痕迹的现状（v2 修订）
- **D10.1**：节点→SSE 事件映射：planner 完成→`PlanCreatedEvent`；researcher 每个子任务→`NodeStartedEvent`/`NodeProgressEvent`/`NodeCompletedEvent`；writer 流式 token→`ReportChunkEvent`；图终态→`DoneEvent`；任意节点异常→`ErrorEvent`
- **D11**：`LangGraphService(model: BaseChatModel)` 构造时注入 model；`from_settings(settings)` 工厂用 `init_chat_model` + DashScope endpoint；测试时注入 `FakeListChatModel`
- **D12**：任意 LLM 异常→`ErrorEvent` + close stream；每次 LLM 调用 `asyncio.timeout(120)` 包裹
- **D12.4（v2 新增）**：`SessionManager._run()` 必须感知 `ev.type == "error"` 显式置 `terminal_status="failed"`，避免 audit_log 与 session 表数据不一致
- **D13**：`StartSessionBody` 含 `query: str (1-2000)` + 可选 `client_request_id`；后端 ULID 生成 session_id；前端 P1 onSubmit 等响应后路由到 `/research/[session_id]`
- **D13.5（v2 新增）**：`client_request_id` 短窗口（60s）幂等去重，避免网络重试/双击/响应丢失导致孤儿 session
- **D-HB（v2 新增）**：heartbeat 帧不发 `id:` 行，避免污染 EventSource.lastEventId
- **SDec-1**：依赖核实（当前 `langgraph>=1.1.8` 远超 ADR 写的 `>=0.3,<0.4`，T1 核实兼容性，不强制降版）
- **SDec-2（v2 修订）**：M1.A 开始即拆 `services/graph/` 子包（不再尝试单文件）
- **SDec-3**：`lumen_research_sessions` 加 `query TEXT NOT NULL DEFAULT ''` 列；`create_session(conn, *, session_id, query)` 不给默认值（v2 修订）
- **SDec-4**：`LangGraphService` 单例；通过 `LangGraphProtocol` 类型注解 + 测试 fixture 替换整个 `app.state.session_manager`（v2 修订）
- **SSE-2 / SSE-3 e2e 封住**：两个 `test.skip` 改为实装；前置依赖 T7B heartbeat 修复
- **TESTING_MODE guard**：query prefix 测试 backdoor 仅在 `settings.TESTING_MODE=True` + request header `X-Lumen-Test-Token` 双 guard 下生效
- **Demo Day 兜底**：T13 落实固定 demo query 预跑 + replay_session 入口

## 实现前置（Spike T0 + T10 输出 — 执行后由用户审批）

> 本节在 T0 / T10 spike 执行完成后填充。spike 执行前此处为占位。

### StreamEvent → AnyEvent 映射表（T0 v2 产出 — 三节点 fixture，2026-05-09 执行）

**Spike 模式**：fake-list-chat-model（无 DASHSCOPE_API_KEY，按 T0 失败矩阵 fallback-2 路径）；fixture 文件 `apps/api/tests/fixtures/streamevent_samples.json` 含 174 个 StreamEvent 样本，覆盖 15 种 (event, name) 唯一组合。

**LangGraph 1.1.8 `astream_events(version="v2")` 输出结构**：
- 每个 StreamEvent 是 dict，关键字段：`event` / `name` / `run_id` / `tags` / `data` / `metadata`
- 三层 chain 事件：图级（`name="LangGraph"`）/ 节点级（`name="planner"` / `"researcher"` / `"writer"`）/ LLM 级（`name=` 模型类名，如 `FakeListChatModel`，真 DashScope 时为 `ChatOpenAI` 或类似）
- 节点级事件的 `metadata.langgraph_node` 字段也指节点名（与 `name` 字段冗余但更稳定，routing 层优先用 metadata）

**Routing 映射规则**（→ lumen AnyEvent）：

| StreamEvent.event | 判别条件 | data 字段 | yield 的 lumen 事件 |
|---|---|---|---|
| `on_chain_end` | `metadata.langgraph_node == "planner"` | `data.output.plan` (list[str]) | `PlanCreatedEvent(nodes=parse_plan(data.output.plan))` |
| `on_chain_start` | `metadata.langgraph_node == "researcher"`（或多 researcher 时的子任务节点） | `data.input.query` | `NodeStartedEvent(node_id=run_id, track="web")` |
| `on_chain_end` | `metadata.langgraph_node == "researcher"` | `data.output.summary` | `NodeCompletedEvent(node_id=run_id, sources=parse_sources(summary))` |
| `on_chat_model_stream` | `metadata.langgraph_node == "writer"` | `data.chunk.content` (token) | `ReportChunkEvent(content=chunk.content)` |
| `on_chain_end` | `name == "LangGraph"`（图终态） | `data.output` (final state) | `DoneEvent(report_id=...)` |
| 任意层异常（外层 try/except） | — | exception message | `ErrorEvent(message=str(e))` |

**不映射的 StreamEvent**（routing 层返回 None，过滤掉）：
- `on_chain_start` / `on_chain_stream` / `on_chain_end` 图级（`name="LangGraph"` 的 start/stream，避免与节点事件重复）
- `on_chat_model_start` / `on_chat_model_end`（LLM 调用细节，前端不需要）
- `on_chain_start` / `on_chain_stream` 节点级（避免与 on_chain_end 内容重复）
- `on_chain_start` / `on_chain_end` 节点级（针对 planner / writer，因为 planner 已用 on_chain_end yield PlanCreated；writer 已用 on_chat_model_stream yield ReportChunk）

**节点命名约定**：图中节点名为 `planner` / `researcher` / `writer`（**全小写，下划线分隔**）。LangGraph 自动把 `graph.add_node("planner", planner_node)` 的第一个参数作为 `name` 字段值。M1.A 实装时（T5）必须沿用这一命名。

**重要 caveat（fake mode 限制）**：
- FakeListChatModel 的 `astream` 行为是**逐字符 chunk**（174 events 中很多 on_chat_model_stream 是单字符 chunk）；真 DashScope 可能一次 chunk 返回多字符或整段。Routing 规则不变，但 T5 实装时需要决策是否在 service 层做 token 聚合（如每 N 字符或每 N ms 合并一个 ReportChunkEvent）。
- writer 节点的 LLM 调用真 DashScope 用 `model.astream(...)`（已在 spike 实现），返回 `AIMessageChunk` 对象；其 `.content` 属性是该 chunk 的字符串内容。
- T_SMOKE 任务（M1.A 后期）必须用真 DashScope 跑同等流程，验证 token chunk 行为符合预期。

**Fixture 文件**：`apps/api/tests/fixtures/streamevent_samples.json`（保留，T5 routing 单测消费）。

**T0 审批门控**：用户确认上述映射表后，T1 方可开始。FakeMode caveat 已记录在本节，T_SMOKE 时复核。

### T0 失败矩阵（v2 新增 — 经 Codex HIGH #5）

| 失败类型 | 检测信号 | 是否阻塞 M1.A | 允许的降级 / Scope Cut |
|---|---|---|---|
| LangGraph 1.x astream_events 与 ADR-0003 SDec-1 描述不符 | spike 脚本 ImportError 或 API 签名不匹配 | 否（M1.A 阻塞但 plan 不死） | 降级到 langchain-core 0.3.x：`uv add "langchain-core>=0.3,<0.4" "langgraph>=0.3,<0.4"`；T1 同步更新 SDec-1 |
| DashScope 真实调用失败（key 不可用 / 限速 / 网络） | spike 输出包含 4xx/5xx HTTP error | 否 | 改用 FakeListChatModel 跑 spike，标注「mapping 仅基于 mock，需在 T_SMOKE 任务真实验证」 |
| writer streaming token chunk 不暴露 | StreamEvent 中无 `on_chat_model_stream` | 是（D10.1 ReportChunkEvent 契约依赖此） | 用户批准降级：writer 节点改为一次性 `model.ainvoke()` 返回完整 markdown，writer 完成后 yield **单个** ReportChunkEvent（损失流式渲染体验，但 SSE 协议契约保持） |
| LangChain StreamEvent dict 字段不稳定（不同节点 name/tag 不一致） | spike 输出 name 字段为 None 或 random suffix | 是（routing 层无法实现） | 用户批准回退到 D10 fork open_deep_research（重新评估 D10 决策） |

### R-M1A-3 spike 结论（T10 产出）

> T10 执行后填入：Playwright `page.route('/api/research/*/stream', route => route.abort())` 是否能稳定中断 streaming 中的 SSE 响应并触发 EventSource `error` 事件。
>
> 结论决定 T11 实现路径：路径 A（Playwright route 拦截）或 路径 B（后端 per-session prefix 注入提前关闭，需 TESTING_MODE guard）。

### T10 失败矩阵（v2 新增 — 经 Codex HIGH #5）

| 失败类型 | 检测信号 | 是否阻塞 M1.A | 允许的降级 / Scope Cut |
|---|---|---|---|
| Playwright `route.abort()` 不触发 EventSource error | spike spec 跑过但 onerror 事件未触发 | 否 | 改用路径 B（后端 prefix 注入） |
| 后端 prefix 注入也不可用（如 TESTING_MODE 配置复杂） | T11 实装路径 B 仍跑红 | 否 | SSE-2 e2e 维持 SKIP，但要求 T13 单测覆盖 idle reconnect（M1.0 已有 sse-client.spec.ts RED 5 fake-timer）作为唯一覆盖证据 + README runbook 标注 SSE-2 e2e 缺口 |
| 路径 A 和路径 B 都不可用，且 SSE-2 单测覆盖也不可信 | T11 三路径全红 | 是 | 用户批准 SSE-2 e2e 不在 M1.A 验收（M1.A 验收 SSE 双跑 4/5 + 1 项 SKIP 文档化） |

**T10 审批门控**：用户确认实现路径（路径 A / 路径 B / 维持 SKIP）后，T11 方可开始。

## 架构变更

| 变更 | 文件 | ADR 决策 |
|---|---|---|
| 依赖版本约束更新 | `apps/api/pyproject.toml` | SDec-1 |
| Settings 新增 6 个字段（含 TESTING_MODE/TOKEN + DEMO 字段，v2.1） | `apps/api/app/core/config.py` | D11, SDec-4, D-TM (v2.1), N5 |
| DB schema 加 query 列 | `apps/api/app/db/sqlite.py` | SDec-3 |
| `create_session` 签名扩展（无默认 query） | `apps/api/app/db/sqlite.py` | SDec-3 (v2) |
| `StartSessionBody` 破坏性重构 + client_request_id | `apps/api/app/routers/research.py` | D13, D13.5 |
| `SessionManager.start_session(session_id, query)` + 终态契约 | `apps/api/app/services/session_manager.py` | D13, D12.4 (v2) |
| `LangGraphProtocol` 接口定义 | `apps/api/app/services/langgraph_protocol.py`（新建） | SDec-4 (v2) |
| `LangGraphService` 替换 `LangGraphStub`（拆 services/graph/ 子包；签名含 inject_directive v2.2） | `apps/api/app/services/graph/{__init__,planner,researcher,writer,routing,state}.py` | D10, D11, D12, SDec-2 (v2), NN1 (v2.2) |
| Heartbeat id 修复 | `apps/api/app/core/sse.py` | D-HB (v2 新增) |
| TESTING_MODE/TOKEN 双 guard（router 层 v2.1 — N4） | `apps/api/app/routers/research.py`（_is_test_request + _parse_inject_directive） | D-TM (v2.1), N4 |
| InjectDirective 类型 + service 接口扩展（v2.1 — N4） | `apps/api/app/services/inject_directive.py`（新建）+ `langgraph_protocol.py` + `langgraph_service.py` | D-TM (v2.1), N4 |
| lifespan 挂载 `LangGraphService` 单例 | `apps/api/main.py` | SDec-4 |
| P1 onSubmit 接 API + router.push + client_request_id | `apps/web/src/components/research/research-input-hero.tsx` | D13, D13.5 |
| SSE-2 / SSE-3 e2e 实装 | `apps/web/e2e/sse-protocol.spec.ts` | D10.1, D12 |
| Demo 预跑脚本（保留） | `scripts/prerender_demo_session.py` | T13 (v2) |
| Demo session fixture（v2.1 — N5：移出 tests/） | `apps/api/data/demo_session.json`（新建，入 git） | T13 (v2.1), N5 |
| Demo replay 安全 guard（v2.1 — N5） | `apps/api/app/routers/research.py`（_is_demo_request_authorized） | T13 (v2.1), N5 |
| Demo URL 路由 | `apps/web/src/app/research/demo/page.tsx`（新建） | T13 (v2) |
| Release-time smoke | `apps/api/tests/test_release_smoke.py`（新建，pytest mark） | T_SMOKE (v2) |
| README M1.A runbook 新增 | `README.md` | SDec-3, Demo, T13 |

**ADR 修订追加**（M1.A retro 时）：
- ADR-0001 D5：`lumen_research_sessions` 加 `query TEXT NOT NULL DEFAULT ''`（schema 演化第 1 次）
- ADR-0002 D8.4：`POST /research/start` body schema 变更（移除 session_id，加 query + 可选 client_request_id）
- ADR-0002 D8.5：heartbeat 帧不发 `id:` 行（v2 新增 — 修订 ADR-0002）

## 环境前置（Environment Prerequisites）

- **langgraph + langchain-core + langchain-openai**（SDec-1）
  - 验证：`cd apps/api && uv run python -c "import langgraph, langchain_core, langchain_openai; print('ok')"`
  - 修复：现有版本（`langgraph>=1.1.8` + `langchain-openai>=1.1.14`）若兼容则保留；若 T0 spike 暴露不兼容，按 T0 失败矩阵降级到 0.3.x

- **DASHSCOPE_API_KEY**（D11）
  - 验证：`grep -q DASHSCOPE_API_KEY .env.local && echo ok`
  - 修复：`op inject -i .env.tpl -o .env.local`

- **DASHSCOPE_BASE_URL**（D11，新增到 Settings）
  - 验证：`grep -q DASHSCOPE_BASE_URL .env.local && echo ok`
  - 修复：手动写入 `.env.local`（值：`https://dashscope.aliyuncs.com/compatible-mode/v1`）

- **LLM_MODEL**（D11，可选，默认 qwen-max）
  - 验证：`grep -q LLM_MODEL .env.local && echo ok || echo "will use qwen-max default"`
  - 修复：写入 `.env.local`（值：`qwen-max`）

- **TESTING_MODE**（v2 新增 — TESTING_MODE guard）
  - 验证：生产环境必须 `TESTING_MODE=false` 或不设；e2e webServer 环境设 `TESTING_MODE=true`
  - 修复：`.env.local` 不写此字段；e2e config (`playwright.config.ts`) 在 webServer env 中设置

- **pytest**（回归测试）
  - 验证：`cd apps/api && uv run pytest --version`
  - 修复：`cd apps/api && uv sync --group dev`

- **DB schema 迁移**（SDec-3，开发环境）
  - 验证：`sqlite3 apps/api/data/lumen.db ".schema lumen_research_sessions" | grep -q query && echo ok`
  - 修复：删除旧 DB 文件（`rm apps/api/data/lumen.db`），重启后端自动 init_db 建新表

## 任务依赖图

```
T0（R-M1A-1 spike v2: 三节点 fixture + 失败矩阵 + 用户审批）
│
├─ T1（SDec-1: 依赖版本核实 + Settings 扩展 4 字段含 TESTING_MODE）
│   └─ T2（SDec-3: DB schema 加 query 列 + create_session 签名 v2 无默认）
│       └─ T3（D13+D13.5: StartSessionBody + client_request_id 幂等 + SessionManager 签名）
│           └─ T4（D10+D11: LangGraphService 骨架 + LangGraphProtocol + from_settings + model 注入）
│               └─ T5（D10.1+SDec-2 v2: services/graph/ 子包 + 三节点 + routing fixture）
│                   └─ T6（D12+D12.4 v2: ErrorEvent 路径 + asyncio.timeout + SessionManager 终态契约）
│                       └─ T7（SDec-4: lifespan 挂载 LangGraphService 单例 + LangGraphProtocol 注解）
│                           └─ T7B（D-HB v2 新增: heartbeat 不发 id 行）   ← 必须在 T11 之前
│                               ├─ T8（D13+D13.5 前端: ResearchInputHero onSubmit + client_request_id）
│                               │   └─ T9（D13 前端: router.push + e2e POST body 更新）
│                               ├─ T10（R-M1A-3 spike v2: Playwright SSE route 拦截 + 失败矩阵）
│                               │   └─ T11（SSE-2 e2e + TESTING_MODE guard）
│                               └─ T12（SSE-3 e2e + TESTING_MODE guard）
│
├─ T_SMOKE（v2 新增: release-time 真实 LLM smoke，独立 pytest mark）   ← 依赖 T7
│
└─ T13（v2 新增: Demo 预跑 + replay_session + demo URL）   ← 依赖 T_SMOKE
```

**串行约束说明**：
- T0→T1：映射表用户审批前不能开始依赖实装
- T1→T2→T3：Settings → DB schema → API body 自上而下
- T3→T4→T5→T6→T7→**T7B**→T8/T10/T12：T7B 是 T11 SSE-2 e2e 的硬前置（heartbeat id 修复必须在 SSE-2 实装前完成，否则 SSE-2 必失败）
- T8→T9：onSubmit POST 逻辑先，路由跳转后
- T10→T11：SSE-2 spike 结论决定实现路径（A/B/SKIP）
- T_SMOKE→T13：Demo 预跑前必须有 release smoke 验证

**可并行机会**：
- T8+T10+T12+T_SMOKE 可在 T7B 完成后并行启动（互不依赖）
- T9+T11 各依赖上游单任务，可在上游完成后独立展开
- T13 可在 T_SMOKE 完成后独立启动

## 实现步骤

---

### 阶段 1：Spike + 环境（T0–T1）

---

### 任务 T0：R-M1A-1 Spike v2 — LangGraph StreamEvent → AnyEvent 三节点映射验证

**文件：** 临时 `scripts/spike_langgraph_streamevents.py`（执行后立即删除）；保留 `apps/api/tests/fixtures/streamevent_samples.json`（spike 产出的 fixture）

**任务性质**：此任务不走 TDD，产出物是文档（映射表）+ fixture，不是生产代码。执行后立即删除脚本，将映射规则填充到本 plan「实现前置」章节的映射表 + fixture 文件，等待用户审批后才能进入 T1。

**RED 阶段（spike 前提）**：
- 当前 `LangGraphStub.astream_events(session_id)` 签名未含 `query`
- LangGraph `graph.astream_events()` 输出的 `StreamEvent` dict 结构未经验证（R-M1A-1）
- v1 plan 仅要求单节点 spike，Codex HIGH #4 指出不足以覆盖 routing 层（必须三节点 + 全 event 类型）

**Spike 执行要点（v2 扩展，≤6 条）**：
1. 构建**三节点最小** `StateGraph`：`planner → researcher → writer`；每节点内调用 `model.ainvoke([HumanMessage(content=...)])` 或 `model.astream(...)`（writer 用 streaming）
2. 用真实 DashScope `init_chat_model(model="qwen-max", model_provider="openai", base_url=..., api_key=...)` 构建 model；若 DashScope 调用失败按 T0 失败矩阵降级
3. 调用 `graph.astream_events({"query": "spike-query"}, config={"configurable": {"thread_id": "spike-001"}}, version="v2")`，逐事件打印 `event` / `name` / `run_id` / `data.keys()` / `tags`
4. 重点验证 6 个事件类型样本：`on_chain_end`(planner) / `on_chain_start`(researcher) / `on_chain_end`(researcher) / `on_chat_model_stream`(writer) / `on_chat_model_end`(writer) / `on_chain_end`(graph)
5. 把每个事件类型的真实 dict 序列化为 fixture：`apps/api/tests/fixtures/streamevent_samples.json`，T5 routing 单测必须消费此 fixture（不允许手写 mock dict）
6. 把映射规则填入本 plan「实现前置」的映射表，格式：`event["event"]` + `event["name"]` → `yield LumenEvent`

**IMPROVE 阶段（用户审批）**：
- 用户审批映射表 + fixture 后，T1 方可开始
- 若 spike 触发 T0 失败矩阵任一行，按矩阵指引 escalate（停机 / 降级 / 用户批准 scope cut）
- 若 `astream_events` API 在当前已安装版本（`langgraph>=1.1.8`）中签名有变，T1 首先更新 SDec-1 依赖范围记录

**依赖**：无（M1.A 第一个任务）

**Codex / 风险编号**：R-M1A-1（HIGH 缓解门控）；Codex HIGH #4（v1 单节点不足）；Codex HIGH #5（失败矩阵）

**审查要求**：用户审批映射表 + fixture（非代码审查，人工 approve）

---

### 任务 T1：SDec-1 + Settings 扩展（依赖版本核实 + 新 env 字段含 TESTING_MODE）

**文件：** 修改 `apps/api/app/core/config.py`；修改 `apps/api/pyproject.toml`（如需要）；修改 `apps/api/tests/test_config.py`

**RED 阶段**：
- `test_settings_missing_dashscope_base_url_raises`：未设 `DASHSCOPE_BASE_URL` 时 `Settings()` 抛 ValidationError
- `test_settings_missing_llm_model_uses_default`：未设 `LLM_MODEL` 时 Settings 实例化成功，`settings.LLM_MODEL == "qwen-max"`
- `test_settings_dashscope_api_key_is_secret_str`：`SecretStr` `repr()` 不暴露原始值
- `test_settings_testing_mode_default_false`（v2）：未设 `TESTING_MODE` 时 `settings.TESTING_MODE is False`
- `test_settings_testing_mode_true`：`TESTING_MODE=true` env 时 `settings.TESTING_MODE is True`
- **`test_settings_testing_token_default_none`（v2.1 — N3）**：未设 `TESTING_TOKEN` 时 `settings.TESTING_TOKEN is None`
- **`test_settings_testing_token_is_secret_str`（v2.1）**：设 `TESTING_TOKEN=e2e-secret` 时 `settings.TESTING_TOKEN` 是 `SecretStr`，`repr()` 不暴露
- `test_pyproject_langgraph_dependency_present`：解析 `pyproject.toml` 确认 `langgraph` 依赖行存在

**GREEN 实现要点（≤5 条）**：
1. `Settings` 新增字段：
   - `DASHSCOPE_BASE_URL: str`（必填）
   - `LLM_MODEL: str = "qwen-max"`（可选默认）
   - `TESTING_MODE: bool = False`（v2）
   - **`TESTING_TOKEN: SecretStr | None = None`（v2.1 — N3 修复，与 TESTING_MODE 协同构成双 guard）**
2. `Settings` 保留 `DASHSCOPE_API_KEY: SecretStr`、`LUMEN_DB_PATH: str`
3. 当前 `pyproject.toml` 已有 `langgraph>=1.1.8`；T0 spike 已验证兼容性，T1 不强制降版；ADR-0003 SDec-1 修订记录标注「实际 1.x，spike 验证通过」
4. 更新 `conftest.py` 的 `env_settings` fixture：加 `DASHSCOPE_BASE_URL` + `TESTING_MODE: True` + `TESTING_TOKEN: "test-token-fixture"`（测试默认开启双 guard）
5. **`.env.tpl` 严禁** 写 `TESTING_MODE` 和 `TESTING_TOKEN`（生产环境双 guard 必须缺失即 fail-closed；仅 e2e webServer 通过 `playwright.config.ts` env 设置）

**IMPROVE 审查关注点（≤3 条）**：
- `DASHSCOPE_BASE_URL` 缺失抛 ValidationError（不静默默认）
- `SecretStr` repr 遮盖（`DASHSCOPE_API_KEY` + `TESTING_TOKEN` 都覆盖）
- `TESTING_MODE` + `TESTING_TOKEN` 双字段协同：任一缺失即 guard 关闭

**依赖**：T0 用户审批

**Codex / 风险编号**：SDec-1；TESTING_MODE/TOKEN 双 guard 基础（D-TM v2.1）；Codex 二轮 N3 修复

**审查要求**：python-reviewer + security-reviewer

---

### 阶段 2：数据模型扩展（T2）

---

### 任务 T2：SDec-3 v2 — DB schema 加 query 列 + create_session 签名（无默认值）

**文件：** 修改 `apps/api/app/db/sqlite.py`；修改 `apps/api/tests/test_db_sqlite.py`

**RED 阶段**：
- `test_create_session_with_query_stores_query`：`create_session(conn, session_id="s1", query="AI 趋势分析")` 后查到 `query="AI 趋势分析"`
- `test_create_session_requires_query_keyword_arg`（v2 新增）：`create_session(conn, "s1")` → TypeError（query 必传）；`create_session(conn, "s1", "test")` → TypeError（强制关键字参数）
- `test_init_db_creates_query_column`：`init_db()` 后 `PRAGMA table_info` 含 `query` 列
- `test_create_session_query_too_long_no_db_truncation`（边界）：query 超 2000 字符 DB 层接受（截断由上层 Pydantic）

**GREEN 实现要点（≤4 条）**：
1. `CREATE TABLE` 加 `query TEXT NOT NULL DEFAULT ''` 列（DEFAULT '' 仅为兼容 ALTER TABLE，未来场景；M1.A 直接删表重建）
2. `create_session(conn, *, session_id: str, query: str) -> None` — **不给 query 默认值**（v2 修订，Codex MEDIUM）；强制关键字参数；调用点漏传时 Python 直接 TypeError
3. INSERT 语句改为 `INSERT INTO lumen_research_sessions (id, query) VALUES (?, ?)`
4. 更新 `test_db_sqlite.py` 中所有 `create_session` 调用补传 `query=...`（向后修补）

**IMPROVE 审查关注点（≤3 条）**：
- `query` 参数无默认值（Codex MEDIUM 修订点：避免静默 ""）
- 强制关键字参数（防止 positional 错位）
- README runbook 标注开发环境需删 `lumen.db` 重建

**依赖**：T1

**Codex / 风险编号**：SDec-3 (v2)；ADR-0001 D5 schema 演化第 1 次；Codex MEDIUM（默认值）

**审查要求**：python-reviewer

---

### 阶段 3：后端 API 形状重构（T3）

---

### 任务 T3：D13 + D13.5 — StartSessionBody 重构 + client_request_id 幂等 + SessionManager 签名

**文件：** 修改 `apps/api/app/routers/research.py`；修改 `apps/api/app/services/session_manager.py`；修改 `apps/api/tests/test_session_lifecycle.py`

**RED 阶段**：
- `test_start_session_body_query_required`：POST `{}` → 422
- `test_start_session_body_query_too_short`：POST `{"query": ""}` → 422
- `test_start_session_body_query_too_long`：POST `{"query": "x"*2001}` → 422
- `test_start_session_returns_201_with_session_id`：POST `{"query": "AI 趋势"}` → 201，响应含 ULID 格式 session_id
- `test_start_session_old_body_format_rejected`：POST `{"session_id": "old-id"}` → 422
- **`test_start_session_idempotency_returns_same_session_id_within_window`（v2 D13.5）**：同 client_request_id 60s 内两次 POST → 返回相同 session_id（第二次返回 200 OK 而非 201）
- **`test_start_session_idempotency_outside_window_creates_new_session`（v2 D13.5）**：超 60s 后 POST → 新 session_id
- **`test_start_session_no_client_request_id_creates_new_session_each_time`（v2 D13.5）**：未传 client_request_id 时每次都是新 session_id
- **`test_start_session_invalid_client_request_id_format_returns_422`**：client_request_id 格式不符（含特殊字符 / 超长）→ 422
- `test_session_manager_start_session_passes_query_to_db`：DB 中 query 列有值

**GREEN 实现要点（≤6 条）**：
1. `StartSessionBody { query: str = Field(min_length=1, max_length=2000), client_request_id: str | None = Field(default=None, max_length=64, pattern=r"^[a-zA-Z0-9_-]{1,64}$") }`
2. `start_session` 路由内：若 `client_request_id` 不为 None，先查内存 LRU dict（key: client_request_id, value: (session_id, expires_at)），命中且未过期 → 返回已有 session_id + 200 OK
3. 否则生成 `session_id = str(ULID())` → 调 `session_manager.start_session(session_id=..., query=...)` → 写入 LRU dict（60s TTL）→ 返回 201
4. `SessionManager.start_session(self, *, session_id: str, query: str)` 加 `query` 参数透传给 `create_session(conn, session_id=..., query=...)`
5. LRU 实现：用 `cachetools.TTLCache(maxsize=1024, ttl=60)`（已有依赖检查；若无则 uv add）
6. 更新 `test_session_lifecycle.py` 全部 `sm.start_session("xxx")` → `sm.start_session(session_id="xxx", query="test")`

**IMPROVE 审查关注点（≤3 条）**：
- `client_request_id` 校验严格（pattern + max_length），防 injection
- LRU TTL 不依赖外部存储（内存级足够 M1.A 单进程 workers=1）
- 200 vs 201 状态码区分（幂等命中 vs 新建）

**依赖**：T2

**Codex / 风险编号**：D13；D13.5（v2）；Codex HIGH #6（孤儿 session 缓解）；ADR-0002 D8.4 破坏性变更

**审查要求**：python-reviewer + security-reviewer

---

### 阶段 4：LangGraphService + Protocol（T4–T6）

---

### 任务 T4：D11 + LangGraphProtocol — LangGraphService 骨架 + 接口约束 + from_settings 工厂

**文件：** 新建 `apps/api/app/services/langgraph_protocol.py`；修改 `apps/api/app/services/langgraph_service.py`；新建 `apps/api/tests/test_langgraph_protocol.py`

**RED 阶段**：
- `test_langgraph_protocol_runtime_checkable`：`LangGraphProtocol` 是 `typing.Protocol` 子类，`@runtime_checkable` 装饰
- `test_langgraph_stub_satisfies_protocol`：`isinstance(LangGraphStub(...), LangGraphProtocol) is True`
- `test_langgraph_service_satisfies_protocol`：`isinstance(LangGraphService(model=..., db_path=...), LangGraphProtocol) is True`
- `test_langgraph_service_init_accepts_base_chat_model`：构造不报错
- `test_langgraph_service_from_settings_constructs_model`：monkeypatch Settings 后调 `LangGraphService.from_settings(settings)` 返回实例
- **`test_langgraph_service_astream_events_signature_v21`（v2.1 — NN1）**：`(session_id: str, query: str, *, inject_directive: InjectDirective | None = None) -> AsyncIterator[AnyEvent]`（接口扩展贯穿，不只在 T11 才出现）
- **`test_langgraph_stub_accepts_inject_directive_kwarg`（v2.1 — NN1）**：`LangGraphStub` 同步接受 `inject_directive` 关键字参数（默认 None，stub 实现可忽略）；保持 stub/service 接口同质

**GREEN 实现要点（v2.1 — NN1，≤6 条）**：
1. 新建 `apps/api/app/services/inject_directive.py`：`@dataclass(frozen=True) class InjectCloseAfterDirective: n: int` + `class InjectErrorDirective: pass` + `InjectDirective = InjectCloseAfterDirective | InjectErrorDirective`
2. 新建 `langgraph_protocol.py`：
   ```python
   @runtime_checkable
   class LangGraphProtocol(Protocol):
       async def astream_events(
           self,
           session_id: str,
           query: str,
           *,
           inject_directive: InjectDirective | None = None,
       ) -> AsyncIterator[AnyEvent]: ...
   ```
3. `LangGraphStub.astream_events(self, session_id, query, *, inject_directive=None)` — 签名扩展（v2.1 — NN1：贯穿到 stub 而非只 service）；stub 实现可忽略 `inject_directive`（保持 stub 用于不需测试 backdoor 的单测）
4. `LangGraphService.__init__(self, *, model: BaseChatModel, db_path: str)` — 存 model，调 `self._build_graph()` 占位（T5 实装）
5. `from_settings(cls, settings: Settings) -> "LangGraphService"` — `init_chat_model(model=settings.LLM_MODEL, model_provider="openai", base_url=settings.DASHSCOPE_BASE_URL, api_key=settings.DASHSCOPE_API_KEY.get_secret_value())`
6. `astream_events(self, session_id, query, *, inject_directive=None)` 骨架：T4 阶段 yield 空；T11 实装 `inject_directive` 处理逻辑（与 T5 三节点逻辑共存）

**IMPROVE 审查关注点（≤3 条）**：
- Protocol `runtime_checkable` 验证 stub + service 都满足
- `get_secret_value()` 是唯一调用点
- `from_settings` 传 `api_key` 后不在日志或 repr 中暴露

**依赖**：T3

**Codex / 风险编号**：D11；T7 LangGraphProtocol 基础；Codex HIGH #1 修复

**审查要求**：python-reviewer + security-reviewer

---

### 任务 T5：D10.1 + SDec-2 v2 — services/graph/ 子包 + 三节点图 + routing 消费 fixture

**文件：** 新建 `apps/api/app/services/graph/__init__.py` / `state.py` / `planner.py` / `researcher.py` / `writer.py` / `routing.py`；修改 `apps/api/app/services/langgraph_service.py`（移除内联节点逻辑，改为 import 子包）；修改 `apps/api/tests/test_langgraph_service.py`；新建 `apps/api/tests/test_graph_routing.py`

**RED 阶段**：
- `test_planner_node_yields_plan_created_event`：`LangGraphService(model=FakeListChatModel(responses=["..."]), db_path=":memory:")` 第一个事件类型 `plan_created`
- `test_researcher_node_yields_node_started_progress_completed`：序列正确
- `test_writer_node_yields_report_chunk_sequence`：流式 token → 多 ReportChunkEvent
- `test_full_cycle_ends_with_done_event`：末尾 `done`
- `test_routing_layer_consumes_streamevent_fixture`（v2 强化 — Codex HIGH #4）：从 `apps/api/tests/fixtures/streamevent_samples.json` 加载 T0 产出的 fixture，逐条调 `route_stream_event()` 验证返回正确 lumen 事件类型；不接受手写 mock dict
- `test_state_schema_has_required_fields`：`GraphState` TypedDict 含 `query` / `session_id` / `plan_nodes` / `report_chunks`

**GREEN 实现要点（≤6 条）**：
1. `services/graph/state.py`：`class GraphState(TypedDict): query: str; session_id: str; plan_nodes: list[PlanNode]; report_chunks: list[str]`
2. `services/graph/planner.py`：`async def planner_node(state: GraphState, *, model: BaseChatModel) -> dict` — 当前实装为固定 5 子任务模板（D10.3 降级路径，标注 TODO(M1.B)：LLM 定制）
3. `services/graph/researcher.py`：每个 plan_node 调一次 `await asyncio.wait_for(model.ainvoke(...), timeout=120)`（D12.3）
4. `services/graph/writer.py`：`await model.astream(...)` 流式 token；每 token chunk 累加到 `report_chunks`
5. `services/graph/routing.py`：`route_stream_event(raw: dict) -> AnyEvent | None` — 按 T0 fixture 映射规则；返回 None 表示该 StreamEvent 不映射到 lumen 事件
6. `LangGraphService._build_graph()` 用 `langgraph.StateGraph(GraphState)`，三节点串联；`astream_events` 调 `self._graph.astream_events(input, config, version="v2")`，逐事件 `route_stream_event` 过滤后 yield；末尾固定 yield `DoneEvent`

**IMPROVE 审查关注点（≤3 条）**：
- 拆包结构清晰（每文件 ≤200 行；routing.py 是核心）
- routing 单测消费 T0 fixture（Codex HIGH #4 关键缓解）
- planner 当前固定模板（D10.3 降级），代码注释标 TODO(M1.B) LLM 定制

**依赖**：T4 + T0 fixture 审批

**Codex / 风险编号**：D10；D10.1；D10.3；SDec-2 (v2)；R-M1A-1；Codex HIGH #4

**审查要求**：python-reviewer

---

### 任务 T6：D12 + D12.4 v2 — ErrorEvent 路径 + asyncio.timeout + SessionManager 终态契约

**文件：** 修改 `apps/api/app/services/langgraph_service.py`；修改 `apps/api/app/services/session_manager.py`（D12.4 终态契约）；修改 `apps/api/tests/test_langgraph_service.py`；修改 `apps/api/tests/test_session_lifecycle.py`

**RED 阶段**：
- `test_llm_exception_yields_error_event_then_stops`：FakeListChatModel 抛 RuntimeError → yield ErrorEvent → 生成器关闭
- `test_asyncio_timeout_yields_error_event`：`asyncio.timeout(0.001)` 注入 → yield ErrorEvent（message 含 timeout/超时）
- `test_error_event_carries_session_id`：ErrorEvent.session_id 等于传入值
- **`test_session_manager_error_event_marks_session_failed`（v2 D12.4 关键 — Codex CRITICAL #2）**：使用真实 `LangGraphService` 注入会失败的 FakeListChatModel；session 表 `status == "failed"`；audit_log 含 `type == "error"` 事件；两者从同一调用路径产生
- **`test_session_manager_error_event_no_exception_propagation`（v2）**：LangGraphService yield ErrorEvent 后正常 return（不抛异常）；SessionManager 仍正确置 `failed`（依赖 D12.4 显式感知 ev.type）

**GREEN 实现要点（≤6 条）**：
1. `LangGraphService.astream_events` 内层 `try` 包裹 `async for ev in self._graph.astream_events(...)` 循环
2. `except (Exception, asyncio.TimeoutError) as e` → yield `ErrorEvent(...)` → return（生成器退出，不 raise）
3. `asyncio.CancelledError` 不捕获（Python 3.12 中继承 BaseException 而非 Exception，`except Exception` 自然不抓）
4. 节点内 LLM 调用已 `asyncio.timeout(120)` 包裹（T5）；T6 是兜底层
5. **D12.4 终态契约 + NN1 接口贯穿 + NNN4 并发安全（v2.2 修订）**：修改 `session_manager._run()` 直接接 `inject_directive` 参数（**不用实例字段**，避免 asyncio 多 task 交错时字段被覆盖污染）：
   ```python
   # SessionManager.start_session(*, session_id, query, inject_directive=None) v2.1 NN1
   # 直接将 inject_directive 作为 _run() 的 task 参数传递（v2.2 NNN4：避免实例字段并发 race）
   async def start_session(
       self, *, session_id: str, query: str,
       inject_directive: InjectDirective | None = None,
   ) -> None:
       # 创建 task，inject_directive 闭包捕获到 task 局部变量
       task = asyncio.create_task(
           self._run(session_id, query, inject_directive=inject_directive),
           name=f"langgraph-{session_id}",
       )
       # task 注册 + producer lock 等保留 M1.0 既有逻辑

   async def _run(
       self, session_id: str, query: str,
       *, inject_directive: InjectDirective | None,
   ) -> None:
       async for ev in self._langgraph.astream_events(
           session_id, query, inject_directive=inject_directive,
       ):
           await append_event(conn, session_id=session_id, event=ev)
           if ev.type == "error":
               terminal_status = "failed"
               # 不 break — 让生成器自然结束，避免 cancel 半消费
   ```
   **重要**（v2.2 NNN4）：每个 `_run` task 通过参数闭包持有自己的 `inject_directive`，不通过 `self._xxx` 实例字段共享。不同 session 的 task 即使在 asyncio 单线程内交错调度，也不会互相覆盖 directive。

**RED 测试加（v2.2 NNN4）**：
- `test_session_manager_inject_directive_isolated_per_session`：并发启动两个 session（不同 inject_directive），验证各自的 _run 收到正确 directive 不串台
6. `ErrorEvent` schema 已在 `app/models/events.py`，T6 无需改 models

**IMPROVE 审查关注点（≤3 条）**：
- `CancelledError` 显式不被 `except Exception` 吞（注释说明）
- `asyncio.timeout(120)` 是节点级（每次 ainvoke 包裹）非流级
- D12.4 终态契约：DB status + audit_log error 一致性测试覆盖

**依赖**：T5

**Codex / 风险编号**：D12；D12.4 (v2)；Codex CRITICAL #2 修复；R-M1A-2

**审查要求**：python-reviewer + security-reviewer

---

### 阶段 5：Lifespan 单例挂载（T7）

---

### 任务 T7：SDec-4 v2 — lifespan 挂载 LangGraphService 单例 + LangGraphProtocol 注解 + 测试 fixture 整体替换

**文件：** 修改 `apps/api/main.py`；修改 `apps/api/app/services/session_manager.py`（_langgraph 类型注解）；修改 `apps/api/tests/test_main.py`；修改 `apps/api/tests/conftest.py`（新增 fixture）

**RED 阶段**：
- `test_lifespan_mounts_langgraph_service_on_app_state`：`app.state.langgraph_service` 类型 `LangGraphService`
- `test_session_manager_uses_langgraph_protocol`：`SessionManager._langgraph` 类型注解为 `LangGraphProtocol`（mypy 通过）
- `test_health_returns_ok_after_m1a_lifespan`：GET /health → 200（回归）
- `test_langgraph_service_not_reconstructed_per_request`：两次 POST /start 用同一引用（`id()` 相同）
- **`test_fake_session_manager_fixture_replaces_entire_app_state`（v2 — Codex HIGH #1）**：使用 `fake_session_manager` fixture 后，`app.state.session_manager` 是用 FakeListChatModel 构造的 SessionManager；POST /start 不触发真实 DashScope 调用

**GREEN 实现要点（≤6 条）**：
1. lifespan：`LangGraphStub(...)` → `LangGraphService.from_settings(settings)`（保留 `LangGraphStub` 仅供 unit test 使用）
2. **测试 fixture 整体替换策略**（v2 Codex HIGH #1 修复）：在 `conftest.py` 新增 `fake_session_manager` fixture，**替换整个 `app.state.session_manager`**（不仅是 `langgraph_service`）：
   ```python
   @pytest.fixture
   def fake_session_manager(client, monkeypatch):
       fake_lg = LangGraphService(model=FakeListChatModel(...), db_path=":memory:")
       fake_sm = SessionManager(langgraph=fake_lg, db_path=":memory:")
       monkeypatch.setattr(client.app.state, "session_manager", fake_sm)
       return fake_sm
   ```
3. `SessionManager._langgraph` 类型注解从 `LangGraphStub` 改为 `LangGraphProtocol`
4. lifespan 移除 `LUMEN_STUB_FULL_CYCLE` / `LUMEN_STUB_INJECT_ERROR` env 读取（功能由 T11/T12 query prefix + TESTING_MODE guard 替代）
5. `app.state.langgraph_service` lifespan finally 无需特殊清理（StateGraph 无长连接）
6. `env_settings` fixture 加 `DASHSCOPE_BASE_URL` mock 值（避免 from_settings crash）

**IMPROVE 审查关注点（≤3 条）**：
- **不能只替换 `app.state.langgraph_service`**（v1 错误设计；v2 修订必须替换整个 session_manager）
- LangGraphProtocol 注解使 mypy 在 SessionManager 调用 LangGraphStub 与 LangGraphService 时统一
- lifespan E2E knob（如保留）放在 `LangGraphService` 内部 + TESTING_MODE guard，而非全局 env

**依赖**：T6

**Codex / 风险编号**：SDec-4 (v2)；D11.2；Codex HIGH #1（fixture race condition 修复）

**审查要求**：python-reviewer

---

### 阶段 6：Heartbeat id 修复（T7B — v2 新增）

---

### 任务 T7B：D-HB v2 新增 — Heartbeat 帧不发 `id:` 行（M1.0 遗留 bug）

**文件：** 修改 `apps/api/app/core/sse.py`；修改 `apps/api/tests/test_sse_wire_format.py`；修改 `apps/api/tests/test_sse_replay.py`

**任务背景（Codex HIGH #2 - M1.0 隐藏 bug）**：
- 当前 `format_heartbeat()` 输出 `id: heartbeat-{server_time}\n` 行
- W3C SSE 规范：EventSource 自动维护 lastEventId 为最近 `id:` 行值
- GET /stream 对任何 Last-Event-ID 调 `lookup_seq_by_event_id`，`heartbeat-*` 不在 audit_log → 返 400
- M1.A 长 LLM 节点期间多 heartbeat → 浏览器最后收到 heartbeat → 重连携带 heartbeat id → 400 → SSE-2 e2e 必失败
- M1.0 因 SSE-2 SKIP 状态被掩盖

**RED 阶段**：
- `test_format_heartbeat_does_not_emit_id_line`（v2）：`format_heartbeat(server_time).decode()` 不含 `id: ` 前缀
- `test_format_heartbeat_emits_event_and_data_lines`：仍含 `event: heartbeat\n` + `data: {...}\n\n`
- `test_sse_stream_after_heartbeat_reconnect_uses_last_business_event_id`（v2 — 集成）：模拟流程：
  1. 启动 session → SSE 流推 1 个 plan_created → heartbeat → heartbeat
  2. 客户端断线，重连时 EventSource 自动携带 LEID = plan_created.event_id（不是 heartbeat-id）
  3. 服务端 lookup_seq_by_event_id 命中 → replay from seq + 1 → 不返 400
- `test_sse_replay_existing_test_with_heartbeat_does_not_break`：现有 SSE replay 测试用例仍全绿

**重写既有断言（v2.1 — N2 修复，Codex 二轮 N2）**：

T7B 修订 `format_heartbeat` 后，**必须重写以下既有 RED 断言**（否则旧断言从 GREEN 转 RED，会被误判为引入 bug）：

| 文件 | 行号 | 旧断言 | v2.1 重写后断言 |
|---|---|---|---|
| `apps/api/tests/test_sse_wire_format.py` | ~91-99 | 断言 `format_heartbeat(...)` 输出含 `id: heartbeat-` 前缀 | 断言**不含** `id: ` 前缀；含 `event: heartbeat` + `data: ` |
| `apps/api/tests/test_sse_wire_format.py` | （相邻） | 验证 heartbeat id 格式为 `heartbeat-<server_time>` | 删除该断言（不再有 id 行） |
| `apps/api/tests/test_sse_replay.py`（如有相关用例） | — | 任何依赖 heartbeat id 格式的断言 | 改为依赖最近**业务事件**的 event_id 作为 LEID 来源 |

**T7B 工作单**：
1. 先重写上述既有断言为新预期（断言 unit 集合属于本任务的 RED 阶段）
2. 跑 `uv run pytest apps/api/tests/test_sse_wire_format.py` 确认重写后的断言全部红
3. 修改 `format_heartbeat()` 实现移除 id 行（GREEN 阶段）
4. 重跑确认全部绿
5. IMPROVE 阶段：跑 `uv run pytest apps/api/tests/test_sse*` 全集合回归

**GREEN 实现要点（≤3 条）**：
1. `format_heartbeat()` 移除 `f"id: heartbeat-{server_time}\n"` 部分，只保留 `f"event: heartbeat\ndata: {payload_json}\n\n"`
2. `make_heartbeat()` 函数保留（产出 HeartbeatEvent 对象供其他用途，如 audit_log 假设性扩展）
3. 注释加：「W3C SSE 规范规定缺 id: 行的帧不更新 EventSource.lastEventId（参 https://html.spec.whatwg.org/multipage/server-sent-events.html）；这是 D-HB 决策的实现要点」

**IMPROVE 审查关注点（≤3 条）**：
- 移除 id 行后，`format_heartbeat` 输出仍是合法 SSE 帧（双 `\n\n` 分隔）
- 测试覆盖 reconnect 场景（M1.0 SSE-2 bug 真实场景）
- ADR-0002 D8.5 修订记录追加（M1.A retro 时同步）

**依赖**：T7

**Codex / 风险编号**：D-HB (v2 新增)；Codex HIGH #2（M1.0 遗留 bug 修复）

**审查要求**：python-reviewer

---

### 阶段 7：前端 P1 接入（T8–T9）

---

### 任务 T8：D13 + D13.5 前端 — ResearchInputHero onSubmit + client_request_id 幂等

**文件：** 修改 `apps/web/src/components/research/research-input-hero.tsx`；新建/修改 `apps/web/src/components/research/__tests__/research-input-hero.spec.tsx`

**RED 阶段**：
- `test_submit_button_disabled_when_empty`：回归
- `test_submit_calls_post_start_with_query_and_client_request_id`（v2）：mock fetch，提交后 body 含 `query` + `client_request_id`（UUID 格式）
- `test_client_request_id_stable_during_submit`（v2）：onSubmit 期间 client_request_id 不变；提交成功后 component unmount 才重置
- `test_submit_shows_spinner_during_request`：spinner 可见
- `test_submit_422_shows_error_toast`：422 响应展示错误
- `test_submit_network_error_restores_button`：fetch 抛异常后 submitting=false

**GREEN 实现要点（≤6 条）**：
1. `useEffect(() => { setClientRequestId(crypto.randomUUID()); }, [])` — component mount 时生成稳定 client_request_id
2. `onSubmit` 调 `await fetch("/api/research/start", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ query: topic.trim(), client_request_id: clientRequestId }) })`
3. 成功（201/200）→ 解析 `session_id`；失败（422/5xx）→ `setError(...)` + toast
4. `try/catch` 包裹 fetch；任意异常 → `setSubmitting(false)`
5. `<textarea maxLength={2000}>` 防护（D13.4）
6. 移除 `console.log({ topic, sources })` 调试代码

**IMPROVE 审查关注点（≤3 条）**：
- client_request_id 在 submit 期间稳定（不每次按按钮重置），完成后 unmount 自然清理
- fetch 错误处理覆盖 422 detail 字段提取展示
- `maxLength={2000}` 与后端 `Field(max_length=2000)` 对齐

**依赖**：T7B（heartbeat 修复后才能让前端连真实后端测）

**Codex / 风险编号**：D13；D13.5；R-M1A-4；Codex HIGH #6

**审查要求**：typescript-reviewer

---

### 任务 T9：D13 前端 — router.push + e2e POST body 更新

**文件：** 修改 `apps/web/src/components/research/research-input-hero.tsx`；修改 `apps/web/e2e/sse-protocol.spec.ts`

**RED 阶段**：
- `test_submit_success_navigates_to_research_page`（Playwright）：填 query → submit → URL 含 `/research/` + ULID
- `test_submit_renders_spinner_then_navigates`：spinner 可见 → 导航
- `test_sse_spec_start_session_helper_uses_query_body`：grep `sse-protocol.spec.ts` 确认 `data: { query: ..., client_request_id: ... }`

**GREEN 实现要点（≤5 条）**：
1. `onSubmit` 成功后 `router.push(\`/research/${sessionId}\`)`（`useRouter` from `next/navigation`）
2. 更新 `sse-protocol.spec.ts` `startSession()` 辅助：`data: { query: "M1.A 测试查询", client_request_id: "test-" + Math.random().toString(36).slice(2) }`
3. 所有 `startSession()` 调用点改为从响应解析 session_id：`const { session_id } = await r.json()`
4. SSE-1/4/5 三个已实装 spec 更新后回归全绿
5. 移除 `newSessionId()` 辅助函数

**IMPROVE 审查关注点（≤3 条）**：
- `useRouter` 路径符合 Next 16 规范（参照 apps/web/AGENTS.md）
- Playwright `page.waitForURL` 捕获跳转
- e2e spec 全部 session_id 从响应解析

**依赖**：T8

**Codex / 风险编号**：D13.2

**审查要求**：typescript-reviewer

---

### 阶段 8：SSE e2e 封住 + TESTING_MODE guard（T10–T12）

---

### 任务 T10：R-M1A-3 Spike v2 — Playwright SSE route 拦截 + 失败矩阵

**文件：** 临时 `apps/web/e2e/spike-sse-route.spec.ts`（验证后删除）

**任务性质**：spike，结论决定 T11 路径（A/B/SKIP）。

**RED 阶段（spike 前提）**：SSE-2 当前 `test.skip`（Playwright 1.59 拦截 text/event-stream 行为未验证）

**Spike 执行要点（≤5 条）**：
1. 写最简 spec：POST /start 启动 session → `page.goto('/research/{id}')` → 等 SSE 推 ≥2 事件 → `page.route('/api/research/*/stream', route => route.abort())`
2. 验证 EventSource 是否触发 `error`（通过 `page.evaluate` 检查）；或 `route.fulfill({ status: 204 })` 优雅关闭
3. 记录：Playwright 能否在 SSE 进行中通过 route 拦截
4. 按 T10 失败矩阵决定 T11 路径
5. 执行后删除 spike 文件，结论写入「实现前置」

**IMPROVE 阶段**：用户审批 T10 spike 结论 + T11 路径选择

**依赖**：T7B（heartbeat 修复后真实 SSE 才能稳定测）

**Codex / 风险编号**：R-M1A-3；Codex HIGH #5

**审查要求**：用户审批 spike 结论

---

### 任务 T11：SSE-2 e2e 实装 + TESTING_MODE guard

**文件：** 修改 `apps/web/e2e/sse-protocol.spec.ts`；可能修改 `apps/api/app/services/graph/routing.py`（路径 B）；修改 `apps/web/playwright.config.ts`（路径 B：webServer env 加 TESTING_MODE=true）

**RED 阶段**：
- SSE-2 spec 改为非 skip → 必须先红
- `test_sse2_last_event_id_header_present_on_reconnect`：`page.on("request")` 捕获重连 `/stream` 请求 headers，含 `Last-Event-ID`
- `test_sse2_replay_events_after_reconnect_seq_gt_broken_point`：重连首事件 seq > 断点 last seq
- **`test_testing_mode_required_for_prefix_injection`（v2 — Codex HIGH #3）**：路径 B 时，TESTING_MODE=False 环境 + 含 `__inject_close_after:N__` prefix 的 query → 正常处理（不触发提前关闭，prefix 视为普通字符串原样入 DB / 传 service）
- **`test_testing_mode_token_required_for_prefix_injection`（v2）**：TESTING_MODE=True + 缺 `X-Lumen-Test-Token` header → prefix 仍不触发
- **`test_inject_directive_strips_prefix_from_query_for_db_and_service`（v2.1 — NN2）**：双 guard 通过 + 含 prefix 的 query → DB 中 query 列存的是**剥离 prefix 后的 clean_query**（不含 `__inject_close_after:2__` 字面量）；service 收到的也是 clean_query
- **`test_no_prefix_query_passes_through_unchanged`**：query 不含 prefix → DB 和 service 都收到原始 query 字符串
- **`test_inject_error_prefix_strips_to_clean_query`（v2.2 补 PARTIAL）**：双 guard 通过 + query=`__inject_error__查询内容` → directive=InjectErrorDirective + clean_query="查询内容"；DB 和 service 收到 clean
- **`test_malformed_inject_prefix_treated_as_normal_query`（v2.2 补 PARTIAL）**：query=`__inject_close_after:abc__test`（N 不是数字，regex 不匹配）→ directive=None + clean_query 等于原 query；prefix 视为普通字符串完整保留
- **`test_inject_close_after_n_bounded`（v2.2 NNN3 补 MEDIUM）**：N 超过 100 时 regex 解析返回 None（视为 malformed），不创建 directive；防止 N=999999 让 close_after 失效到图自然结束

**GREEN 实现要点（路径 A — Playwright route 可行）**：
1. `startSession()` 后 `page.goto`，等 ≥2 事件
2. `page.route('/api/research/*/stream', route => route.abort())` 中断
3. `page.unroute(...)`，等 EventSource 自动重连（1-3s）
4. 监听重连 headers 验证 `Last-Event-ID` 存在
5. 不需 TESTING_MODE guard（route 拦截在前端层）

**GREEN 实现要点（路径 B — 后端 prefix 注入 + TESTING_MODE 双 guard，v2.1 修订 — N4）**：

**N4 修订要点（Codex 二轮 N4）**：guard 不放在 `services/graph/routing.py`（domain 层），改为放在 router 层（`apps/api/app/routers/research.py`）。原因：domain 层不应感知 FastAPI Request 对象，违反分层原则。

1. **router 层** `research.py` 新增私有函数（v2.1 — NN2：返回 `(directive, clean_query)` 元组，剥离 prefix 避免 query 污染）：
   ```python
   def _is_test_request(request: Request, settings: Settings) -> bool:
       if not settings.TESTING_MODE:
           return False
       if settings.TESTING_TOKEN is None:
           return False
       header = request.headers.get("X-Lumen-Test-Token")
       if header is None:
           return False
       return secrets.compare_digest(header, settings.TESTING_TOKEN.get_secret_value())

   def _parse_inject_directive(query: str) -> tuple[InjectDirective | None, str]:
       """解析 query 是否含 testing prefix。
       返回：(directive, clean_query)
         - directive：testing directive 对象（命中）或 None
         - clean_query：剥离 prefix 后的真实 query 字符串（命中时不含 prefix；未命中时等于原 query）
       注意：纯解析函数，不做 guard；guard 由 _is_test_request 完成。
       v2.1 — NN2 修复：避免把 testing prefix 字面量传给 LangGraph 节点导致 LLM 输出污染。
       """
       # NNN3 修复（v2.2 MEDIUM）：N 限制 1-100，防止 999999 让 close_after 失效
       m = re.match(r"^__inject_close_after:(\d{1,3})__(.*)$", query, re.DOTALL)
       if m:
           n = int(m.group(1))
           if 1 <= n <= 100:
               return InjectCloseAfterDirective(n=n), m.group(2)
           # n 超界视为 malformed，整段保留为 clean_query
           return None, query
       m = re.match(r"^__inject_error__(.*)$", query, re.DOTALL)
       if m:
           return InjectErrorDirective(), m.group(1)
       return None, query
   ```
2. `start_session` 路由内（v2.1 — NN2：用 clean_query 而非 body.query）：
   ```python
   directive: InjectDirective | None = None
   clean_query: str = body.query
   if _is_test_request(request, get_settings()):
       directive, clean_query = _parse_inject_directive(body.query)
   # 始终使用 clean_query 而非 body.query 入 DB / 传 service
   # 即使非 testing 请求 _parse_inject_directive 不调用，clean_query 等于 body.query
   await session_manager.start_session(
       session_id=..., query=clean_query, inject_directive=directive,
   )
   ```
   `_is_test_request` 返回 False 时 `directive=None`、`clean_query=body.query`，prefix 视为普通字符串原样保留
3. **service 层接口扩展**（v2.1 — N4）：`SessionManager.start_session(*, session_id, query, inject_directive)` + `LangGraphService.astream_events(session_id, query, inject_directive=None)`；service 层接 inject_directive 但不感知 Request；T4/T5 实装 service 时该参数 default None，主路径忽略
4. `LangGraphService.astream_events` 在节点开始前检查 `inject_directive`：
   - `InjectCloseAfterDirective(n=N)` → 推 N 个事件后 yield 一个特殊 ConnectionResetError 让生成器关闭（模拟断线）
   - `InjectErrorDirective` → 立即 yield ErrorEvent 并 return
5. spec 构造含此 prefix 的 query + 设置请求 header `X-Lumen-Test-Token: e2e-secret`：
   ```typescript
   await request.post(`${API_BASE}/api/research/start`, {
       data: { query: "__inject_close_after:2__真实 query 后缀" },
       headers: { "Content-Type": "application/json", "X-Lumen-Test-Token": "e2e-secret" },
   });
   // v2.1 NN2：DB 中 query 列将存"真实 query 后缀"（不含 prefix）；
   // LangGraph 节点收到的 query 也是"真实 query 后缀"，避免 LLM 输出污染
   ```
6. webServer 启动加 `LUMEN_TESTING_MODE=true LUMEN_TESTING_TOKEN=e2e-secret`（playwright.config.ts env 字段；不在 .env.tpl）

**IMPROVE 审查关注点（≤3 条）**：
- TESTING_MODE guard 完全阻断生产路径（双 guard：env + header）
- `Last-Event-ID` 是最后业务事件 event_id（不是 heartbeat — T7B 已修）
- spec 幂等（每次新 session_id）

**依赖**：T10

**Codex / 风险编号**：R-M1A-3；Codex HIGH #3 修复；ADR-0002 D8.3

**审查要求**：typescript-reviewer + security-reviewer（TESTING_MODE guard）

---

### 任务 T12：SSE-3 e2e 实装 + TESTING_MODE guard + README M1.A runbook

**文件：** 修改 `apps/web/e2e/sse-protocol.spec.ts`（SSE-3 解 SKIP）；修改 `apps/api/app/services/graph/routing.py`（query prefix `__inject_error__`）；修改 `README.md`；修改 `apps/api/tests/test_runbook_smoke.py`

**RED 阶段**：
- SSE-3 spec 解 SKIP → 必须先红
- `test_sse3_error_event_renders_error_ui`：后端 yield ErrorEvent → 前端 error UI 出现（data-testid 验证）
- **`test_inject_error_prefix_requires_testing_mode_and_token`（v2 — Codex HIGH #3）**：TESTING_MODE=False 或 token 缺失时，含 `__inject_error__` prefix 的 query 正常处理（prefix 视为普通字符串，不触发 ErrorEvent）
- `test_readme_m1a_runbook_section_exists`：README 含 `## Demo Runbook (M1.A)` heading
- `test_readme_m1a_delete_db_instruction`：含 `lumen.db` 删除指令
- `test_env_tpl_has_dashscope_base_url`：`.env.tpl` 含条目
- `test_env_tpl_has_no_testing_mode`：`.env.tpl` 不含 `TESTING_MODE`（仅 e2e webServer 设置）

**GREEN 实现要点（≤6 条）— v2.1 修订（N4）**：
1. **复用 T11 router 层 guard**（v2.1 — N4）：`_is_test_request(request, settings)` + `_parse_inject_directive(query)` 已在 T11 router 层定义；T12 复用同一 guard 函数；service 层不重复 guard
2. T11 已扩展 `LangGraphService.astream_events(..., inject_directive)` 接口；T12 在 `_inject_error_if_directive(directive)` 中处理 `InjectErrorDirective`：直接 yield ErrorEvent → return
3. README 新增 `## Demo Runbook (M1.A)`：删 `lumen.db` 指令、`DASHSCOPE_BASE_URL` 配置、新依赖、**TESTING_MODE/TOKEN 双 guard 安全说明（生产严禁）**
4. `.env.tpl` 新增 `DASHSCOPE_BASE_URL=op://...` + `LLM_MODEL=qwen-max`；**严禁** 加 `TESTING_MODE` 和 `TESTING_TOKEN`
5. `test_runbook_smoke.py` 新增前述 RED 测试用例
6. README runbook 含 D10 fork 叙事调整说明（Demo 脚本说辞 — 引用 ADR-0003 D10.2 v2.1）

**IMPROVE 审查关注点（≤3 条）**：
- `__inject_error__` prefix 受 TESTING_MODE + token 双 guard
- README runbook 覆盖完整 M1.A 部署步骤
- `.env.tpl` 不引入测试 backdoor 配置

**依赖**：T7B（错误注入需在 heartbeat 修复后测）

**Codex / 风险编号**：D12.1；Codex HIGH #3 修复；R-M1A-5；ADR-0002 D8.7

**审查要求**：python-reviewer + typescript-reviewer + security-reviewer（TESTING_MODE guard）

---

### 阶段 9：Release Smoke + Demo 兜底（T_SMOKE + T13 — v2 新增）

---

### 任务 T_SMOKE：v2 新增 — Release-time 真实 LLM smoke（pytest mark）

**文件：** 新建 `apps/api/tests/test_release_smoke.py`；修改 `apps/api/pyproject.toml`（pytest markers）

**任务背景（Codex HIGH #7）**：80% 覆盖率门禁靠 FakeListChatModel 不能证明 `init_chat_model` / `StateGraph.compile()` / `astream_events(version="v2")` 真实路径正确。需独立 smoke 任务在 release 前手动跑。

**RED 阶段**：
- `test_release_smoke_full_cycle_with_real_dashscope`（pytest mark `@pytest.mark.release_smoke`，CI 不跑，本地 release 前必跑）：
  1. 跳过条件：`DASHSCOPE_API_KEY` 未设 → `pytest.skip`
  2. 调 `LangGraphService.from_settings(settings)` 构造真实服务
  3. 调 `astream_events("smoke-001", "AI 在医疗领域的应用前景")` 一次（**v2.1 — NN1：不传 `inject_directive`，使用默认 None；smoke 走主路径**）
  4. 收集所有事件，断言至少出现以下类型：`plan_created` / `node_started` / `node_progress` / `node_completed` / `report_chunk` / `done`（不要求 error，因为生产路径不应出错）
  5. 总耗时不超过 10 分钟（超过失败）
- `test_release_smoke_skipped_without_api_key`：未设 key 时测试 skip 而非 fail

**GREEN 实现要点（≤4 条）**：
1. `pyproject.toml` 加 `[tool.pytest.ini_options] markers = ["release_smoke: requires DASHSCOPE_API_KEY, manual run before release"]`
2. CI 默认跑 `pytest -m "not release_smoke"`；本地 release 前跑 `pytest -m release_smoke`
3. README M1.A runbook 加「Release Checklist」节，列出 `uv run pytest -m release_smoke` 为必跑项
4. smoke 失败时输出诊断信息（每个事件类型 + LLM 响应原文 + 耗时）

**IMPROVE 审查关注点（≤3 条）**：
- pytest mark 正确隔离 CI vs 本地 release
- API key 缺失 → skip（不 fail）
- 耗时上限防止 hang

**依赖**：T7（LangGraphService 完整实装后）

**Codex / 风险编号**：Codex HIGH #7（覆盖率不证明真实路径）；R-M1A-2

**审查要求**：python-reviewer

---

### 任务 T13：v2 新增 — Demo 预跑 + replay_session + Demo URL（落实 ADR-0001 D6 L3）

**文件：** 新建 `scripts/prerender_demo_session.py`（M1.A 完成时**保留**，不删）；新建 `apps/api/data/demo_session.json`（**v2.1 修订 — N5：fixture 移出 tests/ 目录**）；修改 `apps/api/app/routers/research.py`（demo replay 路径 + 安全 guard）；新建 `apps/web/src/app/research/demo/page.tsx`；修改 `README.md`（Demo Day 章节）；新建 `apps/api/tests/test_demo_replay.py`

**任务背景（Codex HIGH #8 + 二轮 N5）**：ADR-0001 D6 L3 规定预跑 + replay 兜底。M1.A 验收必须包含此项，否则 Demo Day 现场 qwen-max 慢/挂时无救援机制（SSE-2 断线重连只救连接中断，不救 LLM hang）。Codex 二轮 N5 指出 v2 设计让生产路由读取 `tests/fixtures/`（生产构建不应依赖测试目录）+ `demo-fixed-id` 硬编码缺权限 guard，构成生产 backdoor。

**RED 阶段**：
- `test_prerender_script_writes_audit_log_to_data_dir`（v2.1 — N5）：脚本执行后 `apps/api/data/demo_session.json` 存在且有效（**不在 tests/**）
- `test_demo_session_id_loaded_from_fixture_not_hardcoded`（v2.1 — N5）：fixture 含运行时生成的 ULID（如 `01HXX...DEMO`），代码通过 `_load_demo_session_id()` 从 fixture 读，**不在 router 代码中硬编码**
- `test_demo_replay_serves_fixture_via_sse`：访问 `GET /api/research/{demo_session_id}/stream` 时，后端从 fixture 读 events 并按 SSE 协议返回
- **`test_demo_replay_requires_demo_referer_or_origin_or_token`（v2.1 — N5 安全 guard）**：访问 demo session_id 的 stream 路径时，必须满足以下任一条件才返回 200：
  1. 请求 `Referer` / `Origin` 在 `settings.DEMO_ALLOWED_ORIGINS` 列表（默认 `["https://demo.lumen.app"]`）
  2. 请求 header 含 `X-Lumen-Demo-Token` 且匹配 `settings.DEMO_REPLAY_TOKEN`（SecretStr）
  3. `settings.TESTING_MODE=True`（e2e webServer 也能访问）
- `test_demo_replay_unauthorized_request_returns_403`：缺上述任一 guard → 403 Forbidden
- `test_demo_url_renders_research_progress_page`（Playwright）：`page.goto('/research/demo')` → 重定向到 `/research/{demo_session_id}` → P2 页面渲染 → SSE 流播放 fixture
- `test_fixture_path_not_in_tests_directory`：grep `apps/api/app/` 中无任何 `tests/fixtures/demo` 引用

**GREEN 实现要点（≤7 条 — v2.1 修订）**：
1. **fixture 路径 v2.1**（N5）：`apps/api/data/demo_session.json`（出 tests/，进入生产 build 不会带测试目录）；目录已存在（`apps/api/data/lumen.db` 同级）；加入 git
2. `scripts/prerender_demo_session.py`：
   - 接收 `--query "..."` 参数
   - 生成新 ULID 作为 demo session_id（不硬编码）
   - 调 `LangGraphService.from_settings(settings)` 真实跑
   - 导出 `apps/api/data/demo_session.json`：`{ "session_id": "<runtime-ULID>", "query": "...", "events": [...] }`
3. **router 安全 guard（v2.1 — N5）**：`research.py` 加 `_load_demo_session_id()`（启动时读 fixture）+ `_is_demo_request_authorized(request, settings) -> bool`（referer/origin allowlist OR token OR TESTING_MODE）；`stream_session_endpoint` 内若 `session_id == _load_demo_session_id()` 则先 guard，未授权 → 403；授权 → 从 fixture 读 events → `format_sse_frame` 序列化 → 0.1s 间隔 yield
4. **Settings 新增字段（v2.1）**：`DEMO_ALLOWED_ORIGINS: list[str] = ["https://demo.lumen.app"]`、`DEMO_REPLAY_TOKEN: SecretStr | None = None`
5. 前端 `app/research/demo/page.tsx`：服务端从 `/api/demo-session-id`（新建端点）拉取 demo session_id；redirect 到 `/research/{id}`；SessionIdProvider 注入
6. README Demo Day 节加 runbook：`uv run python scripts/prerender_demo_session.py --query '...'` 在 Demo Day-1 跑；现场用 `https://demo.lumen.app/research/demo` 访问；referer 自动通过 guard
7. `prerender_demo_session.py` + `apps/api/data/demo_session.json` 都入 git 且不被 `.gitignore` 排除

**IMPROVE 审查关注点（≤3 条）**：
- demo session_id 不硬编码（v2.1 — N5）：从 fixture 加载，生产 ULID 与之碰撞概率为 0（ULID 时间戳唯一）
- 三层 guard（origin allowlist / token / TESTING_MODE）任一即放行；缺所有 → 403（不是 404，明确告知 Forbidden 而非 Not Found）
- fixture 大小合理（典型 50-200KB）；不依赖 tests/ 目录

**依赖**：T_SMOKE（先确认 release smoke 全绿，预跑才有意义）

**Codex / 风险编号**：Codex HIGH #8；ADR-0001 D6 L3 落实

**审查要求**：python-reviewer + typescript-reviewer

---

## 测试策略

### 后端单元 + 集成测试（pytest）

| 测试文件 | 覆盖任务 | 关键覆盖点 |
|---|---|---|
| `test_config.py` | T1 | Settings 新字段 + TESTING_MODE 默认 False |
| `test_db_sqlite.py` | T2 | query 列 + create_session 无默认值 |
| `test_session_lifecycle.py` | T3, T6 | StartSessionBody + client_request_id 幂等 + 终态契约（D12.4） |
| `test_langgraph_protocol.py`（新建） | T4 | Protocol runtime_checkable + stub/service 都满足 |
| `test_langgraph_service.py`（新建） | T4/T5/T6 | 三节点图 + ErrorEvent + timeout |
| `test_graph_routing.py`（新建） | T5 | 消费 T0 fixture 的 routing 单测 |
| `test_main.py` | T7 | lifespan + LangGraphProtocol 注解 + fake_session_manager fixture |
| `test_sse_wire_format.py` | T7B | format_heartbeat 不发 id 行 |
| `test_sse_replay.py` | T7B | heartbeat 后重连用业务 event_id |
| `test_release_smoke.py`（新建，pytest mark） | T_SMOKE | 真实 DashScope 调用 |
| `test_demo_replay.py`（新建） | T13 | demo session_id 路径 + fixture replay |
| `test_runbook_smoke.py` | T12, T13 | README + .env.tpl |

**LLM mock 策略**：单测用 `FakeListChatModel(responses=[...])` 注入；集成测试用 `fake_session_manager` fixture（v2 整体替换 session_manager）；release smoke 用真实 DashScope（手动 release 前跑）。

**覆盖率要求**：
- CI 强制：`pytest -m "not release_smoke" --cov=app` ≥80%
- Release 必跑：`pytest -m release_smoke`

### 前端测试（Vitest + Playwright）

| 测试 | 覆盖任务 | 关键覆盖点 |
|---|---|---|
| `research-input-hero.spec.tsx`（Vitest） | T8 | fetch + client_request_id + spinner + 错误处理 |
| `sse-protocol.spec.ts`（Playwright） | T9/T11/T12 | POST body + router.push + SSE-2/3 + TESTING_MODE guard |

**前端 mock 策略**：Vitest mock fetch；Playwright 用真实后端（webServer 配 TESTING_MODE=true + token），LangGraph 节点用 FakeListChatModel 或 query prefix 控制。

## 风险与缓解

| 风险 | 等级 | ADR/Codex 编号 | 任务级缓解 |
|---|---|---|---|
| R-M1A-1：StreamEvent 映射假设不符 | HIGH | ADR-0003 + Codex HIGH #4 | T0 v2 三节点 spike + fixture + 失败矩阵；T5 routing 测试消费 fixture |
| R-M1A-2：DashScope 速率/延迟 | HIGH | ADR-0003 + Codex HIGH #8 | T5 timeout(120) + qwen-plus 兜底 + T_SMOKE release 前验证 + T13 Demo 预跑 |
| R-M1A-3：Playwright SSE 拦截 | MEDIUM | ADR-0003 + Codex HIGH #5 | T10 v2 失败矩阵（路径 A/B/SKIP） |
| R-M1A-4：query 校验分裂 | MEDIUM | ADR-0003 | T3 后端 + T8 前端 maxLength |
| R-M1A-5：schema 演化次数 | LOW | ADR-0003 | T12 IMPROVE 确认 query 不计入 |
| **R-M1A-6 (v2)：D12 终态契约矛盾** | CRITICAL | Codex CRITICAL #2 | D12.4 决策修复；T6 集成测试断言 DB+audit_log 一致 |
| **R-M1A-7 (v2)：Heartbeat id 污染 LEID** | HIGH | Codex HIGH #2 | D-HB 决策修复；T7B 独立任务 |
| **R-M1A-8 (v2)：T7 fixture race condition** | HIGH | Codex HIGH #1 | LangGraphProtocol + 整体替换 session_manager fixture |
| **R-M1A-9 (v2)：query prefix 生产触发** | HIGH | Codex HIGH #3 | TESTING_MODE + token 双 guard；生产 .env.tpl 严禁 |
| **R-M1A-10 (v2)：80% 覆盖率不证明真实路径** | HIGH | Codex HIGH #7 | T_SMOKE pytest mark；release 前手动跑 |
| **R-M1A-11 (v2)：Demo Day 性能 hang 无救援** | HIGH | Codex HIGH #8 | T13 Demo 预跑 + fixture replay + demo URL |
| 追加 — planner 节点 LLM 定制工作量超预期 | MEDIUM | ADR-0003 D10.3 | T5 先固定模板 + TODO(M1.B) |
| 追加 — DB schema 迁移破坏存量 lumen.db | LOW | SDec-3 | README runbook 加删库提示 |

## Scope Out 清单（M1.A 不做）

| 项目 | 理由 | 计划阶段 |
|---|---|---|
| F4 冲突标注（ConflictDetectedEvent） | 节点逻辑属 M1.B；第 2 次 schema 演化警戒 | M1.B |
| ChromaDB 私有 KB 接入 | ADR-0001 D5 明确 M1.0 仅 SQLite | M1.B |
| L2 完整 Provider 抽象（Anthropic fallback） | D11 from_settings 预留扩展点 | M1.B |
| LangSmith tracing 配置 | 不影响 Demo 核心 | M1.B |
| ADR-0002 D8.7 codegen 引入 | 第 3 次 schema 演化（M1.B F4）才触发 | M1.C+ |
| Firecrawl 真实 Web 检索 | researcher 用 LLM 模拟；真实属 M1.B | M1.B |
| D9 Cloudflare Tunnel 配置 | 演讲前 1 天 | Demo Day -1 |
| 多 worker 部署 | ADR-0001 D5 硬约束 | 永不 |
| P1 → P2 加载动画优化 | 视觉打磨 | M1.C |
| LLM planner 真实定制（非固定模板） | D10.3 降级路径 | M1.B |

## 验收标准（M1.A 完成定义 — v2 加 4 项）

- [ ] **SSE 双跑 5/5 PASS（或 4/5 + 1 SKIP 文档化）**：SSE-1/4/5 仍绿；SSE-2/3 解 SKIP（按 T10/T11 失败矩阵决定）
- [ ] **LLM 真实调用**：`LangGraphService.from_settings()` 在真实环境调 DashScope qwen-max 完整流程
- [ ] **前端 P1 → P2 路由闭环**：浏览器输入 query → 后端返回 session_id → 路由跳转 → SSE 自动开
- [ ] **API 形状验收**：POST body 仅含 `query` + 可选 `client_request_id`；响应含 `session_id`
- [ ] **客户端幂等**：相同 client_request_id 60s 内返回相同 session_id（D13.5）
- [ ] **ErrorEvent 路径 + 终态契约**：LLM 异常 / 120s timeout → 前端 error UI；DB session.status=failed；audit_log 含 error 事件（D12.4）
- [ ] **Heartbeat 不污染 LEID（v2 新增）**：`format_heartbeat` 输出无 `id:` 行；SSE-2 重连用业务 event_id
- [ ] **TESTING_MODE/TOKEN 双 guard（v2 + v2.1 N3/N4）**：`__inject_error__` / `__inject_close_after__` prefix 仅在 router 层 `_is_test_request()` 三层校验通过（TESTING_MODE=true AND TESTING_TOKEN 已设 AND `X-Lumen-Test-Token` header 匹配）下生效；service 层不感知 Request；生产 .env.tpl 严禁 TESTING_MODE/TOKEN
- [ ] **inject_directive 端到端透传（v2.2 NN1+NNN4）**：T4 LangGraphProtocol/Stub/Service 签名都含 `*, inject_directive: InjectDirective | None = None`；T6 SessionManager 通过 `_run` 参数（不通过实例字段）传递；并发 session 测试验证不串台
- [ ] **clean_query 入 DB 和 service（v2.2 NN2）**：`_parse_inject_directive` 返回 `(directive, clean_query)`；DB 中 query 列存 clean_query；LangGraph 节点收到 clean_query；不含 testing prefix 字面量
- [ ] **Demo replay 三层 guard（v2.1 — N5）**：访问 demo session_id 的 `/stream` 必须满足 referer/origin allowlist OR `X-Lumen-Demo-Token` header OR TESTING_MODE=true；缺所有 → 403；demo session_id 从 `apps/api/data/demo_session.json` 加载（不硬编码）；fixture 不在 tests/ 目录
- [ ] **DB query 列**：`SELECT query` 返回用户输入
- [ ] **后端覆盖率 ≥80%**：`pytest -m "not release_smoke" --cov=app`
- [ ] **Release smoke（v2 新增）**：`pytest -m release_smoke` 本地全绿（设 DASHSCOPE_API_KEY）
- [ ] **Demo 预跑 + replay（v2 新增）**：`scripts/prerender_demo_session.py` 跑通；`/research/demo` URL 离线可演示
- [ ] **ruff + mypy 0 错误**
- [ ] **M1.0 回归不破坏**：229 mock e2e 全绿
- [ ] **README M1.A runbook**：含删 lumen.db、DASHSCOPE_BASE_URL、新依赖、Release Checklist、Demo Day-1 预跑指令
- [ ] **Spike 产物归档**：T0 三节点 fixture + T10 SSE 拦截结论已记录在「实现前置」
- [ ] **ADR 修订追加**：ADR-0001 D5 / ADR-0002 D8.4 / ADR-0002 D8.5（v2）三项修订记录登记
