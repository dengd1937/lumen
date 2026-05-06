---
name: commit-quality
description: Pre-commit quality gate — validate commit message format, lint staged files, and scan for secrets and debug artifacts. Use before every git commit.
origin: ECC
---

# Commit Quality Gate

Run this skill before every `git commit` to enforce commit message conventions, catch last-minute quality issues, and prevent secrets from leaking into the repository.

## When to Activate

- Before running `git commit`
- After staging files with `git add`
- When the tdd-workflow or git-workflow skill reaches the commit step

## Checks to Perform

### 1. Commit Message Format

Validate that the commit message follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Allowed types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `revert`

**Rules:**
- Subject line ≤ 72 characters
- Subject in imperative mood ("add feature", not "added feature")
- No period at end of subject
- Body and footer separated by blank lines

**Good examples:**
```
feat(auth): add OAuth2 login
fix(api): handle null response in user endpoint
test(auth): add unit tests for token validation
```

**Bad examples:**
```
fixed stuff          # no type, vague
Update.              # no type, period at end
feat: Added the new payment flow and also fixed the login bug and updated docs   # too long, too many concerns
```

### 2. Lint Staged Files

Run the linter on staged files only before committing.

**JavaScript / TypeScript**
```bash
# lint-staged (if configured)
npx lint-staged

# Manual: Biome
git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' | xargs npx biome lint

# Manual: ESLint
git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' | xargs npx eslint
```

**Python**
```bash
git diff --cached --name-only --diff-filter=ACM | grep '\.py$' | xargs ruff check
```

### 3. Debug Artifact Scan

Check staged files for debug statements.

```bash
# Detect console.log / debugger in staged JS/TS files
git diff --cached | grep -E '^\+.*(console\.(log|debug|warn)|debugger)'

# Detect print / breakpoint in staged Python files
git diff --cached | grep -E '^\+.*(^print\(|breakpoint\(\))'
```

If found: remove before committing, or replace with a proper logger.

### 4. Secrets Scan

Check staged files for common secret patterns. Do not commit if any are found.

**Patterns to detect:**
- Hardcoded API keys: `api_key\s*=\s*["'][A-Za-z0-9]{20,}["']`
- Tokens: `(token|secret|password)\s*=\s*["'][^"']{8,}["']`
- AWS credentials: `AKIA[0-9A-Z]{16}`
- Private keys: `-----BEGIN (RSA |EC )?PRIVATE KEY-----`
- Connection strings with credentials: `://[^:]+:[^@]+@`

```bash
# Quick scan of staged diff
git diff --cached | grep -iE '(api_key|secret|password|token)\s*=\s*["\x27][^"\x27]{8,}'
```

If found: **stop immediately**, remove the secret, add the file to `.gitignore` if needed, and rotate the exposed credential.

### 5. Token Sync Asymmetry Audit

`pnpm sync:tokens` 是 `cp` 覆盖命令：用 `docs/designs/lumen/tokens/*` 直接覆盖
`apps/web/src/styles/*`。如果 dest 历史上含某 `--xxx` 定义而 source 不含
（手动加入或旧版 sync 残留），下一次 `sync:tokens` 会**静默删除**该 token。
若有 production 组件仍引用 `var(--xxx)`，CSS 会 fallback 到 initial value，
造成隐藏视觉回归（无 build error / 无 lint flag）。

每次 commit 含 `apps/web/src/styles/tokens.css` 改动时，扫描其 staged diff
中被删除的 `--xxx` 定义，检查 source 是否同步删除，并报告还在引用的消费方。

```bash
DEST_TOKENS="apps/web/src/styles/tokens.css"
SOURCE_TOKENS="docs/designs/lumen/tokens/tokens.css"

if git diff --cached --name-only | grep -qx "$DEST_TOKENS"; then
  # Extract token names removed from dest staged diff
  DELETED=$(git diff --cached -- "$DEST_TOKENS" \
    | grep -oE '^-[[:space:]]+--[a-z][a-z0-9-]*:' \
    | sed -E 's/^-[[:space:]]+//; s/:$//' \
    | sort -u)

  for token in $DELETED; do
    # If source still doesn't define this token → asymmetric removal
    if ! grep -qE "^[[:space:]]*${token}:" "$SOURCE_TOKENS"; then
      consumers=$(grep -rE "var\\(${token}\\)" apps/web/src \
        --include='*.tsx' --include='*.ts' --include='*.css' 2>/dev/null \
        | wc -l | tr -d ' ')
      echo "WARN: ${token} removed from ${DEST_TOKENS} but absent from source ${SOURCE_TOKENS}"
      echo "      sync:tokens may have silently dropped this token (cp overwrite)."
      echo "      var(${token}) consumers in apps/web/src: ${consumers}"
      if [[ "$consumers" -gt 0 ]]; then
        echo "      → BLOCK: restore ${token} in ${SOURCE_TOKENS} + tokens.w3c.json before commit."
      else
        echo "      → INFO: no consumers found; safe to drop. Verify in apps/web/.next/* not stale."
      fi
    fi
  done
fi
```

**Failure handling**：发现"dest 删除 + source 不含 + consumers > 0"时，回到
`docs/designs/lumen/tokens/tokens.css` 与 `tokens.w3c.json` 补回 token 定义，
重跑 `pnpm sync:tokens`，重新 stage，再 commit。**禁止用注释绕过此提示**——
缺失的 token 在 CSS var() 中是 silent fallback，不会有 build error 提醒未来读者。

### 6. No Hook Bypass

Never use flags that skip git hooks:

```
# NEVER use these
git commit --no-verify
git commit -n
git push --no-verify
```

These flags disable pre-commit, commit-msg, and pre-push hooks that protect the repository. If a hook is failing, fix the underlying issue instead of bypassing it.

## Pass Criteria

All checks must pass before committing:

| Check | Pass Condition |
|---|---|
| Commit message | Follows Conventional Commits format |
| Lint | Zero errors on staged files |
| Debug artifacts | None in staged files |
| Secrets | None in staged diff |
| Token sync asymmetry | No dest-only deletion with active consumers |
| Hook bypass | No `--no-verify` flag used |

## Failure Handling

- **Bad commit message**: Rewrite the message to follow the format above.
- **Lint errors**: Fix the errors in staged files, re-stage with `git add`, then retry.
- **Debug artifacts**: Remove `console.log` / `debugger` / `print()` statements, re-stage.
- **Secret detected**: Remove the secret immediately. Do not commit. Add to `.gitignore`. Rotate the credential if it was ever pushed.
- **Token sync asymmetry**: Restore missing token to source `tokens.css` + `tokens.w3c.json`, re-run `pnpm sync:tokens`, re-stage. Don't commit dangling `var()` references.
- **Hook failure**: Investigate and fix the root cause. Never use `--no-verify` to bypass.
