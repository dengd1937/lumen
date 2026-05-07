# 实现计划：Lumen M1.0 — Mock→SSE 骨架切换

> **修订记录**：本 plan 经 Codex 跨模型对抗性审查（design-review-codex skill）后修订。原 15 任务扩为 16 任务，多任务 GREEN 要点补全。审查识别 1 CRITICAL + 7 HIGH + 6 MEDIUM + 1 LOW，全部纳入修订。

## 执行方式

本计划通过 `/task-driven-development` skill 执行。禁止直接按文本逐步实现。以下任务描述是 skill 的输入规格，不是直接执行指令。

## 概述

基于 ADR-0002 的三项决策（D7/D8/D9），将现有 229 specs 全绿的 mock 静态骨架接入 SSE live 数据通道。**M1.0 验收必须包含 SSE 双跑最小集 5 项 e2e**（不允许推迟）——避免「写完一堆代码但没证明 SSE 协议骨架闭环」。

整个过程不破坏现有 229 e2e specs，mock 通道全程保留。

## 需求

- `NEXT_PUBLIC_LUMEN_DATA_SOURCE=mock|sse` feature flag 双通道切换
- 三个统一 hook + `SessionIdContext`（避免深层 prop drilling 穿不过 React Flow Provider）
- SSE 客户端 `sse-client.ts` 完整实装（EventSource factory 注入点 / onEvent / onError / lastEventId）
- FastAPI 后端：`POST /api/research/start` + `GET /api/research/{id}/stream`
- SSE wire format 符合 W3C 规范（`id:` / `event:` / `data:` 三行）
- audit_log 单源协议（先 COMMIT 再推流；按 `seq` 排序，event_id UNIQUE）
- 心跳 15s 独立 Task，不写 audit_log
- session producer 锁 + 完整生命周期（started / running / completed / failed / 异常清理）
- mock 数据 backfill BaseEvent 字段；mock event_id 是 UI key 占位（不参与协议语义），用显式映射表
- SSE 双跑最小集 5 项 e2e：事件顺序 / Last-Event-ID 续传 / 错误事件 / done+report_chunk / 三 hook 端到端

## 架构变更（ADR-0002 D7/D8 约束 + Codex H4/H6 修订）

**前端新增：**
- `apps/web/src/hooks/use-research-data.ts`（新建）
- `apps/web/src/hooks/use-report-data.ts`（新建）
- `apps/web/src/hooks/use-kb-data.ts`（新建）
- `apps/web/src/lib/sse-client.ts`（新建，完整实装）
- `apps/web/src/lib/session-id-context.tsx`（新建，**Codex H4**：替代 prop drilling）
- `apps/web/src/types/research-events.ts`（新建，BaseEvent + 9 事件 TS 定义）
- `apps/web/e2e/sse-protocol.spec.ts`（新建，**Codex C1**：SSE 双跑最小集 5 项）

**前端修改：**
- `apps/web/src/lib/research-mock.ts`（backfill）
- `apps/web/src/lib/report-mock.ts`（backfill）
- `apps/web/src/components/flow/research-canvas.tsx`（接 useResearchData via Context）
- `apps/web/src/components/research/task-panel.tsx`（接 useResearchData via Context）
- `apps/web/src/components/research/bottom-active-bar.tsx`（接 useResearchData via Context）
- `apps/web/src/components/research/research-progress-page.tsx`（包 SessionIdContext.Provider）
- `apps/web/src/components/report/report-reading-page.tsx`（接 useReportData + useKbData via Context）
- `apps/web/next.config.ts`（新增 `/api/*` rewrite）
- `apps/web/playwright.config.ts`（新增 `sse` project，依赖后端 webServer）

**后端新增（apps/api/）：**
- `app/__init__.py` / `app/models/{__init__,events}.py`
- `app/core/{__init__,config,deps,sse}.py`
- `app/db/{__init__,sqlite}.py`
- `app/routers/{__init__,research}.py`
- `app/services/{__init__,langgraph_service,session_manager}.py`
- `tests/test_models_events.py` / `test_config.py` / `test_db_sqlite.py` / `test_main.py` / `test_sse_wire_format.py` / `test_session_lifecycle.py` / `test_sse_replay.py`
- `tests/fixtures/event_samples.json`（**Codex M6**：前后端 schema roundtrip 共享 fixture）

**后端修改：**
- `apps/api/main.py`（CORS 三段式 + lifespan create_tables + include router）
- `apps/api/pyproject.toml`（`uv add aiosqlite python-ulid`）

