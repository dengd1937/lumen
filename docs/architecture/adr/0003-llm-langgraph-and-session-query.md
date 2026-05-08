# 0003 — M1.A LLM 实接：LangGraph 集成、Provider 抽象、错误契约、Session+Query 流转

## 状态

已批准（v2，2026-05-09 经 Codex 反审修订）

## 日期

2026-05-08（v1）/ 2026-05-09（v2 修订）

## 决策类型

L2 标准评估

## 决策者

项目所有者（dengdi）

## 上下文

ADR-0001 与 ADR-0002 共同确立了 SSE 协议骨架基线。M1.0 以 `LangGraphStub`（4 业务事件硬编码序列）验证了端到端管道，SSE e2e 双跑最小集 5 项中 2 项（SSE-2 Last-Event-ID 续传、SSE-3 inject_error）处于 SKIP 状态。

M1.A 目标：替换 stub 为真实 LangGraph + DashScope qwen-max；接通前端 P1 输入框 → POST /start → P2 路由；封住 SSE-2 / SSE-3 两个 SKIP；最小错误恢复（异常→ErrorEvent，不做重试编排）。用户已**显式排除**完整 L0-L3 Provider 抽象（属 M1.B+ 工作）。

本 ADR 决议 D10-D13 四项主决策与 SDec-1~4 四项二级决策。

**审查过程**：方案经 architect agent 评估（4 决策 × 3 选项对抗性评分 + 5 项 risk）+ 用户审批四项推荐方案（D10 自建、D11 封装层、D12 ErrorEvent 终止、D13 后端生成 session_id），并将 R-M1A-1（StreamEvent → AnyEvent 映射验证）纳入 M1.A T0 spike。

**v2 修订（2026-05-09）**：经 design-review-codex 跨模型对抗性审查，发现 2 项 CRITICAL（D10 论据不足、D12 终态契约矛盾）+ 6 项 HIGH（T7 fixture race、Heartbeat id 污染 LEID、prefix 生产触发风险、T0 spike 单节点不足、spike 失败矩阵缺、D13 幂等键缺失、80% 覆盖率不能证明 LangGraph 路径、Demo Day 预跑缺失）。本 v2 修订处理全部 CRITICAL：D10 论据补强（git 无 fork 痕迹为主论据）+ 新增 D12.4（终态契约）+ 新增「Heartbeat id 不更新 cursor」修订 ADR-0002 D8.5 + 新增 D13.5（client_request_id 幂等键）。HIGH 项在配套 plan v2 中处理。

---

## 决策

### D10 — LangGraph 集成形态：自建 StateGraph，不 fork open_deep_research

采用 `langgraph` + `langchain-core` 自建三节点 `StateGraph`：`planner → researcher → writer`。`LangGraphService` 封装 `astream_events(session_id, query)` 接口，与 M1.0 `LangGraphStub` 同质（`async def astream_events(self, session_id: str, query: str) -> AsyncIterator[AnyEvent]`），`SessionManager` 调用点零变更。

#### D10.1 图节点 → SSE 事件映射规则

| LangGraph 节点位置 | yield 的 lumen 事件 |
|---|---|
| `planner` 节点完成 | `PlanCreatedEvent`（5-7 个 `PlanNode`，固定模板 + LLM 少量定制标题/描述） |
| `researcher` 节点（每个子任务） | 启动 → `NodeStartedEvent`；进行中 → `NodeProgressEvent`；完成 → `NodeCompletedEvent` |
| `writer` 节点 | 流式 token → `ReportChunkEvent` |
| 图终态 | `DoneEvent` |
| 任意节点异常 | `ErrorEvent`（D12） |

`ConflictDetectedEvent` 在 M1.A 不实现（F4 冲突标注属 M1.B），但 schema 保留。

#### D10.2 不 fork 的依据（v2 修订：以 git 现状为主论据）

**主论据 — git 现状**：`git remote -v` 显示项目唯一 origin 为 `dengd1937/lumen.git`，无 langchain-ai/open_deep_research 上游追踪分支；`git log --all --grep="fork|open_deep_research"` 无任何 commit message 匹配；项目仓库不是从 fork 父仓库克隆建立。**git history 层面项目从未实际 fork open_deep_research**。

