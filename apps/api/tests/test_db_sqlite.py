"""T6 — SQLite data access layer tests.

Per ADR-0002 D8.3 + plan T6: audit_log table with `seq` AUTOINCREMENT
PK, `event_id` UNIQUE; research_sessions with status state machine;
WAL + busy_timeout for concurrent-write tolerance.

Tables are prefixed `lumen_` so they coexist with langgraph-checkpoint-sqlite
in the same `lumen.db` file (per plan T6 GREEN).
"""

from __future__ import annotations

import asyncio
import sqlite3
from collections.abc import AsyncIterator
from pathlib import Path

import aiosqlite
import pytest
import pytest_asyncio

from app.db.sqlite import (
    configure_connection,
    create_session,
    init_db,
    insert_audit_log,
    lookup_seq_by_event_id,
    read_after,
    update_session_status,
)


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "test_lumen.db"


@pytest_asyncio.fixture
async def conn(db_path: Path) -> AsyncIterator[aiosqlite.Connection]:
    async with aiosqlite.connect(str(db_path)) as connection:
        await init_db(connection)
        yield connection


# ---------------------------------------------------------------------------
# RED 1 — init_db is idempotent
# ---------------------------------------------------------------------------


async def test_create_tables_idempotent(db_path: Path) -> None:
    async with aiosqlite.connect(str(db_path)) as c:
        await init_db(c)
        await init_db(c)  # second call must not raise
        # Verify tables exist via sqlite_master
        cursor = await c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('lumen_audit_log', 'lumen_research_sessions')"
        )
        names = {row[0] for row in await cursor.fetchall()}
    assert names == {"lumen_audit_log", "lumen_research_sessions"}


# ---------------------------------------------------------------------------
# RED 2 — PRAGMA journal_mode=WAL + busy_timeout=5000
# ---------------------------------------------------------------------------


async def test_pragma_wal_and_busy_timeout(db_path: Path) -> None:
    """ADR-0002 D8.3 + Codex H6: WAL mode + busy_timeout protect against
    `database is locked` errors when audit_log writes contend with
    langgraph-checkpoint-sqlite operations on the same file."""
    async with aiosqlite.connect(str(db_path)) as c:
        await configure_connection(c)
        cur1 = await c.execute("PRAGMA journal_mode")
        row1 = await cur1.fetchone()
        cur2 = await c.execute("PRAGMA busy_timeout")
        row2 = await cur2.fetchone()
    assert row1 is not None and row1[0] == "wal"
    assert row2 is not None and row2[0] == 5000


# ---------------------------------------------------------------------------
# RED 3 — insert + read audit_log roundtrip
# ---------------------------------------------------------------------------


async def test_insert_and_read_audit_log(conn: aiosqlite.Connection) -> None:
    seq1 = await insert_audit_log(
        conn, event_id="e1", session_id="s1", event_type="plan_created", payload="{}"
    )
    seq2 = await insert_audit_log(
        conn, event_id="e2", session_id="s1", event_type="node_started", payload="{}"
    )
    assert seq1 == 1
    assert seq2 == 2

    rows = await read_after(conn, session_id="s1", last_seq=0)
    assert len(rows) == 2
    assert rows[0]["seq"] == 1
    assert rows[0]["event_id"] == "e1"
    assert rows[1]["seq"] == 2
    assert rows[1]["event_id"] == "e2"

    # last_seq filter — only events strictly greater than last_seq
    rows_after_1 = await read_after(conn, session_id="s1", last_seq=1)
    assert len(rows_after_1) == 1
    assert rows_after_1[0]["event_id"] == "e2"


# ---------------------------------------------------------------------------
# RED 4 — event_id UNIQUE constraint (idempotency key)
# ---------------------------------------------------------------------------


async def test_event_id_unique_constraint(conn: aiosqlite.Connection) -> None:
    await insert_audit_log(conn, event_id="dup", session_id="s1", event_type="error", payload="{}")
    with pytest.raises(sqlite3.IntegrityError):
        await insert_audit_log(
            conn, event_id="dup", session_id="s1", event_type="error", payload="{}"
        )


async def test_read_after_isolates_by_session(conn: aiosqlite.Connection) -> None:
    """Confidentiality guard (per code-reviewer T6 HIGH): read_after must
    NEVER return rows from a different session. T10 SSE replay relies on
    this isolation — a bug here would leak event payloads across sessions."""
    await insert_audit_log(
        conn, event_id="e-s1", session_id="s1", event_type="plan_created", payload="{}"
    )
    await insert_audit_log(
        conn, event_id="e-s2", session_id="s2", event_type="plan_created", payload="{}"
    )
    rows_s1 = await read_after(conn, session_id="s1", last_seq=0)
    rows_s2 = await read_after(conn, session_id="s2", last_seq=0)
    assert len(rows_s1) == 1
    assert rows_s1[0]["session_id"] == "s1"
    assert rows_s1[0]["event_id"] == "e-s1"
    assert len(rows_s2) == 1
    assert rows_s2[0]["session_id"] == "s2"
    assert rows_s2[0]["event_id"] == "e-s2"


# ---------------------------------------------------------------------------
# RED 5 — research_sessions status lifecycle
# ---------------------------------------------------------------------------


async def test_create_session_duplicate_raises_integrity_error(
    conn: aiosqlite.Connection,
) -> None:
    """T9 session producer lock contract (per code-reviewer T6 HIGH):
    duplicate session_id MUST raise sqlite3.IntegrityError so T9 can
    map it to HTTP 409 Conflict per ADR-0002 D8.4."""
    await create_session(conn, session_id="dup-sess", query="dup-test")
    with pytest.raises(sqlite3.IntegrityError):
        await create_session(conn, session_id="dup-sess", query="dup-test")