**根目录：**
- `apps/web/.env.local.example`（`NEXT_PUBLIC_LUMEN_DATA_SOURCE=mock`）
- `.env.tpl`（1Password CLI 模板）
- `README.md`（Demo Runbook 章节 + M1.0 限制说明）

## 环境前置（Environment Prerequisites）

- **Next.js dev server**：`curl -fsS http://localhost:3000/ > /dev/null && echo ok` / 修复：`cd apps/web && pnpm dev`
- **pytest**：`cd apps/api && uv run pytest --version` / 修复：`cd apps/api && uv sync --group dev`
- **aiosqlite**：`cd apps/api && uv run python -c "import aiosqlite; print('ok')"` / 修复 `uv add aiosqlite`
- **python-ulid**（**Codex H5**）：`cd apps/api && uv run python -c "from ulid import ULID; print(str(ULID()))"` / 修复 `uv add python-ulid`

## 任务依赖图

```
T0（依赖安装 + ULID import smoke）
├─ T1（TS 事件类型 + 类型 narrow 测试）
│  ├─ T2（research-mock backfill + 显式映射表）
│  └─ T3（report-mock backfill + 显式映射表）
├─ T4（Pydantic 事件模型 + roundtrip fixture 导出）
│  └─ T5（config + deps）
│     └─ T6（SQLite 数据访问层 + WAL + busy_timeout）
│        └─ T7（main.py CORS 三段式 + router 骨架）
│           └─ T8（SSE wire format + heartbeat）
│              └─ T9（LangGraph stub + POST /start + 异常路径测试）
│                 └─ T10（GET /stream + replay + Last-Event-ID 解析 + task 回收 timeout）
└─ T11（三 hook + SessionIdContext + mock event_id 映射 + roundtrip 消费 fixture）（依赖 T1+T2+T3+T4）
   └─ T12a（P2 三组件接 useResearchData via Context）
      └─ T12b（P3 组件接 useReportData + useKbData via Context）
         └─ T13（next.config.ts rewrite + sse-client 完整实装）
            └─ T15（SSE 双跑最小集 5 项 e2e specs）  ← Codex C1 新增，M1.0 验收门禁
               └─ T14（README Demo Runbook + .env.tpl + 文档级 TDD）
```

注：T15 在 T13 后、T14 前——确保 SSE 协议闭环已被 e2e 证明，再写收尾文档。

## 实现步骤

### 阶段 1：依赖与环境

### 任务 T0：安装新依赖 + ULID import smoke

**文件：** 修改 `apps/api/pyproject.toml`；新建 `apps/web/.env.local.example`

**测试规格（Codex M1：T0 必须有 RED/GREEN，不豁免）：**
- RED：`uv run python -c "from ulid import ULID; ULID()"` 当前失败（python-ulid 未装）
- GREEN：上述命令退出码 0，输出合法 26 字符 ULID 字符串
- RED：`apps/web/.env.local.example` 不存在
- GREEN：文件存在且含 `NEXT_PUBLIC_LUMEN_DATA_SOURCE=mock`

**操作：** `cd apps/api && uv add aiosqlite python-ulid`；新建 `apps/web/.env.local.example`

**验证标准：** ULID smoke 通过；env 模板存在

**审查要求：** code-reviewer（轻量）

---

### 阶段 2：前端类型层与 mock 契约对齐

### 任务 T1：TS 事件类型

**文件：** 新建 `apps/web/src/types/research-events.ts`

**测试规格：** TS 编译时 narrow 验证（写在文件顶部 `type-only` 测试），`tsc --noEmit` 不报错；包含 `BaseEvent`、`HeartbeatEvent`、9 事件 discriminated union `ResearchEvent`、`PlanNode`、`SourceRef` 辅助类型

**GREEN 实现要点：** ADR-0002 D8.2 9 种事件类型；`type` 字段用 `Literal` 区分；与 `apps/api/app/models/events.py` 字段 1:1 对应（**Codex M6**：T4 导出的 fixture 在 T11 验证 roundtrip）

**审查要求：** code-reviewer + typescript-reviewer

---

### 任务 T2：research-mock 显式映射表

**文件：** 修改 `apps/web/src/lib/research-mock.ts`；测试：229 specs 无回归

