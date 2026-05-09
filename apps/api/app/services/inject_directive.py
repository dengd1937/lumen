"""T4 NN1 -- InjectDirective type union.

Test backdoor directive objects produced by the router layer
`_parse_inject_directive`, passed through SessionManager to
LangGraphService nodes.

Production path: inject_directive=None.
Test path (TESTING_MODE + token dual-guard): inject one of the
concrete directive types below.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class InjectCloseAfterDirective:
    """T11 SSE-2 e2e: close stream after N events to simulate disconnect."""

    n: int


@dataclass(frozen=True)
class InjectErrorDirective:
    """T12 SSE-3 e2e: yield ErrorEvent immediately then exit generator."""


InjectDirective = InjectCloseAfterDirective | InjectErrorDirective
