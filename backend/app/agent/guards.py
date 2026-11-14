"""Guards on what the agent may do: read-only SQL with a row cap."""

import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..errors import BadRequest

MAX_ROWS = 200
FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|"
    r"reindex|truncate|grant|revoke|copy|call|exec|execute)\b",
    re.IGNORECASE,
)


def check_sql(sql: str) -> str:
    """Allow one SELECT (or WITH ... SELECT) statement; refuse everything else."""
    stripped = re.sub(r"--[^\n]*|/\*.*?\*/", " ", sql, flags=re.DOTALL).strip().rstrip(";").strip()
    if not stripped:
        raise BadRequest("Empty query")
    if ";" in stripped:
        raise BadRequest("Only one statement is allowed")
    if not re.match(r"^(select|with)\b", stripped, re.IGNORECASE):
        raise BadRequest("Only SELECT queries are allowed")
    if m := FORBIDDEN.search(stripped):
        raise BadRequest(f"Read-only: '{m.group(0)}' is not allowed")
    return stripped


def run_readonly(s: Session, sql: str, max_rows: int = MAX_ROWS) -> dict:
    """Run a checked query on a read-only connection and return at most max_rows rows."""
    query = check_sql(sql)
    if s.get_bind().dialect.name == "postgresql":
        columns, rows = _postgres_readonly(s, query, max_rows)
    else:
        columns, rows = _sqlite_readonly(s, query, max_rows)
    return {
        "columns": columns,
        "rows": [list(r) for r in rows[:max_rows]],
        "truncated": len(rows) > max_rows,
    }


def _fail(e: Exception) -> BadRequest:
    return BadRequest(f"Query failed: {str(e).splitlines()[0][:300]}")


def _sqlite_readonly(s: Session, query: str, max_rows: int):
    conn = s.connection()
    try:
        conn.exec_driver_sql("PRAGMA query_only = ON")
        result = conn.execute(text(query))
        return list(result.keys()), result.fetchmany(max_rows + 1)
    except Exception as e:  # noqa: BLE001  (SQL errors go back to the model as text)
        raise _fail(e) from None
    finally:
        conn.exec_driver_sql("PRAGMA query_only = OFF")
        s.rollback()


def _postgres_readonly(s: Session, query: str, max_rows: int):
    # A fresh connection, so READ ONLY is the first statement of its own transaction.
    with s.get_bind().connect() as conn:
        try:
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            conn.exec_driver_sql("SET LOCAL statement_timeout = 5000")
            result = conn.execute(text(query))
            return list(result.keys()), result.fetchmany(max_rows + 1)
        except Exception as e:  # noqa: BLE001
            raise _fail(e) from None
        finally:
            conn.rollback()