**测试规格（Codex M2：mock event_id 必须用显式映射，不是字符串模板）：**
- 新增 `MOCK_SESSION_ID = "mock-session-demo-001"` 常量
- 新增 `MOCK_NODE_TO_EVENT: Record<string, BaseEvent>` 显式映射表，每个 mock node 对应一个 BaseEvent（type 取节点状态映射，如 `web-1` → `node_completed`）
- 显式声明：mock 注入的 `event_id` **是 UI key 占位**，不参与协议语义（不进 audit_log，不参与 reducer 幂等）
- GREEN：229 specs 全绿；TS 编译无错；MOCK_NODE_TO_EVENT 类型正确

**审查要求：** code-reviewer + typescript-reviewer

---

### 任务 T3：report-mock 显式映射表

**文件：** 修改 `apps/web/src/lib/report-mock.ts`

**测试规格：** 与 T2 对称——`MOCK_REPORT_SESSION_ID`、`MOCK_REPORT_TO_EVENT` 显式映射；229 specs 全绿

**审查要求：** code-reviewer + typescript-reviewer

---

### 阶段 3：后端模型与数据库层

### 任务 T4：Pydantic 事件模型 + roundtrip fixture

**文件：** 新建 `apps/api/app/models/events.py`、`apps/api/tests/test_models_events.py`、`apps/api/tests/fixtures/event_samples.json`

**测试规格：**
- RED 1：`test_base_event_required_fields` — 缺 event_id/session_id/timestamp 抛 ValidationError
- RED 2：`test_heartbeat_no_event_id_field` — HeartbeatEvent 不含 event_id（不写 audit_log）
- RED 3：`test_all_9_event_types_instantiate` — 9 种事件均可实例化
- RED 4：`test_node_started_track_literal` — track 只接受 "web"/"kb"
- RED 5：`test_event_samples_roundtrip` — 从 `event_samples.json` 加载 9 个样本，全部 `model_validate()` 成功 + `model_dump_json()` 字段稳定（**Codex M6** 跨任务 fixture）

**GREEN 要点：**
- `BaseEvent(BaseModel, frozen=True)`：`event_id: str`、`session_id: str`、`timestamp: str`
- 8 业务事件继承 BaseEvent，`type: Literal[...]`
- `HeartbeatEvent` 独立（`type: Literal["heartbeat"]` + `serverTime: str`）
- `AnyEvent = Annotated[Union[...8 业务...], Field(discriminator="type")]`
- 导出 `apps/api/tests/fixtures/event_samples.json`（9 样本，Pydantic 序列化结果）供前端 T11 复用

**审查要求：** code-reviewer + python-reviewer

---

### 任务 T5：config + deps（pydantic-settings）

**文件：** 新建 `apps/api/app/core/config.py`、`apps/api/app/core/deps.py`、`apps/api/tests/test_config.py`

**测试规格：**
- RED：`test_settings_missing_dashscope_raises` — 未设 `DASHSCOPE_API_KEY` 时 `Settings()` 抛异常（启动快速失败）
- RED：`test_settings_db_path_explicit` — `LUMEN_DB_PATH` 必须显式（无默认值）
- GREEN：`Settings(BaseSettings)` 含 `DASHSCOPE_API_KEY: str`、`LUMEN_DB_PATH: str`、`DATA_SOURCE: Literal["mock", "sse"] = "mock"`；`get_settings()` 用 `lru_cache` 单例

**审查要求：** code-reviewer + python-reviewer + security-reviewer（env 处理）

---

### 任务 T6：SQLite 数据访问层（含 WAL + busy_timeout）

**文件：** 新建 `apps/api/app/db/sqlite.py`、`apps/api/tests/test_db_sqlite.py`

**测试规格：**
- RED 1：`test_create_tables_idempotent` — 连续调用不报错
- RED 2：`test_pragma_wal_and_busy_timeout` — 连接初始化后 `PRAGMA journal_mode` 返回 `wal`，`PRAGMA busy_timeout` 返回 5000（**Codex H6**）
- RED 3：`test_insert_and_read_audit_log` — 写一条，按 session_id + seq > 0 读回
- RED 4：`test_event_id_unique_constraint` — 同 event_id 二次插入抛 IntegrityError
- RED 5：`test_research_sessions_status_lifecycle` — created → running → completed
- RED 6：`test_concurrent_writes_no_database_locked` — 并发 5 个 audit_log 写入不抛 `database is locked`（验证 WAL + busy_timeout 配置）
- RED 7：`test_lookup_seq_by_event_id` — 按 event_id 查 seq（M1.0 Last-Event-ID 解析依赖此函数）