async def test_research_sessions_status_lifecycle(conn: aiosqlite.Connection) -> None:
    await create_session(conn, session_id="sess-001", query="sess-001-test")
    cur = await conn.execute(
        "SELECT status FROM lumen_research_sessions WHERE id = ?", ("sess-001",)
    )
    row = await cur.fetchone()
    assert row is not None and row[0] == "created"

    await update_session_status(conn, session_id="sess-001", status="running")
    cur = await conn.execute(
        "SELECT status FROM lumen_research_sessions WHERE id = ?", ("sess-001",)
    )
    row = await cur.fetchone()
    assert row is not None and row[0] == "running"

    await update_session_status(conn, session_id="sess-001", status="completed")
    cur = await conn.execute(
        "SELECT status FROM lumen_research_sessions WHERE id = ?", ("sess-001",)
    )
    row = await cur.fetchone()
    assert row is not None and row[0] == "completed"


# ---------------------------------------------------------------------------
# RED 6 — concurrent writes do not raise `database is locked`
# ---------------------------------------------------------------------------


async def test_concurrent_writes_no_database_locked(db_path: Path) -> None:
    """Codex H6: WAL + busy_timeout=5000 must let 5 concurrent writers
    coexist without `OperationalError: database is locked`."""
    async with aiosqlite.connect(str(db_path)) as setup_conn:
        await init_db(setup_conn)

    async def writer(idx: int) -> None:
        async with aiosqlite.connect(str(db_path)) as c:
            await configure_connection(c)
            await insert_audit_log(
                c,
                event_id=f"evt-{idx}",
                session_id="s-concurrent",
                event_type="node_progress",
                payload="{}",
            )

    await asyncio.gather(*(writer(i) for i in range(5)))

    async with aiosqlite.connect(str(db_path)) as verify_conn:
        cur = await verify_conn.execute(
            "SELECT COUNT(*) FROM lumen_audit_log WHERE session_id = ?",
            ("s-concurrent",),
        )
        row = await cur.fetchone()
    assert row is not None and row[0] == 5


# ---------------------------------------------------------------------------
# RED 7 — lookup_seq_by_event_id (Last-Event-ID resolution for T10)
# ---------------------------------------------------------------------------


async def test_lookup_seq_by_event_id(conn: aiosqlite.Connection) -> None:
    """T10 SSE replay: Last-Event-ID is an event_id; backend resolves it
    to seq, then sends seq > matched_seq. Missing event_id returns None
    (caller maps to 400 Bad Request per ADR-0002 D8.3)."""
    await insert_audit_log(
        conn, event_id="evt-a", session_id="s1", event_type="plan_created", payload="{}"
    )
    await insert_audit_log(
        conn, event_id="evt-b", session_id="s1", event_type="node_started", payload="{}"
    )

    seq_a = await lookup_seq_by_event_id(conn, event_id="evt-a")
    seq_b = await lookup_seq_by_event_id(conn, event_id="evt-b")
    seq_missing = await lookup_seq_by_event_id(conn, event_id="evt-nonexistent")

    assert seq_a == 1
    assert seq_b == 2
    assert seq_missing is None


# ---------------------------------------------------------------------------
# T2 RED — query column + create_session signature extension
# ---------------------------------------------------------------------------


async def test_create_session_with_query_stores_query(conn: aiosqlite.Connection) -> None:
    """T2: create_session 必须接受 query 参数并将其存入 DB。"""
    await create_session(conn, session_id="s1", query="AI 趋势分析")
    cur = await conn.execute("SELECT query FROM lumen_research_sessions WHERE id = ?", ("s1",))
    row = await cur.fetchone()
    assert row is not None and row[0] == "AI 趋势分析"


async def test_create_session_requires_query_keyword_arg(conn: aiosqlite.Connection) -> None:
    """T2: query is a mandatory keyword-only arg; omitting or passing positional raises TypeError.

    Note: TypeError is raised synchronously at call-expression evaluation time,
    before the coroutine is awaited. pytest.raises still captures it because it
    wraps the entire expression.
    """
    with pytest.raises(TypeError):
        # query omitted -> keyword-only constraint raises TypeError (call-time, sync)
        await create_session(conn, session_id="s2")  # type: ignore[call-arg]
    with pytest.raises(TypeError):
        # extra positional -> fn accepts only 1 positional (conn), extras cannot bind -> TypeError
        await create_session(conn, "s3", "test")  # type: ignore[misc]


async def test_init_db_creates_query_column(db_path: Path) -> None:
    """T2: init_db must create the query column (TEXT NOT NULL DEFAULT '')."""
    async with aiosqlite.connect(str(db_path)) as c:
        await init_db(c)
        cur = await c.execute("PRAGMA table_info(lumen_research_sessions)")
        columns = {
            row[1]: {"type": row[2], "notnull": row[3], "dflt_value": row[4]}
            for row in await cur.fetchall()
        }
    assert "query" in columns, "query column missing from lumen_research_sessions"
    col = columns["query"]
    assert col["type"] == "TEXT"
    assert col["notnull"] == 1
    assert col["dflt_value"] == "''"


async def test_create_session_query_too_long_no_db_truncation(conn: aiosqlite.Connection) -> None:
    """T2 boundary: DB layer does not truncate long query (truncation is Pydantic's job)."""
    long_query = "x" * 5000
    # must not raise
    await create_session(conn, session_id="s-long", query=long_query)
    cur = await conn.execute("SELECT query FROM lumen_research_sessions WHERE id = ?", ("s-long",))
    row = await cur.fetchone()
    assert row is not None and row[0] == long_query