**澄清（v2.1 修订 — 经 Codex 二轮反审 N1）**：
- git history 无 fork ≠ 文档/注释字样无残留
- `docs/product/lumen.md` 行 15/112/183、`docs/architecture/adr/0001-lumen-baseline-architecture.md` 行 67-72 的「fork」「最小 fork」表述是产品规格 + 基线 ADR 写作时的**初期叙事假设描述**
- `apps/api/app/services/langgraph_service.py` 行 6 注释中「real LangGraph fork via the same astream_events interface」是 stub 文档对未来实现的预期表述
- 这些都是**描述性表述**，不是已发生的代码事实；它们与 git history 的实际状态长期不一致，是 D10 决策需要纠正的核心问题
- 上述文档/注释字样将在 **M1.A retro 时同步更新**（`lumen.md` 改为「基于 LangGraph 生态自建」；ADR-0001 D3 修订记录追加；langgraph_service.py 注释更新为「LangGraph StateGraph integration」）

D10 性质：「将产品规格、基线 ADR、代码注释中的 fork 叙事假设与 git history 现状对齐」（不是「放弃已开始的 fork」，因为从未真正开始过）。

**次论据 — 工程成本对称**：fork 路径的实际工作面（`graph.astream_events()` 输出的 LangChain `StreamEvent` dict 映射到 lumen 9 种 SSE 事件 + 上游图结构假设）与自建 3 节点图工作量相当，但 fork 还引入上游图结构隐含假设的额外风险。

**产品规格修订（M1.A retro 时同步）**：
- `lumen.md` 行 15/112/183 把「fork `langchain-ai/open_deep_research`」改为「基于 LangGraph 生态自建咨询垂类 research graph」
- 竞赛叙事差异化锚点不变：F8（私有 KB）/ F4（冲突标注）/ F7（双轨可视化）
- 评委追问 fork delta 时回答模板：「项目实测 fork 路径与自建路径工作量对称，但自建消除了上游 StreamEvent 字段映射的隐含假设风险，因此选择基于 LangGraph 原生 API 自建 3 节点图」

#### D10.3 回退路径

若 M1.A 期间 `planner` 节点 LLM 定制工作量超预期，降级为「固定 5 子任务模板」（不调用 LLM），仅 `researcher` / `writer` 节点调用 LLM。SSE 事件契约不变，前端零改动。

---

### D11 — LLM Provider 抽象：LangGraphService 封装层 + 构造时 model 注入

`LangGraphService.__init__` 接受 `model: BaseChatModel` 参数（由 `init_chat_model` 工厂在 lifespan 构建并注入），图节点通过闭包引用 model 对象。

```python
class LangGraphService:
    def __init__(self, *, model: BaseChatModel, db_path: str) -> None:
        self._model = model
        self._graph = self._build_graph()  # StateGraph，节点闭包引用 self._model

    @classmethod
    def from_settings(cls, settings: Settings) -> "LangGraphService":
        model = init_chat_model(
            model=settings.LLM_MODEL,             # 默认 "qwen-max"
            model_provider="openai",
            base_url=settings.DASHSCOPE_BASE_URL, # OpenAI-compatible endpoint
            api_key=settings.DASHSCOPE_API_KEY,
        )
        return cls(model=model, db_path=settings.LUMEN_DB_PATH)

    async def astream_events(
        self, session_id: str, query: str
    ) -> AsyncIterator[AnyEvent]: ...
```

#### D11.1 与 ADR-0001 D6 的关系

ADR-0001 D6 已选定 `init_chat_model` 作为 LLM 抽象层。D11 是在 D6 之上加**组织层**（收拢调用点），不替代 D6，不重复造轮子。

L2 切换 Anthropic 路径仍由环境变量驱动 `init_chat_model` 参数，`from_settings` 工厂内部 if/else 分支即可，零节点改动。

#### D11.2 单测注入点

```python
# 测试中：
service = LangGraphService(
    model=FakeListChatModel(responses=["plan json...", "summary...", "report markdown..."]),
    db_path=":memory:",
)
```

不需要 `monkeypatch.setattr` 全局，不需要 `unittest.mock.patch` 模块。

---

### D12 — 错误契约：任意 LLM 异常 → ErrorEvent + close stream