**GREEN 要点（Codex H6）：**
- 与 `langgraph-checkpoint-sqlite` 共库 `lumen.db`，但 audit_log/research_sessions 表前缀 `lumen_` 避免冲突
- 连接初始化执行：`PRAGMA journal_mode=WAL`、`PRAGMA busy_timeout=5000`、`PRAGMA foreign_keys=ON`
- schema：`audit_log(seq INTEGER PK AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, session_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` + `idx_audit_log_session_seq`
- `research_sessions(id TEXT PK, status TEXT NOT NULL DEFAULT 'created', created_at, updated_at)`
- 函数：`init_db()` / `insert_audit_log(conn, event)` / `read_after(conn, session_id, last_seq)` / `lookup_seq_by_event_id(conn, event_id)` / `create_session(conn, session_id)` / `update_session_status(conn, session_id, status)`

**审查要求：** code-reviewer + python-reviewer

---

### 任务 T7：FastAPI main.py + CORS 三段式

**文件：** 修改 `apps/api/main.py`、新建 `apps/api/tests/test_main.py`

**测试规格（Codex H3：CORS 拆三）：**
- RED 1：`test_health_returns_ok` — GET /health 返回 200
- RED 2：`test_cors_options_preflight_allow_last_event_id` — OPTIONS `/api/research/test/stream` + `Origin: http://localhost:3000` + `Access-Control-Request-Headers: Last-Event-ID` → 响应头含 `access-control-allow-headers: Last-Event-ID, Content-Type`
- RED 3：`test_cors_get_response_expose_last_event_id` — GET `/health` + `Origin: http://localhost:3000` → 响应头含 `access-control-expose-headers: Last-Event-ID`
- RED 4：`test_lifespan_runs_init_db` — 测试客户端启动后 audit_log 表已存在

**GREEN 要点：**
- `CORSMiddleware(allow_origins=["http://localhost:3000"], allow_methods=["GET","POST","OPTIONS"], allow_headers=["Last-Event-ID","Content-Type"], expose_headers=["Last-Event-ID"])`
- `lifespan` 异步 context manager：startup 调 `init_db()`
- include `app.routers.research:router` with prefix `/api`

**审查要求：** code-reviewer + python-reviewer

---

### 阶段 4：后端 SSE 核心协议

### 任务 T8：SSE wire format + heartbeat

**文件：** 新建 `apps/api/app/core/sse.py`、`apps/api/tests/test_sse_wire_format.py`

**测试规格：**
- RED 1：`test_format_sse_three_lines` — 输出 `id: ` / `event: ` / `data: ` 三行 + 双换行结尾
- RED 2：`test_format_sse_event_id_from_frame_not_payload` — 帧 `id:` 值 == `event.event_id`，`data` JSON 中也含 `event_id`，但浏览器读取的是帧 `id:`（断言两者相等且都存在）
- RED 3：`test_heartbeat_frame_structure` — heartbeat 帧含 `id: heartbeat-<timestamp>` + `event: heartbeat` + `data: {"type":"heartbeat","serverTime":"..."}`
- RED 4：`test_data_json_decodable` — `data:` 字段内容 `json.loads()` 不抛
- RED 5：`test_no_extra_whitespace` — 严格断言 startswith `b"id: "` 等

**GREEN 要点：**
- `format_sse(event: BaseEvent | HeartbeatEvent) -> bytes`
- `json.dumps(event.model_dump(), ensure_ascii=False, separators=(",", ":"))`
- heartbeat 的 SSE 帧 `id` 必须存在（避免重置浏览器 `lastEventId`），值用 `f"heartbeat-{server_time}"`
- 文件 ≤150 行

**审查要求：** code-reviewer + python-reviewer

---

### 任务 T9：LangGraph stub + POST /start + 异常路径

**文件：** 新建 `apps/api/app/services/langgraph_service.py`、`apps/api/app/services/session_manager.py`、`apps/api/app/routers/research.py`、`apps/api/tests/test_session_lifecycle.py`

