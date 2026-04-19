# 0001 — Lumen 基线架构

## 状态

已批准

## 日期

2026-04-19

## 决策类型

L2 标准评估

## 决策者

项目所有者（dengdi）

## 上下文

Lumen 是面向咨询顾问的 Agentic Deep Research 工作台，核心差异化是"公开轨 + 私有轨双轨混合检索 + 跨源验证冲突标注 + 完整证据链报告"。详见 `docs/product/lumen.md`。

**硬约束**：
- 1 人开发 / 30 天交付 / Demo 导向（公司 AI 竞赛）
- 开发者前端经验为零，依赖 Claude Code 辅助
- 技术栈已锁定：Next.js 15 + FastAPI + LangGraph + ChromaDB（本地）+ Qwen-Max/DashScope + Firecrawl + LangSmith
- 数据本地不出境
- 评判维度：Demo 视觉冲击 × 溯源/冲突标注的工程深度

**关键风险**（架构需主动缓解）：
- R1 Critical：SSE 事件 schema 前后端漂移 → React Flow 渲染异常
- R2 Critical：F4 冲突标注在 Demo 问题上不稳定触发
- R3 High：DashScope API Demo 当天不稳定
- R4 High：LangGraph fork delta 引入 regression
- R5 Medium：React Flow 双轨布局视觉混乱
- R6 Medium：引用追溯 <500ms 不达标
- R7 Medium：ChromaDB embedded 多 worker 并发

## 决策

本 ADR 一次性确立 6 项基线架构决策。每项均经过候选方案比选，最终采纳推荐方案。

### D1：代码组织——单仓库分目录（无 workspace 工具）

`apps/web/`（Next.js 15）+ `apps/api/`（FastAPI + uv）+ 根目录 `README.md` 说明启动命令。不引入 pnpm workspaces / Turborepo。理由：1 人 30 天 Demo 项目，workspace 工具的优势用不上，配置成本反而拖慢交付。

### D2：前后端通信——FastAPI SSE（HTTP/1.1）

采用 SSE 单向推送，FastAPI `StreamingResponse` + `asyncio` 对接 LangGraph `astream_events`。前端 EventSource 原生支持自动重连，Vercel AI SDK 兼容。不采用 WebSocket（双向能力浪费）和 Server Actions+轮询（实时性差）。

**SSE 事件 schema**（前后端契约冻结，缓解 R1）：

```typescript
type ResearchEvent =
  | { type: "plan_created"; nodes: PlanNode[] }
  | { type: "node_started"; nodeId: string; track: "web" | "kb" }
  | { type: "node_progress"; nodeId: string; message: string }
  | { type: "node_completed"; nodeId: string; sources: SourceRef[] }
  | { type: "conflict_detected"; conflictId: string; description: string }
  | { type: "report_chunk"; content: string }
  | { type: "done"; reportId: string }
  | { type: "error"; message: string }
```

TS 类型手写于 `apps/web/src/types/research-events.ts`，与 FastAPI Pydantic 模型一一对应。任何变更需双向同步并写入本 ADR 的修订记录。

### D3：LangGraph 状态持久化——SQLite Checkpointer + 最小 fork 策略

- Checkpointer 选 `langgraph-checkpoint-sqlite`，存于 `apps/api/data/lumen.db`
- 在 `langchain-ai/open_deep_research` 基础上做**最小 fork**：仅新增 `KBRetrieverNode`、`ConflictDetectNode`，改造 `MergeNode`（接入私有轨）和 `ReportWriterNode`（注入引用 ID）
- 拒绝 InMemory（无法应对 Demo 当天异常重启）和 Postgres（过度工程化）
- 拒绝深度重写（30 天预算不允许，且 fork delta 本身是竞赛叙事加分项）

SQLite 同时承担"Demo 当天预跑结果存档 → 异常时回放"的兜底通道，缓解 R3。

### D4：混合检索抽象——显式双边图结构 + Retriever Protocol（混合方案）

- LangGraph 图保留 `WebRetrieverNode` 和 `KBRetrieverNode` 两条独立边（与 F7 双轨可视化语义一致）
- 两个节点实现统一 `Retriever` Protocol（接口可替换 + 可单测）
- `MergeNode` 内做轻量 Reranker（BM25 + 向量相似度加权融合），不单独建 RerankerNode
- F4 冲突检测做成 **LangGraph 子图** `ConflictSubgraph`（不是后处理），输出 `EnrichedSource[]`，节点出现在 React Flow 可视化上以增强 Demo "AI 主动发现冲突"的过程感（缓解 R2）

```python
class Retriever(Protocol):
    async def retrieve(self, query: str, top_k: int) -> list[SourceDoc]: ...
```

`SourceDoc.track: Literal["web", "kb"]` 字段携带轨道身份。

### D5：数据存储——ChromaDB embedded + SQLite 统一本地存储

```
apps/api/data/
  ├── chroma/          # ChromaDB embedded：向量 + 文档 chunk
  └── lumen.db         # SQLite，统一存：
       ├── research_sessions
       ├── citations           # 引用元数据：chunk_id, source_url, text_snippet
       ├── audit_log           # SSE 事件流存档（Demo 重放用）
       └── langgraph_checkpoints
```

**前提约束**：Uvicorn 必须以 `--workers 1` 启动（缓解 R7）。需在根目录 `README.md` 启动说明中明确。

