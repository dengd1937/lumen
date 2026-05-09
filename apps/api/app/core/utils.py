"""Shared low-level utilities — timestamps and event IDs.

Kept in app/core to avoid circular imports between
graph sub-package and service layer (both need these helpers).
"""

from __future__ import annotations

from datetime import UTC, datetime

from ulid import ULID


def now_iso() -> str:
    """ISO-8601 UTC timestamp with microsecond precision (Z suffix)."""
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def new_event_id() -> str:
    """Crockford Base32 ULID — sortable + URL-safe."""
    return str(ULID())