**测试规格（Codex H1：增加异常路径）：**
- RED 1：`test_start_creates_session_running` — POST 返回 201；DB status=running
- RED 2：`test_start_duplicate_session_id_rejected` — 同 id 二次 POST 返 409
- RED 3：`test_langgraph_stub_emits_4_events` — `astream_events()` yield `plan_created` → `node_started` → `node_progress` → `node_completed`（asyncio.sleep(0.1) 间隔）
- RED 4：**新增** `test_task_exception_marks_session_failed` — stub 抛 `RuntimeError`，session.status 自动更新为 `failed`，active_runs 中移除（Codex H1）
- RED 5：**新增** `test_repeated_start_after_completion_succeeds` — session 完成后同 id POST 应允许（state=completed 可重新启动）（Codex H1）
- RED 6：**新增** `test_active_runs_cleared_on_client_disconnect_simulated` — POST start 后立即取消 task，active_runs 中该 session 应清理（Codex H1）

**GREEN 要点：**
- `SessionManager` 类：`active_runs: dict[str, asyncio.Task]`
- 每个 task 通过 `task.add_done_callback(...)` 自动清理 active_runs + 更新 DB status
- 状态机：`created → running → completed | failed | cancelled`
- 异常路径在 `done_callback` 内捕获（task.exception()）

**审查要求：** code-reviewer + python-reviewer

---

### 任务 T10：GET /stream + replay + heartbeat + Last-Event-ID 解析 + task 回收

**文件：** 修改 `apps/api/app/routers/research.py`、扩 `apps/api/app/core/sse.py`、新建 `apps/api/tests/test_sse_replay.py`

**测试规格（Codex H2 + M5）：**
- RED 1：`test_stream_returns_event_stream_content_type` — 响应 Content-Type: text/event-stream
- RED 2：`test_stream_replays_missed_events_by_event_id` — POST start，消费 2 个事件；GET stream + `Last-Event-ID: <event_2_id>` → 响应只含 event 3+（**Codex M5**：实际按 event_id 查 seq）
- RED 3：**新增** `test_stream_invalid_last_event_id_returns_400` — `Last-Event-ID: nonexistent` 返回 400（不静默从头 replay）
- RED 4：`test_stream_does_not_create_new_run` — 直接 GET（无 POST start）返 404；已有 session 重连 GET 不触发第二个 LangGraph run（active_runs 计数不变）
- RED 5：`test_heartbeat_not_in_replay` — replay 序列不含 heartbeat type
- RED 6：**新增** `test_task_lifecycle_cleanup` — 客户端断开后 5s 内 producer 和 heartbeat task 都进入 done 状态，active_runs 已清理（**Codex H2**：用 `asyncio.timeout(5)` + `len(session_manager.active_runs) == 0` 断言）

**GREEN 要点（Codex M5 + H2）：**
- `GET /api/research/{id}/stream` 处理流程：
  1. 解析 `Last-Event-ID` header（若无则 last_seq=0）
  2. 若有：`db.lookup_seq_by_event_id(last_event_id)` → 找不到返 400
  3. 创建 `asyncio.Queue`，用 `async with asyncio.TaskGroup()` 启动 producer + heartbeat 两个子 task
  4. `try`: replay seq>last_seq，再 live consume queue，遇 `done` break
  5. `finally`: TaskGroup 内部自动 cancel + await 所有子 task；`session_manager.cleanup(session_id)`
- 使用 Python 3.11+ `asyncio.TaskGroup`（自动管理子 task 异常和清理）

**审查要求：** code-reviewer + python-reviewer

---

### 阶段 5：前端 hook 抽象层 + Context

### 任务 T11：三 hook + SessionIdContext + roundtrip 验证

**文件：** 新建 `apps/web/src/hooks/use-research-data.ts`、`use-report-data.ts`、`use-kb-data.ts`、`apps/web/src/lib/session-id-context.tsx`

**测试规格：**
- RED：三个 hook 文件不存在时，T12a/T12b 编译失败
- GREEN：229 specs 全绿
- 新增前端 roundtrip 验证（**Codex M6**）：测试文件 `apps/web/src/types/__tests__/event-roundtrip.spec.ts`（Playwright spec，加载后端导出的 `event_samples.json` fixture 验证 9 事件类型 narrow 通过）

**SessionIdContext 设计（Codex H4）：**
```typescript
// session-id-context.tsx
const SessionIdContext = createContext<string | null>(null);
export const SessionIdProvider = ({ sessionId, children }: ...) => (
  <SessionIdContext.Provider value={sessionId}>{children}</SessionIdContext.Provider>
);
export const useSessionId = () => {
  const id = useContext(SessionIdContext);
  if (!id) throw new Error("useSessionId must be used within SessionIdProvider");
  return id;
};
```

**hook 签名（无 sessionId 参数，从 Context 读）：**
```typescript
export function useResearchData(): UseResearchDataResult;
export function useReportData(): UseReportDataResult;
export function useKbData(): UseKbDataResult;
```

