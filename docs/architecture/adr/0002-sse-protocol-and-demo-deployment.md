# 0002 — SSE 协议、Mock 桥接、Demo 部署

## 状态

已批准

## 日期

2026-05-07

## 决策类型

L2 标准评估

## 决策者

项目所有者（dengdi）

## 上下文

ADR-0001 一次性确立 6 项基线决策（D1–D6），覆盖代码组织、SSE 通信契约（schema 层面）、LangGraph 持久化、检索抽象、数据存储、模型 Provider。但留下 3 项关键留白：

- **L1**：前端已交付 S2 P1 + P2 + P3 三页面骨架（mock 数据，229 e2e PASS、axe 0 critical/serious）。后端目前仅有 FastAPI 空骨架（`/health` 端点 + `pyproject.toml` 已就位）。从 mock 数据切换到 SSE live 数据缺乏明确的工程路径。
- **L2**：ADR-0001 D6 提供了 LLM 层多级兜底（L0–L3），但 SSE 长连接自身的错误恢复、超时、重连协议未规定。R1 Critical（SSE schema 漂移）+ R3 High（DashScope Demo 不稳）需要在协议层补足缓解措施。
- **L3**：本地 dev 启动命令已明确（`uvicorn --workers 1`），但 Demo 当天的部署形态、env 注入方式、网络异常兜底未规定。

本 ADR 一次性确立 D7 / D8 / D9 三项决策，并对 ADR-0001 D2 的 SSE schema 做兼容性扩展（修订记录见末尾章节）。

**审查过程**：方案经 Claude 推导（architect skill 阶段 1–3）+ Codex 跨模型对抗性审查（design-review-codex skill）双重校核，共 13 项发现（2 CRITICAL + 5 HIGH + 5 MEDIUM + 1 LOW）已全部纳入决策。

## 决策

### D7 — mock→SSE 切换：feature flag 双通道并行维护

引入环境变量 `NEXT_PUBLIC_LUMEN_DATA_SOURCE=mock|sse`（默认 `mock`）。组件不再直接 import mock 文件，改为消费统一 hook：

```
apps/web/src/hooks/use-research-data.ts
apps/web/src/hooks/use-report-data.ts
apps/web/src/hooks/use-kb-data.ts
```

hook 内部根据 env dispatch 到 mock 实现或 SSE 客户端（`apps/web/src/lib/sse-client.ts`）。两通道返回类型为同一 TypeScript discriminated union，禁止「各自适配」。

#### D7.1 Mock 契约对齐（Codex H4）

Mock 数据必须补齐 BaseEvent 字段（`event_id` / `session_id` / `timestamp`，定义见 D8.2）。`research-mock.ts` / `report-mock.ts` / `kb-document-mock` 现有 fixture 必须 backfill 这些字段，否则 mock 模式 e2e 通过但 SSE 模式必然失败。

#### D7.2 e2e 双跑最小集（Codex H5）

229 specs 不全部双跑。SSE 模式专项 specs 必须覆盖以下 5 项最小集：

1. 事件顺序（`plan_created` → `node_started` → `node_progress` → `node_completed`）
2. 断线重连（强制 `EventSource.close()` + 验证 `Last-Event-ID` 续传）
3. 错误事件渲染（`error` type 触发的 UI 状态）
4. `done` + `report_chunk` 增量渲染
5. 三个 hook 端到端冒烟（`use-research-data` / `use-report-data` / `use-kb-data`）

其余 specs 仅 mock 模式跑，由 hook 层的契约对齐保证语义不漂移。

#### D7.3 保留 mock 通道的价值

- e2e 不依赖后端进程，CI 矩阵简单
- Demo 异常一键 fallback：URL 加 `?source=mock`
- 联调期间双源对照排错（前端 bug vs 后端 bug 二分）

接受双通道维护成本，换取上述三项收益。

---

### D8 — SSE 错误/重试/超时：服务端心跳 + 客户端 idempotency

#### D8.1 SSE wire format（Codex C1 必修）

每条事件（含 heartbeat）必须按 W3C SSE 规范输出三行：

```
id: <event_id>
event: <type>
data: <json_payload>

```

理由：浏览器 EventSource 自动重连依赖 SSE 帧的 `id:` 字段，**不**读 JSON `data.event_id`。如不显式输出 `id:`，断线重连后 `Last-Event-ID` 头将为空，replay 起点错误。

后端必须有 unit test 断言原始帧格式（`apps/api/tests/test_sse_wire_format.py`）。

#### D8.2 BaseEvent 字段扩展（修订 ADR-0001 D2）