`LangGraphService.astream_events()` 内部用 `try/except` 包裹 LLM 节点调用。节点级异常捕获后 yield `ErrorEvent`，生成器随之退出。`SessionManager._run()` 现有 `except Exception → terminal_status = "failed"` 路径不变（ErrorEvent 已由 LangGraphService 层 yield 并写入 audit_log，session 终态保持 `failed`）。

#### D12.1 与现有协议一致性

- ADR-0002 D8 ErrorEvent 协议契约不变
- M1.0 SSE-3 e2e 的 `LUMEN_STUB_INJECT_ERROR=1` 在真实路径中对应：测试时通过 `FakeListChatModel(responses=[..., RaiseException()])` 触发 ErrorEvent，e2e spec 契约不变
- 前端 `use-report-data.ts` 已实装 error UI 状态，零前端工作

#### D12.2 不做节点级降级

排除「partial NodeCompletedEvent」选项的依据：
- 触发 ADR-0002 D8.7 schema 演化第 2 次警戒线
- 前端 `research-canvas.tsx` 需新增 partial 状态渲染，超出 M1.A scope
- M1.B 加重试时只需在 `except` 前插入 `retry_logic`，扩展点天然存在

#### D12.3 LLM 调用超时硬约束

每次 LLM 调用须用 `asyncio.timeout(120)` 包裹（缓解 R-M1A-2 中 DashScope hang 阻塞 producer）。超时也归入「任意 LLM 异常」路径，触发 ErrorEvent。

#### D12.4 ErrorEvent 终态契约（v2 修订 — 修复 v1 数据一致性 bug）

**问题（Codex CRITICAL #2，置信度 9/10）**：v1 D12 设计存在终态契约矛盾。当前 `SessionManager._run()` 默认 `terminal_status="completed"`（`session_manager.py:102`），只有异步迭代器抛异常才置 `failed`（line 119）。若 `LangGraphService` 捕获异常 → yield ErrorEvent → 正常 return（`yield ErrorEvent → return` 是 D12 决策行为），生成器无异常向外抛 → SessionManager 把 session 表记为 `completed`，但 audit_log 已写入 `error` 类型事件 → **数据不一致**。

**修订决策 D12.4**：`SessionManager._run()` 必须感知 `ev.type == "error"` 事件并显式置终态：

```python
async for ev in self._langgraph.astream_events(session_id, query):
    await append_event(conn, session_id=session_id, event=ev)
    if ev.type == "error":
        terminal_status = "failed"
        # 不 break：让生成器自然结束，避免 cancel 半消费
```

`LangGraphService.astream_events()` 的契约不变（异常→yield ErrorEvent→return），但 SessionManager 不再依赖异常传播判断终态。

**测试要求**：`test_session_manager_error_event_marks_session_failed`（plan T6）必须断言：
1. session 表 `status == "failed"`
2. audit_log 含 `type == "error"` 事件
3. 两者从同一调用路径产生（DB + audit_log 一致性）

**为何不让 LangGraphService 重抛异常**：保留 yield-then-return 设计的好处是「错误也是事件」语义对齐 SSE 协议；audit_log 完整记录错误内容供 replay；ErrorEvent 自然进入 SSE 流让前端 UI 渲染。重抛异常会让 SSE 流因生成器异常突然关闭，前端只能看 EventSource error 事件而非业务 ErrorEvent。

---

### D-TM — TESTING_MODE + TESTING_TOKEN 双 guard（v2.1 新增，经 Codex 二轮反审 N3）

**背景**：plan T11/T12 通过 query prefix（`__inject_close_after:N__` / `__inject_error__`）让测试触发 SSE-2 断流和 SSE-3 错误注入。这些是测试 backdoor，必须严格 guard 防止生产触发。Codex 一轮 HIGH #3 已识别该风险，v2 在 plan 中加了双 guard，但 v2 修订未在 ADR 显式定义 `TESTING_TOKEN` 字段，导致 T11 引用 `settings.TESTING_TOKEN` 时 T1 Settings 缺定义。

**决策**：测试 backdoor（query prefix）的双 guard 由两个 Settings 字段协同：

```python
class Settings(BaseSettings):
    TESTING_MODE: bool = False                    # 默认关闭；e2e webServer env 设 true
    TESTING_TOKEN: SecretStr | None = None        # 默认 None；e2e webServer env 设
```