**Mock event_id 显式映射（Codex M2）：**
- mock 通道直接返回 `MOCK_NODE_TO_EVENT` / `MOCK_REPORT_TO_EVENT` 映射的预定义 BaseEvent
- event_id 是显式字符串占位（如 `"mock-evt-web-1-completed"`）
- 不用 `useMemo` 动态生成——每次返回的对象引用已经因 mock 数据稳定而稳定

**SSE 通道（M1.0 不实装，T13 完整）：** 此任务中 SSE 通道仅返回 `{ isLoading: true, error: null, ... }` 占位，T13 实装 sse-client 后再补全。

**审查要求：** code-reviewer + typescript-reviewer

---

### 阶段 6：前端组件接入

### 任务 T12a：P2 三组件接 useResearchData via Context

**文件：** 修改 `apps/web/src/components/research/research-progress-page.tsx`（包 SessionIdProvider）、`apps/web/src/components/flow/research-canvas.tsx`、`apps/web/src/components/research/task-panel.tsx`、`apps/web/src/components/research/bottom-active-bar.tsx`

注：4 文件改动超 1-3 限制，但这是「Provider 包装 + 三个消费者改 import」的同模式工作，且 ResearchProgressPage 仅加 1 行 Provider 包装（极轻），符合「逻辑上单一职责」例外。如评审认为风险大，可先改 ResearchProgressPage（独立任务），再 T12a 改三组件。

**测试规格：**
- RED：`grep -n "MOCK_NODES\|MOCK_EDGES\|MOCK_TASKS" apps/web/src/components/{research,flow}/*.tsx` 应输出空（除 mock 文件本身）
- GREEN：229 specs P2 系列全绿（T3/T4/T5/T6/T7/T8/T9 ~100 specs）

**GREEN 要点（Codex H4）：**
- `ResearchProgressPage` 在内部包 `<SessionIdProvider sessionId={sessionId}>...</SessionIdProvider>`
- 三个子组件移除 `MOCK_NODES`/`MOCK_EDGES`/`MOCK_TASKS` 直接 import
- 改用 `const { nodes, edges, tasks, activeNode } = useResearchData()`（hook 内部读 Context）
- `ResearchCanvas` 内的 React Flow Provider 在 SessionIdProvider 内部，子组件可读 sessionId

**审查要求：** code-reviewer + typescript-reviewer

---

### 任务 T12b：P3 组件接 useReportData + useKbData via Context

**文件：** 修改 `apps/web/src/components/report/report-reading-page.tsx`

**测试规格：**
- RED：`grep MOCK_REPORT apps/web/src/components/report/*.tsx` 输出空
- GREEN：229 specs P3 系列全绿（T2-T8 ~70 specs）

**GREEN 要点：**
- `ReportReadingPage` 包 `<SessionIdProvider sessionId={sessionId}>...</SessionIdProvider>`
- 内部子组件改用 `useReportData()` / `useKbData()`
- isLoading 时渲染骨架占位

**审查要求：** code-reviewer + typescript-reviewer

---

### 阶段 7：Next.js rewrite + SSE 客户端完整实装

### 任务 T13：next.config.ts rewrite + sse-client 完整实装（Codex C1 升级）

**文件：** 修改 `apps/web/next.config.ts`、新建 `apps/web/src/lib/sse-client.ts`

**测试规格（Codex C1：sse-client 不再是骨架）：**
- RED 1：`createSseClient(url, options)` 接受 `{ eventSourceFactory?: typeof EventSource, onEvent, onError, lastEventId? }` 参数
- RED 2：`client.start()` 通过注入的 factory 创建 EventSource，listener 转发到 `onEvent`
- RED 3：注入 mock EventSource（`vi.stubGlobal` 等价的 factory 注入）emit 假事件，`onEvent` 被调用
- RED 4：客户端检测到 `data.type === "done"` 自动 close
- RED 5：60s 内无事件触发 `client.reconnect()`（用 fake timers）
- RED 6：`processedEventIds: Set<string>` 拦截重复 event_id
- RED 7：错误重连指数退避 1→2→4→8→16s（fake timers 验证）
- RED 8：5 次失败触发 `onFatalError`