```typescript
interface BaseEvent {
  event_id: string;       // ULID — 仅作幂等键，不依赖单调性（D8.3 用 seq）
  session_id: string;     // 对应 SQLite research_sessions.id
  timestamp: string;      // ISO 8601 UTC
}
```

ADR-0001 D2 原 8 事件类型全部继承 `BaseEvent`。新增第 9 事件类型：

```typescript
| { type: "heartbeat"; serverTime: string }   // 仅服务端→客户端，不写 audit_log
```

TS 类型在 `apps/web/src/types/research-events.ts`，对应 Pydantic 模型在 `apps/api/app/models/events.py`。双向同步靠纪律 + 单测对照，维持 ADR-0001 D2 现行约束。

#### D8.3 audit_log 单源协议（Codex H1 + H2 + M1）

`audit_log` 表 schema：

```sql
CREATE TABLE audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,    -- replay 排序唯一依据
  event_id TEXT UNIQUE NOT NULL,            -- 幂等键
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,                    -- JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_log_session_seq ON audit_log(session_id, seq);
```

ULID 仅作幂等键，**不**用作排序依据（同毫秒事件 + 时钟回拨场景 ULID 不可靠）。所有排序按 `seq` 进行。

**单源发送协议**：服务端事件必须**先**写入 audit_log（COMMIT），**再**从 audit_log cursor 读取并写入 SSE 响应流。禁止「同时写两边」——前者会出现客户端见过但 DB 没记录的不可恢复缺口。

**重连 replay 协议**：客户端用 SSE 帧 `id:` 字段携带最近 event_id，浏览器自动在重连请求头中发送 `Last-Event-ID`。后端：

```python
last_event_id = request.headers.get("Last-Event-ID")
last_seq = (
    await db.fetchval("SELECT seq FROM audit_log WHERE event_id = ?", last_event_id)
    if last_event_id else 0
)
# 发送 seq > last_seq 的所有事件，再切换到 live 订阅
```

heartbeat 事件**不**写入 audit_log（noise，且 replay 无意义）。

#### D8.4 Session producer 锁（Codex C2 必修）

`research_sessions` 表新增 `status` 字段，状态机：

```
created → running → completed | failed
```

`session_id` 在 SQLite 已通过 PRIMARY KEY 唯一约束。同一 `session_id` 仅允许一个 LangGraph run 实例：

- `POST /api/research/start` → 创建 session（status=`created`），启动 LangGraph run（status=`running`），返回 session_id
- `GET /api/research/{id}/stream` → 仅 replay + subscribe，**禁止**启动新 run
- LangGraph run 通过 `asyncio.Task` 跟踪，存于进程内 `active_runs: dict[session_id, asyncio.Task]`
- session 终止（done/error/cancelled）时清理 `active_runs[session_id]`，更新 status

避免重连端点意外触发第二个 LangGraph run 导致双执行 / 双计费 / 双推送。

#### D8.5 heartbeat 与 LangGraph 解耦（Codex H3）

后端用两个独立 `asyncio.Task` 通过 `asyncio.Queue` 汇合：

```python
async def stream_session(session_id: str, last_seq: int) -> AsyncIterator[bytes]:
    queue: asyncio.Queue[Event] = asyncio.Queue()

    # producer：消费 LangGraph，先写 DB 再入 queue
    async def producer():
        async for ev in langgraph_service.astream_events(session_id):
            await audit_log.insert(ev)        # commit 先
            await queue.put(ev)

    # heartbeat：固定 15s 节奏，独立 Task，不写 DB
    async def heartbeat():
        while True:
            await asyncio.sleep(15)
            await queue.put(make_heartbeat())

    # replay：先消费历史 seq > last_seq
    async for ev in audit_log.read_after(session_id, last_seq):
        yield format_sse(ev)

    # live：producer + heartbeat 并行
    tasks = [asyncio.create_task(producer()), asyncio.create_task(heartbeat())]
    try:
        while True:
            ev = await queue.get()
            yield format_sse(ev)
            if ev.type == "done": break
    finally:
        for t in tasks: t.cancel()
```

确保 LangGraph 长节点（Web 检索、LLM 总结，单节点可能 >60s）阻塞 producer 时心跳仍持续发送，前端不会误重连。

#### D8.6 客户端策略

- `processedEventIds: Set<string>`（reducer 级幂等）：reducer 按 `event_id` 检查重复，重复事件不 dispatch
- 60s 内无任何事件（含 heartbeat）→ `EventSource.close()` + reconnect
- 网络层错误（503/connection refused）：指数退避 1s → 2s → 4s → 8s → 16s（上限）
- 重连失败 5 次 → 全局 error toast + 推荐 URL `?source=mock`