guard 判定（router 层，N4 修订）：

```python
def _is_test_request(request: Request, settings: Settings) -> bool:
    if not settings.TESTING_MODE:
        return False
    if settings.TESTING_TOKEN is None:
        return False
    header = request.headers.get("X-Lumen-Test-Token")
    if header is None:
        return False
    # constant-time compare 防 timing attack
    return secrets.compare_digest(header, settings.TESTING_TOKEN.get_secret_value())
```

只有 `_is_test_request(...)` 返回 True 时，router 才将 query prefix 识别并解析为 inject_directive 传给 service；否则 prefix 视为普通 query 字符串。

**生产部署约束**：
- `.env.tpl` 不写 `TESTING_MODE` 和 `TESTING_TOKEN`（不在生产模板暴露）
- README runbook 明确「生产严禁设置 TESTING_MODE=true」
- e2e webServer env 通过 `playwright.config.ts` 设置（非 .env.local）

**测试覆盖**（plan T11 RED 强化）：
- `test_testing_mode_required_for_prefix_injection`：TESTING_MODE=False → prefix 不触发
- `test_testing_token_required_for_prefix_injection`：TESTING_MODE=True 但缺 token header → prefix 不触发
- `test_testing_token_mismatch_rejected`：TESTING_MODE=True 但 token 不匹配 → prefix 不触发
- `test_testing_request_routes_inject_directive`：双 guard 通过 → inject_directive 传入 service

---

### D-HB — Heartbeat id 不更新 cursor（v2 新增，修订 ADR-0002 D8.5）

**问题（Codex HIGH #2，置信度 8/10，源码层确认）**：`apps/api/app/core/sse.py:87` 当前 `format_heartbeat()` 输出 `id: heartbeat-{server_time}\nevent: heartbeat\ndata: {...}\n\n`，每条 heartbeat 都带 `id:` 行。W3C SSE 规范规定 EventSource 自动维护 lastEventId 为最近收到的 `id:` 行值。

`apps/api/app/routers/research.py:107-119` 的 GET /stream 对任何 `Last-Event-ID` 调 `lookup_seq_by_event_id`；找不到 audit_log 行就返 400。`heartbeat-<server_time>` 不在 audit_log（heartbeat 不持久化），必然返 400。

**M1.0 隐藏 bug**：M1.A 长 LLM 节点（qwen-max 单次 3-8s + 多 heartbeat） → 浏览器最后收到 heartbeat → 断线重连携带 heartbeat id → 服务端 400 → SSE-2 e2e 必失败。该 bug 在 M1.0 因 SSE-2 处于 SKIP 状态被掩盖。M1.A 解 SKIP 时必然暴露。

**修订决策 D-HB**：heartbeat 帧**不发 `id:` 行**：

```python
# apps/api/app/core/sse.py 修订前
return (f"id: heartbeat-{server_time}\nevent: heartbeat\ndata: {payload_json}\n\n").encode()

# 修订后
return (f"event: heartbeat\ndata: {payload_json}\n\n").encode()
```

W3C SSE 规范：缺 `id:` 行的帧不会更新 EventSource.lastEventId，浏览器重连仍携带最近**业务事件**的 event_id。这恰是我们想要的语义。

**ADR-0002 D8.5 修订记录**：D8.5 原文「服务端心跳：每 15 秒发一次 heartbeat 事件...」补充「heartbeat 帧不发 `id:` 行，避免污染 EventSource.lastEventId」。M1.A retro 时在 ADR-0002 修订记录追加。

**测试要求**：plan T_HB（v2 新增任务）必须含 RED 测试：
1. `test_format_heartbeat_does_not_emit_id_line`：bytes 输出不含 `id: ` 前缀
2. `test_sse_stream_after_heartbeat_reconnect_uses_last_business_event_id`：模拟客户端发送最后业务事件的 event_id 作为 LEID 重连，服务端正确 replay（不返 400）