**GREEN 要点（Codex C1）：**
- 完整实装（不是骨架）
- `eventSourceFactory` 默认 `globalThis.EventSource`，测试时注入 mock
- 不依赖 MSW（Codex 明确指出 MSW 2.x SSE 支持不稳）
- 文件无 module-level 副作用
- `next.config.ts` 加 `async rewrites() { return [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }]; }`

**hook SSE 通道补全（在此任务一并完成）：**
- 三个 hook SSE 通道接入 sse-client，状态机管理 nodes/edges 实时更新
- reducer 级幂等：按 event_id 去重

**审查要求：** code-reviewer + typescript-reviewer

---

### 阶段 8：SSE 双跑最小集 e2e（Codex C1：M1.0 验收门禁）

### 任务 T15：SSE e2e 双跑最小集 5 项

**文件：** 新建 `apps/web/e2e/sse-protocol.spec.ts`、修改 `apps/web/playwright.config.ts`（新增 `sse` project）

**测试规格（5 项最小集）：**
- SSE-1（事件顺序）：访问 `?source=sse`，等接收 plan_created → node_started → node_progress → node_completed，对应节点 state class 依次 planning → retrieving → completed
- SSE-2（Last-Event-ID 续传）：用 Playwright `page.routeWebSocket` 等价机制中断 SSE，验证重连请求头含 `Last-Event-ID`，且收到的事件 seq > 断点
- SSE-3（错误事件渲染）：后端测试端点注入 `error` 事件，前端 error UI 出现
- SSE-4（done + report_chunk）：接收 report_chunk 序列 + done，跳转报告页或 report 内容出现
- SSE-5（三 hook 端到端冒烟）：三 hook 在 sse 模式下成功返回数据（非 loading）

**GREEN 要点：**
- Playwright config 新增 `sse` project：`use: { baseURL: "http://localhost:3000" }`
- webServer 同启前端（3000）+ 后端（8000）
- SSE-2 实现：通过 Playwright `route` 拦截 SSE EventSource 请求强制 close
- SSE-3 实现：后端通过环境变量 `LUMEN_STUB_INJECT_ERROR=1` 在 stub 中提前 yield error 事件

**审查要求：** code-reviewer + typescript-reviewer

---

### 阶段 9：收尾文档（含文档级 TDD）

### 任务 T14：README Demo Runbook + .env.tpl + workers=1 强约束（Codex M1/M4/L1）

**文件：** 修改 `README.md`、新建 `.env.tpl`、新建 `apps/api/tests/test_runbook_smoke.py`

**测试规格（Codex M1：T14 也走 TDD）：**
- RED 1：`test_env_tpl_required_keys` — 解析 `.env.tpl` 含 `DASHSCOPE_API_KEY`、`LUMEN_DB_PATH`、`NEXT_PUBLIC_LUMEN_DATA_SOURCE` 三个 key
- RED 2：`test_env_tpl_no_real_secrets` — 解析每行值都以 `op://...` 或空字符串开头（无明文 secret）
- RED 3：`test_readme_runbook_section_exists` — `README.md` 含 `## Demo Runbook (M1.0)` heading
- RED 4：`test_readme_workers_1_constraint` — runbook 中包含 `--workers 1` 字符串（**Codex M4**：强约束）
- RED 5：`test_readme_m1_0_limit_section` — runbook 含 "M1.0 限制" 段落，明确说明 P1 输入框 M1.A 才接 API（**Codex L1**）

**GREEN 要点：**
- README 新增 `## Demo Runbook (M1.0)` 章节，5 步 bash + workers=1 强约束
- 新增 "M1.0 限制" 子段：列出 P1 输入框点击启动当前不接 API，验证 SSE 协议骨架请用 `curl` 直连 `POST /api/research/start` + `GET /api/research/{id}/stream`
- `.env.tpl` 含 1Password 引用模板（无明文）

**审查要求：** code-reviewer + python-reviewer

---

## 测试策略

- **后端单元测试**（pytest + httpx）：T4-T10 共 7 个 test 文件，覆盖率 ≥80%
- **前端 E2E 测试**（Playwright）：229 mock specs（T2/T3/T11/T12a/T12b 验证）+ 5 项 SSE specs（T15）
- **类型检查**（tsc --noEmit）：T1/T11/T13
- **跨任务 fixture roundtrip**（Codex M6）：T4 导出 `event_samples.json`，T11 加载验证类型一致性
- **TDD 全覆盖**（Codex M1）：T0/T14 也有 RED/GREEN，无豁免任务

## 风险与缓解