刷新 / tab discard 后内存 Set 丢失：依赖 reducer 业务幂等性而非客户端去重（重复 `report_chunk` 在 reducer 内按 event_id 去重，不重复 append）。不引入 sessionStorage cursor，理由：1 人 Demo 场景不演示刷新路径。

#### D8.7 Schema drift 防护（Codex L1，标注待办）

本 ADR 修订 D2 加重了 R1（schema 漂移）风险面。当前不引入 OpenAPI/AsyncAPI codegen，理由是 1 人 30 天预算。**待办**：未来 SSE schema 演化超过 2 次，引入单源 schema 生成或至少 CI 校验 TS/Pydantic 事件枚举一致性。本 ADR 的修订日志（末尾）兼任 schema 演化次数计数器。

---

### D9 — Demo 部署最小路径：全本地 + Cloudflare Tunnel 局域兜底

#### D9.1 主路径

演讲笔记本（macOS）同时跑：

| 进程 | 命令 | 端口 |
|---|---|---|
| 前端 | `pnpm --filter web dev` | 3000 |
| 后端 | `uvicorn main:app --workers 1 --host 127.0.0.1 --port 8000` | 8000 |
| ChromaDB | embedded（文件 `apps/api/data/chroma/`） | — |
| SQLite | 文件 `apps/api/data/lumen.db` | — |

演讲场景：HDMI 连投影，浏览器访问 `http://localhost:3000`。

#### D9.2 Env 注入（Codex M4 离线兜底）

主路径：1Password CLI `op inject -i .env.tpl -o .env.local`。

**离线 fallback**：演讲前 1 小时强制执行一次 `op inject`，secrets 物化到 `.env.local`。后续 `pnpm dev` / `uvicorn` 启动直接读本地文件，**不依赖**运行时 1Password session 状态。runbook 加 smoke step：

```bash
# 演讲前预检
test -s .env.local || { echo "ERR: .env.local missing"; exit 1; }
grep -q DASHSCOPE_API_KEY .env.local || { echo "ERR: DASHSCOPE_API_KEY missing"; exit 1; }
```

#### D9.3 Cloudflare Tunnel 故障域限定（Codex M3 + M5）

**故障域**：cloudflared tunnel 仅覆盖「演讲笔记本本机正常 + 出口网络正常 + 局域投影/局域网异常」。

**不覆盖**：演讲笔记本本机出口断网。后者由两层数据兜底覆盖：
- ADR-0001 D6 L3：SQLite `audit_log` 重放，演讲前 1 天预跑完整流程
- 预录屏视频：极端场景（笔记本完全死机）

#### D9.4 Named Tunnel 预配置（演讲前 1 天）

避免演讲前才创建 tunnel 的 DNS 传播延迟（Codex 附录 LOW）：

```bash
cloudflared tunnel create lumen-demo                    # 演讲前 1 天
cloudflared tunnel route dns lumen-demo lumen-demo.<my-domain>
```

`~/.cloudflared/config.yml`：

```yaml
tunnel: <tunnel-uuid>
credentials-file: ~/.cloudflared/<uuid>.json
ingress:
  - hostname: lumen-demo.<my-domain>
    path: /api/*
    service: http://localhost:8000
  - hostname: lumen-demo.<my-domain>
    service: http://localhost:3000
  - service: http_status:404
```

演讲前 10 分钟启动：`cloudflared tunnel run lumen-demo`。备用 URL `https://lumen-demo.<my-domain>` 经过 SSE smoke test 验证（D9.6）。

#### D9.5 前端 API base URL 相对路径

前端 SSE 客户端使用相对路径 `/api/research/...`，**不**硬编码 `http://localhost:8000`。Tunnel 模式下 ingress 自动路由，与 localhost 行为一致。Next.js dev rewrites 配置：

```ts
// apps/web/next.config.ts
async rewrites() {
  return [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }];
}
```

#### D9.6 启动 runbook（根目录 README.md 新增章节）

按顺序执行：

