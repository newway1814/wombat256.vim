"""Runs against a real PostgreSQL when TEST_POSTGRES_URL is set (CI does this); skipped otherwise.

Covers what differs between SQLite and Postgres: bulk inserts, the analytics SQL, the read-only
SQL guard, and the work-order flow.
"""

import os

import pytest
from sqlalchemy import func, select

from app.agent import guards
from app.agent.tools import Context, execute
from app.errors import BadRequest
from app.models import Lot
from app.rag.chunk import chunk_directory
from app.rag.search import search, store
from app.services import analytics, tickets
from scripts.generate_data import CULPRIT, generate
from scripts.ingest_docs import DOC_DIRS

URL = os.getenv("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not URL, reason="needs TEST_POSTGRES_URL")


@pytest.fixture(scope="module")
def pg_app():
    from app import create_app
    from app.config import TestConfig

    class PgConfig(TestConfig):
        DATABASE_URL = URL

    app = create_app(PgConfig)
    generate(app.extensions["db_engine"], seed=42)
    with app.extensions["db_session"]() as s:
        store(s, chunk_directory(*DOC_DIRS), app.extensions["embedder"])
    return app


@pytest.fixture
def s(pg_app):
    with pg_app.extensions["db_session"]() as session:
        yield session


def test_same_findings_on_postgres(s):
    top = analytics.find_commonality(s)["ranking"][0]
    assert (top["step"], top["chamber_id"]) == ("ETCH-GATE", CULPRIT)
    assert analytics.spc_chart(s, CULPRIT)["out_of_control"]
    assert len(analytics.check_lot_yields(s)["flagged"]) == 4


def test_readonly_guard_on_postgres(s):
    assert guards.run_readonly(s, "SELECT count(*) AS n FROM lots")["rows"] == [[40]]
    with pytest.raises(BadRequest):
        guards.run_readonly(s, "DELETE FROM lots")
    # Even if the keyword filter were bypassed, the transaction itself refuses writes.
    with pytest.raises(BadRequest, match="read-only transaction"):
        guards._postgres_readonly(s, "UPDATE lots SET status = 'HOLD'", 10)
    assert s.execute(select(func.count()).select_from(Lot)).scalar_one() == 40


def test_tools_and_tickets_on_postgres(pg_app, s):
    ctx = Context(s, pg_app.extensions["embedder"])
    out = execute(
        ctx, "draft_work_order", {"chamber_id": CULPRIT, "title": "PG check", "body": "x" * 30}
    )
    assert out.ok
    decided = tickets.approve(s, out.result["id"], "J. Kim")
    assert decided["status"] == "APPROVED"
    hits = search(s, "edge ring reflected power", pg_app.extensions["embedder"], k=5)
    assert "SOP-ETCH-001" in {h["doc_id"] for h in hits}
