"""T14 — Demo Runbook smoke tests (Codex M1 / M4 / L1).

Per plan T14: even the docs task goes through TDD. Five specs:

- RED 1: `.env.tpl` declares the three required keys.
- RED 2: every value in `.env.tpl` is either an `op://` reference or
  an empty string — no plaintext secrets land in the repo.
- RED 3: README has a `## Demo Runbook (M1.0)` heading.
- RED 4: README runbook mentions `--workers 1` (Codex M4 hard
  constraint — ChromaDB embedded + SQLite both need single-worker).
- RED 5: README has an "M1.0 限制" subsection (Codex L1 — clarifies
  that the P1 input field doesn't reach the API in this milestone;
  protocol verification is via curl).

Test files are exempt from the project's "no .md creation" rule
because they verify documentation contracts.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
# Sentinel guard: if this test moves to a deeper subdir, parents[3] will
# silently point at the wrong directory and the file-missing failures
# below would mask the real cause. Fail fast at import time instead.
assert (REPO_ROOT / "apps").is_dir() and (REPO_ROOT / ".claude").is_dir(), (
    f"Unexpected REPO_ROOT={REPO_ROOT} — re-check parents[N] depth."
)
ENV_TPL = REPO_ROOT / ".env.tpl"
README = REPO_ROOT / "README.md"

REQUIRED_ENV_KEYS = (
    "DASHSCOPE_API_KEY",
    "LUMEN_DB_PATH",
    "NEXT_PUBLIC_LUMEN_DATA_SOURCE",
)


def _read_env_tpl_lines() -> list[str]:
    if not ENV_TPL.exists():
        pytest.fail(f".env.tpl missing at {ENV_TPL}")
    return ENV_TPL.read_text(encoding="utf-8").splitlines()


def _get_declared_env_keys() -> set[str]:
    """Parse .env.tpl, return non-comment declared keys (left-of-= names)."""
    declared: set[str] = set()
    for line in _read_env_tpl_lines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key = stripped.split("=", 1)[0].strip()
        declared.add(key)
    return declared


def _read_readme() -> str:
    if not README.exists():
        pytest.fail(f"README.md missing at {README}")
    return README.read_text(encoding="utf-8")


def test_env_tpl_required_keys() -> None:
    """RED 1: each of the three documented keys appears at the start of
    a non-comment line in .env.tpl."""
    declared = _get_declared_env_keys()
    missing = [k for k in REQUIRED_ENV_KEYS if k not in declared]
    assert not missing, f".env.tpl missing required key(s): {missing}. Found: {sorted(declared)}"


def test_env_tpl_no_real_secrets() -> None:
    """RED 2: every value-bearing line carries either an `op://` reference,
    a benign default like `mock`/`./lumen.db`, or an empty string. No
    plaintext API keys."""
    lines = _read_env_tpl_lines()
    # Whitelist of plaintext values that are explicitly safe (not
    # secrets — they are documented configuration defaults).
    # "qwen-max" is a public LLM model name constant, not a secret.
    plaintext_allowlist = {"mock", "./lumen.db", "", "qwen-max"}
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        _, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        if value.startswith("op://"):
            continue
        if value in plaintext_allowlist:
            continue
        # Looks like a real value or unrecognized format — fail loud.
        pytest.fail(
            f"`.env.tpl` value `{value!r}` is neither an op:// reference "
            f"nor in the safe-default allowlist {sorted(plaintext_allowlist)}. "
            "Plaintext secrets MUST NOT land in this template."
        )


def test_readme_runbook_section_exists() -> None:
    """RED 3: README has a heading exactly `## Demo Runbook (M1.0)`."""
    readme = _read_readme()
    assert re.search(
        r"^## +Demo Runbook \(M1\.0\)\s*$",
        readme,
        flags=re.MULTILINE,
    ), "README.md missing `## Demo Runbook (M1.0)` heading"


def test_readme_workers_1_constraint() -> None:
    """RED 4 (Codex M4): runbook references `--workers 1` so operators
    don't accidentally spin up multi-worker uvicorn (which collides on
    ChromaDB + SQLite write locks)."""
    readme = _read_readme()
    assert "--workers 1" in readme, (
        "README.md must reference `--workers 1` (ADR-0001 D5 hard "
        "constraint — ChromaDB embedded + SQLite race in multi-worker)."
    )


def test_readme_m1_0_limit_section() -> None:
    """RED 5 (Codex L1): runbook documents the M1.0 limitation that the
    P1 input field does NOT reach the API in this milestone — clients
    verify the SSE protocol via direct curl to /api/research/start +
    /api/research/{id}/stream."""
    readme = _read_readme()
    assert "M1.0 限制" in readme, "README must include `M1.0 限制` subsection"
    # The limit section must explain the curl-verification path.
    assert "curl" in readme.lower(), (
        "M1.0 限制 section must explain the curl-based verification path"
    )


# ---------------------------------------------------------------------------
# T12a RED — M1.A runbook smoke tests
# ---------------------------------------------------------------------------


def test_readme_m1a_runbook_section_exists() -> None:
    """T12a RED: README has a `## Demo Runbook (M1.A)` heading."""
    readme = _read_readme()
    assert re.search(
        r"^## +Demo Runbook \(M1\.A\)\s*$",
        readme,
        flags=re.MULTILINE,
    ), "README.md missing `## Demo Runbook (M1.A)` heading"


def test_readme_m1a_delete_db_instruction() -> None:
    """T12a RED: M1.A runbook section includes instruction to delete lumen.db (schema changed)."""
    readme = _read_readme()
    # Find the M1.A section
    m1a_start = readme.find("## Demo Runbook (M1.A)")
    assert m1a_start != -1, "README missing M1.A runbook section"
    # Extract M1.A section content (up to the next ## heading or end of file)
    m1a_content = readme[m1a_start:]
    next_section = re.search(r"\n## ", m1a_content[len("## Demo Runbook (M1.A)") :])
    if next_section:
        m1a_content = m1a_content[: len("## Demo Runbook (M1.A)") + next_section.start()]
    assert re.search(r"rm.*lumen\.db", m1a_content), (
        "M1.A runbook must include a `rm -f apps/api/lumen.db` or similar delete-db instruction "
        "(schema has evolved since M1.0 — old DB must be recreated)"
    )


def test_env_tpl_has_dashscope_base_url() -> None:
    """T12a RED: .env.tpl declares DASHSCOPE_BASE_URL key."""
    declared = _get_declared_env_keys()
    assert "DASHSCOPE_BASE_URL" in declared, (
        f".env.tpl missing DASHSCOPE_BASE_URL key. Found: {sorted(declared)}"
    )


def test_env_tpl_has_llm_model() -> None:
    """T12a RED: .env.tpl declares LLM_MODEL key."""
    declared = _get_declared_env_keys()
    assert "LLM_MODEL" in declared, f".env.tpl missing LLM_MODEL key. Found: {sorted(declared)}"


def test_env_tpl_has_no_testing_mode() -> None:
    """T12a RED: .env.tpl must NOT contain LUMEN_TESTING_MODE or LUMEN_TESTING_TOKEN.
    These are test backdoor keys — they must never appear in the config template
    that operators use for production deployments."""
    lines = _read_env_tpl_lines()
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key = stripped.split("=", 1)[0].strip()
        assert key != "LUMEN_TESTING_MODE", (
            ".env.tpl must NOT contain LUMEN_TESTING_MODE — "
            "this is a test backdoor that must NEVER be enabled in production"
        )
        assert key != "LUMEN_TESTING_TOKEN", (
            ".env.tpl must NOT contain LUMEN_TESTING_TOKEN — "
            "this is a test backdoor that must NEVER be enabled in production"
        )