```bash
# 1. Env 注入（1Password 在线时执行；离线则跳过，使用上次缓存）
op inject -i .env.tpl -o .env.local || echo "WARN: using cached .env.local"

# 2. 启动后端
cd apps/api && uv run uvicorn main:app --workers 1 --host 127.0.0.1 --port 8000 &

# 3. 启动前端
pnpm --filter web dev &

# 4. 启动 cloudflared（仅演讲前）
cloudflared tunnel run lumen-demo &

# 5. Smoke test
curl -fsS http://localhost:8000/health || exit 1
curl -fsS http://localhost:3000/ | grep -q "Lumen" || exit 1
curl -fsS -N --max-time 20 http://localhost:8000/api/research/ping/stream | head -c 100 || exit 1
```

## 备选方案

### D7 备选

| 候选 | 拒绝理由 |
|---|---|
| 直接替换 mock，e2e 用 MSW 拦截网络层 | e2e 失去运行时 mock 通道；切换期 229 specs 一次性失效；Demo 异常无快速 fallback |
| 后端 `--mock-mode` 启动从 SQLite `audit_log` 重放 | 与 ADR-0001 D6 L3 重叠；前端 e2e 仍需启动后端进程，CI 复杂度上升 |

### D8 备选

| 候选 | 拒绝理由 |
|---|---|
| 单纯依赖 EventSource 默认 3s 重连，不加心跳/event_id | 长沉默检测不到死连接；重连后 LangGraph 从 checkpoint 重跑会推送重复节点状态，前端节点会「闪回」 |
| 退回 long-polling | 实时性差，违背 ADR-0001 D2；前端节点动画体验劣化 |
| 用 ULID 单调性做 replay 排序 | ULID 同毫秒 + 时钟回拨不可靠（Codex M1）；DB 自增 seq 更简单更稳 |
| 「同时写 audit_log + 响应流」 | 不可恢复缺口（Codex H1）；先 commit 再发流是唯一可恢复顺序 |
| 前端用 sessionStorage 持久化 cursor | 增加客户端状态机复杂度；reducer 级幂等已足以覆盖 1 人 Demo 场景 |

### D9 备选

| 候选 | 拒绝理由 |
|---|---|
| 容器化部署到 Render / Fly.io | 30 天 Demo 项目额外配置成本；ChromaDB embedded 多实例限制更难管；演讲依赖外部服务可达性增加故障点 |
| 仅本地 + 备录屏（不做 tunnel） | 与 ADR-0001 D6 L3 SQLite 重放重叠；不解决局域投影异常 |
| 1Password CLI 运行时注入（无离线缓存） | 演讲笔记本断网或 1Password session 过期时 secrets 不可用，启动链路脆弱（Codex M4） |

## 理由

D7 + D8 + D9 共同遵循 ADR-0001 的决策风格：「本地化、最简化、显式兜底」。

D8 在 Codex 审查后做了大量协议细化（SSE wire format / 单源 audit_log / session producer 锁 / heartbeat 解耦 / DB seq 排序），看似复杂度上升，但本质是把「可能漂移的隐式协议」改为「显式、可测、可恢复的协议」。这与 ADR-0001 R1 Critical（schema 漂移）+ R3 High（API 不稳）的风险等级匹配——协议在风险高的部位就该写得严格。

D7 双通道是 1 人 Demo 项目的工程权衡：维护两个数据通道的成本，换取「e2e 不依赖后端 + Demo 一键 fallback + 联调二分排错」三项杠杆收益。任一收益单独看都值，叠加更值。

D9 的 cloudflared 故障域明确化（仅局域兜底，不覆盖出口断网），避免了「以为兜底了实际没兜底」的虚假安全感。出口断网这种极端场景由 ADR-0001 D6 L3 + 预录屏视频覆盖，与 D9 形成「网络层（cloudflared）+ 数据层（SQLite 重放）+ 视频层（录屏）」三层正交兜底。

## 影响

**正面**：

- 前端从 mock 到 SSE live 数据切换路径明确，可分阶段推进（hook 抽象先、SSE 客户端后、组件接入最后），不破坏 229 e2e specs
- SSE 协议显式、可测、可恢复（断线重连、长节点阻塞、并发竞态全部有协议级答案）
- Demo 部署有完整 runbook，三层兜底正交覆盖不同故障域
- ADR-0001 D2 schema 修订路径合规（本 ADR 登记修订记录），R1 Critical 风险面在协议层得到二次缓解
- D8 的 audit_log 单源协议自然支持 ADR-0001 D6 L3 SQLite 重放，两 ADR 设计互相加强

**负面/约束**：

