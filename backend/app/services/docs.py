"""Search the manuals and maintenance logs."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import BadRequest, NotFound
from ..models import DocChunk
from ..rag.embed import Embedder
from ..rag.search import search


def search_docs(s: Session, embedder: Embedder, query: str, k: int = 5) -> dict:
    query = (query or "").strip()
    if not query:
        raise BadRequest("'q' must not be empty")
    if len(query) > 500:
        raise BadRequest("'q' must be at most 500 characters")
    return {"query": query, "embedder": embedder.name, "hits": search(s, query, embedder, k)}


def get_document(s: Session, doc_id: str) -> dict:
    """A whole SOP or log, section by section, so a citation can be shown in its context."""
    rows = s.execute(select(DocChunk).where(DocChunk.doc_id == doc_id)).scalars().all()
    if not rows:
        raise NotFound(f"No document {doc_id!r} in the library")
    # The same chunk is stored once per embedder; keep one of each, in document order.
    by_id = {r.id: r for r in rows}
    ordered = sorted(by_id.values(), key=lambda r: int(r.id.rsplit("#", 1)[1]))
    return {
        "doc_id": doc_id,
        "title": ordered[0].doc_title,
        "kind": "SOP" if doc_id.startswith("SOP-") else "Maintenance log",
        "sections": [{"chunk_id": r.id, "heading": r.heading, "text": r.text} for r in ordered],
    }