- **风险**：mock event_id 跨 render 不稳定（Codex M2）
  - 缓解：T11 用显式映射表替代字符串模板，每个 mock 节点对应固定 BaseEvent

- **风险**：MSW 2.x SSE EventSource 拦截不稳（Codex C1）
  - 缓解：T13 改用 `eventSourceFactory` 注入点，sse-client 测试用 mock factory；不依赖 MSW

- **风险**：sessionId prop drilling 穿不过 React Flow Provider（Codex H4）
  - 缓解：用 SessionIdContext，由 page 层包装 Provider

- **风险**：aiosqlite 与 langgraph-checkpoint-sqlite 共库 `database is locked`（Codex H6）
  - 缓解：T6 显式 PRAGMA WAL + busy_timeout=5000；表名前缀 `lumen_` 避免与 checkpoint 表冲突；并发写测试覆盖

- **风险**：asyncio.Task 异常退出泄漏（Codex H1/H2）
  - 缓解：T9 用 `task.add_done_callback` 自动清理；T10 用 `asyncio.TaskGroup`（Python 3.11+）；T9/T10 测试覆盖异常路径

- **风险**：CORS 配置在 simple GET / OPTIONS preflight / stream 行为分歧（Codex H3）
  - 缓解：T7 测试拆三

- **风险**：Last-Event-ID 是 event_id 不是 seq（Codex M5）
  - 缓解：T6 提供 `lookup_seq_by_event_id`；T10 GREEN 明确解析协议；找不到返 400

- **风险**：T0 ULID PyPI 包混淆（Codex H5）
  - 缓解：T0 加 import smoke 验证 `from ulid import ULID`

- **风险**：M1.0 验收过松导致协议骨架未真正闭环（Codex C1）
  - 缓解：T15 SSE 双跑最小集纳入 M1.0 必做，不允许推迟

## Scope Out 清单（M1.0 不做）

| 项目 | 理由 | 计划阶段 |
|------|------|---------|
| LLM 实际调用（DashScope / qwen-max） | LangGraph stub 推假事件即可验证管道 | M1.A |
| ChromaDB 接入（私有 KB 向量检索） | ADR-0001 D5 明确 M1.0 仅 SQLite | M1.B |
| F4 冲突标注业务逻辑 | 需要 LLM + 真实数据 | M1.B/C |
| `ingest_kb.py` / `replay_session.py` 脚本 | 依赖 ChromaDB / Demo 准备 | M1.B / Demo Day -1 |
| D9 Cloudflare Tunnel 实际配置 | 部署相关，演讲前 1 天 | Demo Day -1 |
| ADR-0002 D8.7 schema drift 防护 codegen | 演化超 2 次再引入 | 待办 |
| 前端 P1 输入框 → POST /start 接入 | M1.A 工作（Codex L1 已记录在 README runbook） | M1.A |
| 多 worker 部署 | ADR-0001 D5 硬约束 workers=1 | 永不（M1.0 README runbook 强约束） |

## 验收标准（M1.0 完成定义）

- [ ] `NEXT_PUBLIC_LUMEN_DATA_SOURCE=mock` 下 229 specs 全绿，无回归
- [ ] **`NEXT_PUBLIC_LUMEN_DATA_SOURCE=sse` 下 5 项 SSE 最小集 e2e 全绿（T15，Codex C1 验收门禁）**
- [ ] 三个前端 hook 通过 SessionIdContext 消费（Codex H4）
- [ ] mock 通道用显式 BaseEvent 映射表（Codex M2）
- [ ] sse-client 完整实装含 EventSource factory 注入点（Codex C1）
- [ ] 后端 SQLite WAL + busy_timeout=5000，并发写无 locked 错误（Codex H6）
- [ ] CORS 三段式测试覆盖 simple GET / OPTIONS preflight / stream 响应头（Codex H3）
- [ ] Last-Event-ID 按 event_id 查 seq，找不到返 400（Codex M5）
- [ ] task lifecycle cleanup 测试通过（Codex H2）
- [ ] session 异常路径测试覆盖（task 异常 / 客户端断开 / 重复 start）（Codex H1）
- [ ] 后端 pytest 覆盖率 ≥80%
- [ ] mypy --strict 无错；ruff check 无错
- [ ] README Demo Runbook 含 workers=1 强约束 + M1.0 限制说明（Codex M4/L1）
- [ ] T0/T14 也走 TDD，无豁免（Codex M1）
- [ ] T4 fixture event_samples.json 与前端 T11 roundtrip 验证通过（Codex M6）
