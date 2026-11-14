"""Get a database ready to serve: wait for it, create tables, and fill it on first start.

Generates the fake fab only if there are no lots, and indexes the manuals only if there are no
chunks for the configured embedder. Safe to run on every container start.

Usage:
    python -m scripts.bootstrap
"""

import time

from sqlalchemy import func, select, text

from app.config import Config
from app.db import init_db, make_engine, make_session_factory
from app.models import DocChunk, Lot
from app.rag.chunk import chunk_directory
from app.rag.embed import make_embedder
from app.rag.search import store
from scripts.generate_data import generate
from scripts.ingest_docs import DOC_DIRS


def wait_for(engine, attempts: int = 30) -> None:
    for i in range(attempts):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except Exception as e:  # noqa: BLE001
            print(f"waiting for database ({i + 1}/{attempts}): {type(e).__name__}")
            time.sleep(1)
    raise SystemExit("database did not come up")


def main() -> None:
    engine = make_engine(Config.DATABASE_URL)
    wait_for(engine)
    init_db(engine)
    session_factory = make_session_factory(engine)

    with session_factory() as s:
        lots = s.execute(select(func.count()).select_from(Lot)).scalar_one()
    if lots == 0:
        started = time.perf_counter()
        counts = generate(engine)
        took = time.perf_counter() - started
        print(f"generated the fake fab: {counts['wafers']} wafers in {took:.1f}s")
    else:
        print(f"fab data present: {lots} lots")

    embedder = make_embedder(Config.EMBEDDER, vars(Config))
    with session_factory() as s:
        chunks = s.execute(
            select(func.count()).select_from(DocChunk).where(DocChunk.embedder == embedder.name)
        ).scalar_one()
        if chunks == 0:
            n = store(s, chunk_directory(*DOC_DIRS), embedder)
            print(f"indexed {n} chunks with {embedder.name}")
        else:
            print(f"manuals indexed: {chunks} chunks with {embedder.name}")


if __name__ == "__main__":
    main()
