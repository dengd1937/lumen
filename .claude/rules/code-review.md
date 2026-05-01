# 代码审查规范

## 何时审查

> Commit 前提醒: `pre-commit-review-check.py`

**强制触发**（commit 前 / merge 前）：
- 向共享分支提交任何 commit 前
- 安全敏感代码变更时（auth、支付、用户数据）
- 合并 pull request 前

**建议触发**：写完或修改代码后、架构变更时

**审查前提**：CI/CD 通过、merge 冲突已解决、分支已同步

## 严重等级

| 等级 | 含义 | 处理方式 |
|------|------|---------|
| CRITICAL | 安全漏洞或数据丢失风险 | **阻塞** — merge 前必须修复 |
| HIGH | Bug 或重大质量问题 | **警告** — 建议 merge 前修复 |
| MEDIUM | 可维护性问题 | **提示** — 考虑修复 |
| LOW | 风格或次要建议 | **备注** — 可选 |

## Agent 使用

| Agent | 用途 |
|-------|------|
| **code-reviewer** | 通用代码质量、模式、最佳实践 |
| **security-reviewer** | 安全漏洞、OWASP Top 10 |
| **python-reviewer** | Python 专项问题 |
| **typescript-reviewer** | TypeScript/React 类型安全、异步模式、hooks |

## 审批标准

- **通过**：无 CRITICAL 或 HIGH 问题
- **警告**：仅有 HIGH 问题（谨慎合并）
- **阻塞**：发现 CRITICAL 问题

## Approve-with-comments 处理政策

reviewer 给 APPROVE 但留有 MEDIUM/LOW finding 时：

- **默认路径**：就地修复后再 commit；同一 PR 内消化，不拖到下次任务
- **延后路径**：仅在以下两种场景允许，且必须显式记录：
  - finding 涉及跨任务范围（e.g. 全局重构、依赖升级）→ 在 commit message 中注明「defer to <task-id>」并 `/schedule` 跟踪
  - finding 涉及未实现的下游依赖（e.g. SSE 接入后才能验证）→ 在对应组件契约或 commit message 中标注 milestone
- **禁止悄悄放过**：APPROVE 不等于 finding 消失。任何 finding 必须有「就地修 / 延后跟踪 / 用户明确豁免」三种归宿之一

→ code-quality-gate skill / security-reviewer agent
