"""Search the manuals and maintenance logs."""

from sqlalchemy.orm import Session

from ..errors import BadRequest
from ..rag.embed import Embedder
from ..rag.search import search


def search_docs(s: Session, embedder: Embedder, query: str, k: int = 5) -> dict:
    query = (query or "").strip()
    if not query:
        raise BadRequest("'q' must not be empty")
    if len(query) > 500:
        raise BadRequest("'q' must be at most 500 characters")
    return {"query": query, "embedder": embedder.name, "hits": search(s, query, embedder, k)}
