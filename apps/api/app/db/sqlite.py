"""SQLite data access layer.

Per ADR-0002 D8.3 + plan T6:

- `lumen_audit_log` — single source of truth for SSE event stream.
  `seq` AUTOINCREMENT PK is the replay ordering key (NOT event_id —
  ULID is unreliable under clock skew per Codex M1). `event_id` UNIQUE
  is the idempotency key.
- `lumen_research_sessions` — session state machine
  (`created → running → completed | failed | cancelled` per D8.4).

Tables are prefixed `lumen_` so they coexist with langgraph-checkpoint-sqlite
in the same `lumen.db` file (per ADR-0001 D5 single-file storage).

Connection-level pragmas (per Codex H6):
- `journal_mode=WAL` — readers don't block writers
- `busy_timeout=5000` — wait up to 5s before raising `database is locked`
- `foreign_keys=ON` — defense-in-depth (no FK relations today, but
  configure now so they apply when relations are added)

All async via aiosqlite. Functions accept a `Connection` parameter so
tests can inject in-memory or temp-file connections without a global
singleton.
"""

from __future__ import annotations

import aiosqlite

PRAGMAS: tuple[str, ...] = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA busy_timeout=5000",
    "PRAGMA foreign_keys=ON",
)

CREATE_AUDIT_LOG = """
CREATE TABLE IF NOT EXISTS lumen_audit_log (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   TEXT    NOT NULL UNIQUE,
    session_id TEXT    NOT NULL,
    event_type TEXT    NOT NULL,
    payload    TEXT    NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_AUDIT_LOG_INDEX = """
CREATE INDEX IF NOT EXISTS idx_lumen_audit_log_session_seq
ON lumen_audit_log (session_id, seq)
"""

CREATE_RESEARCH_SESSIONS = """
CREATE TABLE IF NOT EXISTS lumen_research_sessions (
    id         TEXT PRIMARY KEY,
    status     TEXT NOT NULL DEFAULT 'created',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


async def configure_connection(conn: aiosqlite.Connection) -> None:
    """Apply per-connection PRAGMAs. Must be called on every fresh
    connection (WAL is database-level but busy_timeout is per-connection,
    and aiosqlite opens fresh connections per test fixture).

    The trailing commit() is a no-op on PRAGMA statements (they are not
    transactional) but defensively flushes any autocommit-state side
    effect aiosqlite's thread pool may have introduced before the
    caller proceeds with DDL/DML.
    """
    for pragma in PRAGMAS:
        await conn.execute(pragma)
    await conn.commit()


async def init_db(conn: aiosqlite.Connection) -> None:
    """Idempotent schema setup + pragma configuration."""
    await configure_connection(conn)
    await conn.execute(CREATE_AUDIT_LOG)
    await conn.execute(CREATE_AUDIT_LOG_INDEX)
    await conn.execute(CREATE_RESEARCH_SESSIONS)
    await conn.commit()


async def insert_audit_log(
    conn: aiosqlite.Connection,
    *,
    event_id: str,
    session_id: str,
    event_type: str,
    payload: str,
) -> int:
    """Insert one audit_log row. Returns assigned `seq`. Raises
    `sqlite3.IntegrityError` on duplicate `event_id` (idempotency
    boundary — caller should handle by skipping or treating as already-
    delivered)."""
    cursor = await conn.execute(
        "INSERT INTO lumen_audit_log (event_id, session_id, event_type, payload) "
        "VALUES (?, ?, ?, ?)",
        (event_id, session_id, event_type, payload),
    )
    seq = cursor.lastrowid
    if seq is None:
        # Guard before commit: if this branch ever fires (theoretical with
        # AUTOINCREMENT, but typed as int|None by aiosqlite stubs), we don't
        # want to commit a row whose seq we cannot return to the caller.
        raise RuntimeError("INSERT returned no lastrowid; SQLite invariant violated")
    await conn.commit()
    return seq


async def read_after(
    conn: aiosqlite.Connection,
    *,
    session_id: str,
    last_seq: int,
) -> list[dict[str, str | int]]:
    """Return audit_log rows with `seq > last_seq` for the session,
    ordered by seq. Used by the SSE replay path (T10)."""
    cursor = await conn.execute(
        "SELECT seq, event_id, session_id, event_type, payload "
        "FROM lumen_audit_log "
        "WHERE session_id = ? AND seq > ? "
        "ORDER BY seq",
        (session_id, last_seq),
    )
    rows = await cursor.fetchall()
    return [
        {
            "seq": row[0],
            "event_id": row[1],
            "session_id": row[2],
            "event_type": row[3],
            "payload": row[4],
        }
        for row in rows
    ]


async def lookup_seq_by_event_id(
    conn: aiosqlite.Connection,
    *,
    event_id: str,
) -> int | None:
    """Resolve a Last-Event-ID header value to its `seq`. Returns
    `None` when the event_id is not found — T10 SSE handler maps this
    to HTTP 400 (per ADR-0002 D8.3)."""
    cursor = await conn.execute(
        "SELECT seq FROM lumen_audit_log WHERE event_id = ?",
        (event_id,),
    )
    row = await cursor.fetchone()
    return None if row is None else int(row[0])


async def create_session(
    conn: aiosqlite.Connection,
    *,
    session_id: str,
) -> None:
    """Insert a new research_session with status='created'. Caller is
    expected to follow up with `update_session_status(...)` to running
    once the LangGraph task launches (per ADR-0002 D8.4 lifecycle).

    Raises `sqlite3.IntegrityError` if `session_id` already exists
    (PK uniqueness). T9 session_manager catches this and maps to
    HTTP 409 Conflict per the session producer lock contract."""
    await conn.execute(
        "INSERT INTO lumen_research_sessions (id) VALUES (?)",
        (session_id,),
    )
    await conn.commit()


async def update_session_status(
    conn: aiosqlite.Connection,
    *,
    session_id: str,
    status: str,
) -> None:
    """Update session status + bump updated_at. Status string is not
    validated here — T9 session_manager owns the state machine and is
    responsible for passing only valid states (created/running/completed/
    failed/cancelled)."""
    await conn.execute(
        "UPDATE lumen_research_sessions "
        "SET status = ?, updated_at = CURRENT_TIMESTAMP "
        "WHERE id = ?",
        (status, session_id),
    )
    await conn.commit()