- D7 双通道维护成本：mock 数据必须 backfill BaseEvent；hook 抽象层要严守边界
- D8 增加后端复杂度：`asyncio.Task` + `asyncio.Queue` + 单源 audit_log 协议要严格实现，不能简化为「同时写两边」
- ADR-0001 D2 schema 演化次数 +1（本 ADR 是第 1 次修订）；演化超过 2 次需引入 codegen 或 CI 校验（D8.7）
- D9 依赖外部 CLI（1Password CLI、cloudflared），笔记本环境必须预装；演讲前 1 天必须完成 Named Tunnel 配置

**模块变更**：

- 新增 `apps/web/src/hooks/`：`use-research-data.ts` / `use-report-data.ts` / `use-kb-data.ts`
- 新增 `apps/web/src/lib/sse-client.ts`
- 修改 6+ 组件 import 路径：`BottomActiveBar` / `TaskPanel` / `ResearchCanvas` / `ReportMarkdownCanvas` / `KbDocumentList` / `CitationPanel`
- 新增 `apps/api/app/`：`routers/research.py` / `core/sse.py` / `core/config.py` / `core/deps.py` / `models/events.py` / `services/langgraph_service.py` / `services/retriever.py` / `db/sqlite.py` / `db/chroma.py`
- 新增 `apps/api/scripts/ingest_kb.py` / `apps/api/scripts/replay_session.py`
- 新增 `apps/api/tests/test_sse_wire_format.py` / `test_sse_replay.py` / `test_session_lifecycle.py`
- 新增根目录 `.env.tpl` + README Demo runbook 章节
- 新增 `~/.cloudflared/config.yml`（用户家目录，不入库）

**数据模型变更**（修订 ADR-0001 D5）：

- `audit_log` 表 schema 扩展：新增 `seq INTEGER PRIMARY KEY AUTOINCREMENT` 列；`event_id` 加 `UNIQUE` 约束；新增 `idx_audit_log_session_seq` 索引
- `research_sessions` 表 schema 扩展：新增 `status TEXT NOT NULL DEFAULT 'created'` 列

**API 变更**（修订 ADR-0001 D2）：

- 所有 8 个事件类型继承 `BaseEvent`（`event_id` / `session_id` / `timestamp`）
- 新增第 9 事件类型 `heartbeat`
- 新增 HTTP 端点：`POST /api/research/start` / `GET /api/research/{id}/stream`

**风险**：

- R1（schema 漂移）—— 本 ADR 的 D2 修订使 schema 复杂度上升；已通过 D8.7 待办标注 + 修订日志计数器机制管理
- R8 新增 Medium：`asyncio.Task` 生命周期管理在异常退出时可能泄漏 —— 通过 `try/finally` + 集成测试覆盖
- R9 新增 Low：1Password CLI / cloudflared 演讲笔记本预装依赖 —— 通过 D9.6 runbook 预检步骤管理

**对后续迭代影响**：

- F8（私有 KB Connector，P0）的 ChromaDB 接入直接消费 D8 协议
- F4（冲突标注，P0）的 `conflict_detected` 事件在 D8 单源协议下天然可重放
- 未来如真要接 F9 KB 文档列表 active 联动 SSE，hook 已就位（D7 hook 设计已预留扩展点）
- 若 schema 演化超过 2 次（D8.7），引入 codegen 是下一个 ADR 候选

## 关联 ADR

- **修订**：[ADR-0001 D2 SSE schema](0001-lumen-baseline-architecture.md#d2)（扩展 BaseEvent 字段 + 新增 heartbeat 第 9 事件）
- **修订**：[ADR-0001 D5 数据存储 schema](0001-lumen-baseline-architecture.md#d5)（audit_log 加 seq；research_sessions 加 status）
- **不替代**：[ADR-0001 D6 L3 SQLite 重放](0001-lumen-baseline-architecture.md#d6)；本 ADR D9 与 L3 形成正交兜底（网络层 + 数据层）

## 修订记录

| 日期 | 修订内容 | 影响 ADR |
|---|---|---|
| 2026-05-07 | 初版批准；登记 ADR-0001 D2 SSE schema 第 1 次扩展（BaseEvent + heartbeat）；登记 ADR-0001 D5 audit_log/research_sessions schema 扩展 | ADR-0001 D2 / D5 |

## 参考资料

- [ADR-0001 Lumen 基线架构](0001-lumen-baseline-architecture.md)
- [产品定义 docs/product/lumen.md](../../product/lumen.md)
- W3C Server-Sent Events 规范：https://html.spec.whatwg.org/multipage/server-sent-events.html
- LangGraph `astream_events` 文档：https://langchain-ai.github.io/langgraph/
- Cloudflare Named Tunnel 文档：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- Codex 跨模型审查（design-review-codex skill 执行记录，见对话日志）
