"""Chunk the SOPs and maintenance logs, embed them, and store them for search.

Usage:
    python -m scripts.ingest_docs                    # embedder from EMBEDDER (auto)
    python -m scripts.ingest_docs --embedder hashing # offline, no API key
"""

import argparse
from pathlib import Path

from app.config import Config
from app.db import init_db, make_engine, make_session_factory
from app.rag.chunk import chunk_directory
from app.rag.embed import make_embedder
from app.rag.search import store

DATA = Path(__file__).resolve().parent.parent / "data"
DOC_DIRS = (DATA / "sops", DATA / "logs")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", default=Config.DATABASE_URL)
    parser.add_argument("--embedder", default=Config.EMBEDDER)
    args = parser.parse_args()

    engine = make_engine(args.db)
    init_db(engine)
    embedder = make_embedder(args.embedder, vars(Config))
    chunks = chunk_directory(*DOC_DIRS)
    with make_session_factory(engine)() as s:
        n = store(s, chunks, embedder)
    docs = len({c.doc_id for c in chunks})
    print(f"Stored {n} chunks from {docs} documents with {embedder.name}")


if __name__ == "__main__":
    main()