模拟内部知识库注入流程：`docs/kb_docs/` 放 3-5 份虚构项目案例 → `apps/api/scripts/ingest_kb.py` 一次性脚本 → DashScope `text-embedding-v3` 向量化 → 写入 ChromaDB collection `internal_kb`。

### D6：模型 Provider 抽象——`init_chat_model` + DashScope OpenAI-compatible 端点

```python
from langchain.chat_models import init_chat_model

model = init_chat_model(
    model="qwen-max",
    model_provider="openai",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key=os.environ["DASHSCOPE_API_KEY"],
)
```

不自建 LLMProvider 接口（重复造轮子），不裸调（兜底切换需改代码）。

**Demo 当天兜底策略**（缓解 R3）：
- L0 主力：`qwen-max` via DashScope OpenAI-compatible
- L1 兜底：同端点切换 `qwen-plus`（更快更稳）
- L2 兜底：`LLM_PROVIDER=claude` 切 Anthropic（环境变量控制，零代码改动）
- L3 应急：Demo 前一天预跑完整流程并将 SSE 事件流存入 `audit_log` SQLite 表，当天可"播放录像"

## 备选方案

| 决策 | 候选 | 拒绝理由 |
|------|------|---------|
| D1 | Monorepo (Turborepo) | 1 人 Demo 项目无法摊薄配置成本，故障点反增 |
| D1 | 双仓库 | 跨仓库联调代价高，SSE schema 同步靠人肉 |
| D2 | WebSocket | 双向能力浪费，前端零经验下连接管理复杂度爆炸 |
| D2 | Server Actions + 轮询 | 实时性差，与已有 FastAPI 架构冲突 |
| D3 | InMemory Checkpointer | 无法应对 Demo 当天进程重启，无 Demo 重放兜底 |
| D3 | Postgres Checkpointer | 多一个服务进程，过度工程化 |
| D3 | 深度重写 LangGraph 图 | 30 天预算不允许，fork delta 反而是竞赛叙事加分项 |
| D4 | 纯 Protocol 透明 | 牺牲了图结构对双轨业务语义的可视化表达 |
| D4 | 纯显式双边 | MergeNode 与具体检索器耦合，无法 mock 测试 |
| D4 | 冲突检测做后处理 | 失去"AI 主动发现冲突"的 Demo 过程感 |
| D5 | ChromaDB HTTP server | 多一个进程故障点，元数据存 ChromaDB 不如 SQLite 灵活 |
| D5 | Postgres 全部数据 | 启动复杂度 x2，过度工程化 |
| D6 | 自建 LLMProvider 接口 | 重复造轮子，失去 LangSmith 自动 tracing |
| D6 | 不做抽象（裸调） | Demo 当天兜底切换需修改代码，有风险 |

## 理由

6 项决策共同遵循同一原则："一切本地化、一切最简化、一切 LangChain 生态内"。每项决策单独看已经是 1 人 30 天 Demo 项目的最优解，合在一起不存在内部矛盾，且约束面统一，故一次性打包为基线 ADR。

## 影响

**正面**：
- 启动命令最简（两个终端窗口：`pnpm dev` + `uvicorn main:app --workers 1`）
- 故障排查路径最短（单进程、单数据库文件、单 git 仓库）
- Claude Code 上下文覆盖整个项目，AI 辅助效果最大化
- 多重兜底策略（SQLite 重放 + 多 LLM 切换）保障 Demo 当天稳定性
- 6 项决策互不矛盾，约束面统一

**负面/约束**：
- 单 Uvicorn worker 限制了并发能力（Demo 单用户场景不受影响，但需在 README 明示）
- SSE 事件 schema 是前后端唯一契约同步点，需手动维护双侧类型定义
- 最小 fork 策略意味着继承 `open_deep_research` 上游的设计选择，无法完全自主控制 Graph 结构
- TS 与 Pydantic 类型同步靠纪律而非工具（未引入 OpenAPI codegen，Demo 项目不值得）
- ChromaDB embedded 限制部署形态，未来如需多副本部署需重新评估 D5

**模块变更**：`apps/web/`、`apps/api/` 目录结构遵循 D1 约定从零建立

**数据模型变更**：D5 定义的 SQLite schema（research_sessions、citations、audit_log、langgraph_checkpoints）为首次建立

**API 变更**：D2 定义的 SSE 事件 schema 为首次建立，是前后端强契约

**风险**：
- SSE schema 手动同步风险（R1）——已通过类型文件 + ADR 修订纪律缓解
- Demo 当天 API 不稳定（R3）——已通过 D3 SQLite 重放 + D6 多级兜底缓解

**对 P1 / 后续迭代的影响**：
- F9（KB 只读面板）天然受益于 D5 的 SQLite 元数据表，可直接查询 `citations` + `internal_kb` collection
- 未来如引入第三条检索轨（如 Bing），需修改 LangGraph 图结构（D4 的"显式双边"约束）

## 关联 ADR

无（本 ADR 为首个决策记录，建立基线）

## 参考资料

- 产品定义：`docs/product/lumen.md`
- LangGraph 起点 fork：`langchain-ai/open_deep_research`
- DashScope OpenAI-compatible endpoint：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- LangChain `init_chat_model` 文档：参见 LangChain 官方文档
