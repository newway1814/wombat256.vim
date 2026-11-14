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
    conn = s.connection()
    dialect = conn.dialect.name
    try:
        if dialect == "sqlite":
            conn.exec_driver_sql("PRAGMA query_only = ON")
        elif dialect == "postgresql":
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
        result = conn.execute(text(query))
        columns = list(result.keys())
        rows = result.fetchmany(max_rows + 1)
    except BadRequest:
        raise
    except Exception as e:  # noqa: BLE001  (SQL errors go back to the model as text)
        raise BadRequest(f"Query failed: {str(e).splitlines()[0][:300]}") from None
    finally:
        if dialect == "sqlite":
            conn.exec_driver_sql("PRAGMA query_only = OFF")
        s.rollback()
    return {
        "columns": columns,
        "rows": [list(r) for r in rows[:max_rows]],
        "truncated": len(rows) > max_rows,
    }
