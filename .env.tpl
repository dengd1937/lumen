# Lumen 启动模板 — 1Password references
#
# 用法（与 README "Demo Runbook (M1.0)" step 1 对齐）：
#   op inject -i .env.tpl -o apps/api/.env
#   （或手工填值后另存为 apps/api/.env，不要直接 commit .env）
#
# 必填变量
DASHSCOPE_API_KEY=op://lumen/dashscope/api-key
LUMEN_DB_PATH=./lumen.db
NEXT_PUBLIC_LUMEN_DATA_SOURCE=mock

# 可选 — Web 抓取 / 可观测性，M1.0 不强制
FIRECRAWL_API_KEY=op://lumen/firecrawl/api-key
LANGSMITH_API_KEY=op://lumen/langsmith/api-key