**为何不让服务端识别 `heartbeat-*` prefix**：identifier-based dispatch 增加协议表面积；EventSource 客户端无法被服务端配置；不发 `id:` 是 W3C SSE 的标准做法（见 [HTML Living Standard 9.2](https://html.spec.whatwg.org/multipage/server-sent-events.html#sse-processing-model)），最小破坏。

---

### D13 — session_id + query 流转：后端生成 session_id，POST body 仅 query

#### D13.1 API 形状变更（破坏性）

```python
class StartSessionBody(BaseModel):
    query: str = Field(min_length=1, max_length=2000)

@router.post("/start", status_code=201, response_model=StartSessionResponse)
async def start_session(body: StartSessionBody, request: Request) -> StartSessionResponse:
    session_id = str(ULID())
    session_manager = request.app.state.session_manager
    await session_manager.start_session(session_id=session_id, query=body.query)
    return StartSessionResponse(session_id=session_id)
```

`StartSessionBody` 移除 `session_id` 字段，新增 `query`（1-2000 字符）。后端用 ULID 生成 session_id 并返回。

#### D13.2 前端路由时序

`ResearchInputHero.onSubmit()`：
1. `submitting = true` → 展示 `icon-spinner`（已实装）
2. `POST /api/research/start { query: topic.trim() }`
3. 等待响应（RTT ~50-200ms，Demo 场景可接受）
4. 拿到 `session_id` → `router.push('/research/[session_id]')`
5. P2 挂载 `SessionIdProvider` → GET `/api/research/[session_id]/stream` 开 SSE

#### D13.3 幂等语义

用户刷新 P1 提交相同 query 会生成新 session_id，**不重用旧 session**。ADR-0002 D8.4 session producer 锁语义不变。

#### D13.4 query 长度校验

- 前端：`<textarea maxLength={2000}>` 防护层（避免后端 422）
- 后端：`Field(min_length=1, max_length=2000)` 严格校验
- `topic.trim().length > 0` 已是 `canSubmit` 条件，无需修改

#### D13.5 client_request_id 幂等键（v2 新增，修订 v1「混合方案过度设计」判断）

**问题（Codex HIGH #6，置信度 7/10）**：v1 D13 排除「client_request_id + 后端生成 session_id」混合方案为「过度设计」。Codex 反审指出此判断证据不足：网络重试 / 双击 race / POST 成功响应丢失 / 浏览器刷新四种场景都会创建孤儿 session（D13.3 明确刷新会生成新 session）。Demo 场景虽不计费，但孤儿 session 会污染 `lumen_research_sessions` 表 + audit_log 增加 ChromaDB（M1.B+）检索噪声。

**修订决策 D13.5**：POST `/research/start` body 加可选 `client_request_id: str | None` 字段（前端用 `crypto.randomUUID()` 生成，submit 期间稳定值）：

```python
class StartSessionBody(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    client_request_id: str | None = Field(default=None, max_length=64, pattern=r"^[a-zA-Z0-9_-]{1,64}$")
```

后端短窗口去重（默认 60s）：若同 `client_request_id` 在窗口内已创建 session（任何状态），返回**已有的** `session_id` + 200 OK（而非 201 Created），不重复 start producer。

**实现方式（M1.A 最小可行）**：
- 内存级 LRU dict（`{client_request_id: (session_id, expires_at)}`，max 1024 entries）
- `SessionManager.start_session_with_idempotency_key(request_id, query)` 包装当前 `start_session`
- 60s 窗口足够覆盖网络重试 + 双击；超出窗口视为新意图

**测试要求**：plan T3 RED 测试加：
1. `test_start_session_idempotency_returns_same_session_id_within_window`：同 client_request_id 60s 内两次 POST → 返回相同 session_id
2. `test_start_session_idempotency_outside_window_creates_new_session`：超 60s 后再 POST → 新 session_id
3. `test_start_session_no_client_request_id_creates_new_session_each_time`：未传 client_request_id 时每次都是新 session_id（向后兼容）

**前端配合（plan T8）**：`ResearchInputHero.onSubmit` 在 component mount 时生成稳定 `client_request_id = crypto.randomUUID()`，submit 期间不变；提交成功后清除（避免重复使用）。

---

## 二级决策

### SDec-1 — 依赖版本约束（在 ADR-0003 内决议）

```toml
# apps/api/pyproject.toml 新增
"langgraph>=0.3,<0.4",
"langchain-core>=0.3,<0.4",
"langchain-openai>=0.2,<0.3",  # DashScope OpenAI-compatible
```

DashScope 走 `langchain-openai` 的 `ChatOpenAI(base_url=DASHSCOPE_URL, ...)`，不引入 `langchain-community.ChatTongyi`，与 ADR-0001 D6 实现路径保持一致。

### SDec-2 — 模块边界（在 ADR-0003 内决议）

启动方案（M1.A 初期）：节点逻辑内联在 `langgraph_service.py`，单文件 ≤800 行约束（hook 强制）。

升级触发：当任一节点逻辑超 100 行时，重构为 `services/graph/` 子包：

```
apps/api/app/services/
├── langgraph_service.py        # LangGraphService（图工厂 + astream_events 路由层）
├── session_manager.py          # 签名扩展（query 参数），无结构变化
└── graph/                      # 触发条件：任一节点 >100 行
    ├── __init__.py
    ├── planner.py
    ├── researcher.py
    └── writer.py
```

每层 ≤8 文件约束自动满足。

### SDec-3 — 数据模型扩展：query 字段加入 lumen_research_sessions 表

```sql
ALTER TABLE lumen_research_sessions ADD COLUMN query TEXT NOT NULL DEFAULT '';
```

`DEFAULT ''` 保证已有行迁移兼容。开发环境（M1.A 范围）允许删表重建，不需迁移脚本（Demo 项目约束）。

影响：
- `apps/api/app/db/sqlite.py` `create_session()` 函数签名扩展为 `create_session(conn, session_id, query)`
- `apps/api/tests/test_db_sqlite.py` 的 session lifecycle 测试需同步
- `init_db()` 内 CREATE TABLE 语句更新
- README M1.A runbook 节加迁移提示（删 `lumen.db` 重启）

### SDec-4 — LangGraphService 单例生命周期

`LangGraphService` 在 `lifespan` 中通过 `from_settings(settings)` 构建并挂载到 `app.state.langgraph_service`。`SessionManager.start_session` 通过 `app.state` 引用，**不 per-request 重建**。

依据：
- LangGraph `StateGraph.astream_events(config)` 接受 `thread_id`（即 session_id）参数，天然支持多 session 复用同一图实例
- `init_chat_model` 调用 ~50ms，避免 per-request 重复构建
- 与 `SessionManager` 生命周期对齐（均在 lifespan 构建）

---

## 影响

### 正面

- `LangGraphService` 接口与 `LangGraphStub` 同质，`SessionManager` 代码变更最小
- `ErrorEvent` 路径复用 SSE-3 e2e 已有前端 error UI，无额外前端工作
- 后端生成 session_id 消除前端 ULID 依赖
- query 字段进入 DB，为 M1.B+ 历史检索、会话重放提供数据基础
- D11 model 注入设计使单测 LLM mock 不需要全局 patch

### 负面 / 约束

- `SessionManager.start_session(session_id, query)` 签名改变，`tests/test_session_lifecycle.py` 需同步
- `StartSessionBody` API 破坏性变更（移除 `session_id`，加 `query`）：影响 e2e `sse-protocol.spec.ts` SSE-1 / SSE-2 / SSE-3 三个 spec 的 POST body
- `lumen_research_sessions` schema 变更：开发环境删表重建（README runbook 须更新）
- D10 放弃「fork open_deep_research」叙事，Demo 脚本说辞需调整

### 关联 ADR 修订

- ADR-0001 D5：`lumen_research_sessions` 加 `query TEXT NOT NULL DEFAULT ''` 列（schema 演化第 1 次，未达 D8.7 警戒）
- ADR-0002 D8.4：`POST /research/start` body schema 变更（移除 session_id，加 query + 可选 client_request_id）；M1.A retro 时在 ADR-0002 修订记录追加
- **ADR-0002 D8.5（v2 新增修订）**：heartbeat 帧不发 `id:` 行，避免污染 EventSource.lastEventId；M1.A retro 时在 ADR-0002 修订记录追加
- 不修订 ADR-0001 D6（D11 是 D6 之上的组织层）

---

## 风险与缓解

### R-M1A-1（HIGH）— LangGraph `astream_events()` 与 lumen `AnyEvent` 映射假设未经验证

LangGraph `graph.astream_events()` 原生输出是 LangChain `StreamEvent` dict（`event` / `name` / `run_id` / `data` / `tags` 字段），不是 lumen `AnyEvent` Pydantic 对象。`LangGraphService` 内部需要显式 event routing 层（如 `if event["event"] == "on_chat_model_stream" and event["name"] == "writer" → yield ReportChunkEvent`）。映射规则的复杂度在实现前为未知量，是 M1.A 工期主要变量。

**缓解**：M1.A T0 spike — 真实 DashScope 调用打印原始 `StreamEvent` 字典，确认映射规则后再实现 routing 层。spike 输出沉淀到 `docs/plans/lumen-m1-a-*.md` 的「实现前置」章节。

### R-M1A-2（HIGH）— DashScope qwen-max 速率限制 + 响应延迟影响 SSE 实时性

单次研究流程（planner + 5-7 researcher + writer）触发 10+ 次 LLM 调用。qwen-max 单次延迟 ~3-8s，全流程 >5min（产品目标 3-5min）。DashScope hang（非超时）会阻塞 producer task。

**缓解**：
- D12.3 强制 `asyncio.timeout(120)` 包裹每次 LLM 调用
- Demo 前用 qwen-plus（更快）作为 L1 兜底验证完整流程耗时
- ADR-0002 D8.5 心跳机制保证长节点期间前端不误重连

### R-M1A-3（MEDIUM）— SSE-2 Playwright EventSource 拦截能力未验证

Playwright 1.59 对 SSE（HTTP long-response）的 `page.route()` 拦截行为与普通 HTTP/WebSocket 不同。`route()` 是否能稳定中断正在 streaming 的 SSE 响应并触发 EventSource `error` 事件需实验。

**缓解**：SSE-2 e2e 实现前先 spike — `page.route('/api/research/*/stream', ...)` 行为验证；若不稳定，改为后端测试端点（注入延迟 + 强制关闭）模拟。

### R-M1A-4（MEDIUM）— query 字段校验位置分裂

前端 `topic.trim().length > 0`（`canSubmit`）与后端 `Field(max_length=2000)` 无共享 schema。用户输入 >2000 字符后端 422 时前端无显式处理。

**缓解**：D13.4 强制前端 `<textarea maxLength={2000}>` 防护 + `onSubmit` 错误 toast 处理 HTTP 422。

### R-M1A-5（LOW）— ADR-0002 D8.7 schema 演化次数追踪

D8.7 规定「schema 演化超 2 次引入 codegen 或 CI 校验」。M1.A query 字段不影响 SSE 事件 schema（属 POST body），不计入演化次数。M1.B 的 F4 `ConflictDetectedEvent` 扩展将触发第 3 次演化，届时引入 codegen 议题。本 ADR 登记追踪提醒。

---

## 参考资料

- `docs/product/lumen.md` — F1（行 65/133）、技术栈（行 15/112/183）、设计约束（行 116-124）
- `docs/architecture/adr/0001-lumen-baseline-architecture.md` — D3 / D5 / D6
- `docs/architecture/adr/0002-sse-protocol-and-demo-deployment.md` — D8.4 / D8.5 / D8.7
- `docs/plans/lumen-m1-0-sse-skeleton.md` — Scope Out 表（行 504-516）
- `apps/api/app/services/langgraph_service.py` — `LangGraphStub.astream_events()` 接口形状
- `apps/api/app/services/session_manager.py` — `start_session` / `_run` 签名
- `apps/api/app/routers/research.py` — `StartSessionBody` 现状
- `apps/web/src/components/research/research-input-hero.tsx` — `onSubmit` TODO(S3)
- LangGraph `StateGraph.astream_events()` 文档：https://langchain-ai.github.io/langgraph/

---

## 修订记录

- 2026-05-08 — 初版批准（dengdi）。决策路径：architect agent 评估 + 用户确认四项推荐方案。
- 2026-05-09 — v2 修订（经 design-review-codex 跨模型反审）。处理 2 项 CRITICAL（D10 论据补强：git 无 fork 痕迹为主论据；D12.4 终态契约修复）+ 2 项 HIGH 的 ADR 层修订（D-HB heartbeat id 不更新 cursor / D13.5 client_request_id 幂等键）。剩余 6 项 HIGH 由配套 plan v2 处理（T0/T7/T11-T12/T_HB/T_SMOKE/T13）。
