"""T13b -- Prerender script smoke (no-LLM)."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

# Locate scripts dir (repo_root / scripts)
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"


def test_script_file_exists() -> None:
    """Sanity: the prerender script lives at the documented path."""
    assert (_SCRIPTS_DIR / "prerender_demo_session.py").exists()


def test_script_module_imports_without_running(monkeypatch: pytest.MonkeyPatch) -> None:
    """The module must be importable without DashScope env or running asyncio.run."""
    sys.path.insert(0, str(_SCRIPTS_DIR))
    try:
        # Force reimport in case a previous test loaded it
        if "prerender_demo_session" in sys.modules:
            del sys.modules["prerender_demo_session"]
        mod = importlib.import_module("prerender_demo_session")
        # Surface main + _run callables
        assert callable(mod.main)
        assert callable(mod._run)
    finally:
        sys.path.remove(str(_SCRIPTS_DIR))
        if "prerender_demo_session" in sys.modules:
            del sys.modules["prerender_demo_session"]


def test_script_main_requires_query_arg() -> None:
    """argparse must reject invocation without --query."""
    sys.path.insert(0, str(_SCRIPTS_DIR))
    try:
        if "prerender_demo_session" in sys.modules:
            del sys.modules["prerender_demo_session"]
        mod = importlib.import_module("prerender_demo_session")
        # argparse exits 2 on missing required arg; SystemExit raised
        with pytest.raises(SystemExit) as exc_info:
            mod.main([])  # no --query
        assert exc_info.value.code == 2
    finally:
        sys.path.remove(str(_SCRIPTS_DIR))
        if "prerender_demo_session" in sys.modules:
            del sys.modules["prerender_demo_session"]
