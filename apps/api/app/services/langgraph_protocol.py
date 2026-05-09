"""T4 -- LangGraphProtocol typing.Protocol interface.

ADR-0003 D11 + NN1 (v2.2 revision): runtime_checkable Protocol giving
LangGraphStub (M1.0 testing) and LangGraphService (M1.A production)
a shared interface. SessionManager depends on this abstraction via type
annotation; T7 lifespan injects the concrete instance.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Protocol, runtime_checkable

from app.models.events import AnyEvent
from app.services.inject_directive import InjectDirective


@runtime_checkable
class LangGraphProtocol(Protocol):
    """LangGraph service interface contract.

    Implementors (LangGraphStub / LangGraphService) must provide an
    astream_events async generator whose signature strictly matches this
    Protocol (NN1 interface propagation).
    """

    def astream_events(
        self,
        session_id: str,
        query: str,
        *,
        inject_directive: InjectDirective | None = None,
    ) -> AsyncGenerator[AnyEvent, None]:
        """Stream lumen AnyEvent objects.

        Args:
            session_id: Session identifier; written to audit_log and
                event metadata.
            query: User research query fed to planner/researcher/writer
                nodes.
            inject_directive: Test-path directive; None in production.
        """
        ...  # Protocol body -- no implementation
