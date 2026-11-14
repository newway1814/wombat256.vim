"""Store chunks with their vectors, and search them by cosine similarity in NumPy.

A few hundred chunks fit in memory, so no vector database is needed. Swap in pgvector when
the corpus grows.
"""

import numpy as np
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from ..models import DocChunk
from .chunk import Chunk
from .embed import Embedder


def store(
    s: Session, chunks: list[Chunk], embedder: Embedder, vectors: np.ndarray | None = None
) -> int:
    """Replace all chunks for this embedder. Pass vectors to reuse ones embedded earlier."""
    if vectors is None:
        vectors = embedder.embed([c.for_embedding() for c in chunks])
    s.execute(delete(DocChunk).where(DocChunk.embedder == embedder.name))
    if chunks:
        s.execute(
            insert(DocChunk),
            [
                {
                    "id": c.id,
                    "doc_id": c.doc_id,
                    "doc_title": c.doc_title,
                    "heading": c.heading,
                    "text": c.text,
                    "embedder": embedder.name,
                    "embedding": v.tobytes(),
                }
                for c, v in zip(chunks, vectors, strict=True)
            ],
        )
    s.commit()
    return len(chunks)


def _idf_weight(matrix: np.ndarray, q: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For word-hashing vectors: words found in few chunks count more than common ones."""
    df = (matrix != 0).sum(axis=0)
    idf = np.log((1 + matrix.shape[0]) / (1 + df)) + 1.0
    m = matrix * idf
    q = q * idf
    m /= np.where(
        np.linalg.norm(m, axis=1, keepdims=True) == 0, 1, np.linalg.norm(m, axis=1, keepdims=True)
    )
    q /= np.linalg.norm(q) or 1.0
    return m, q


def search(s: Session, query: str, embedder: Embedder, k: int = 5, per_doc: int = 1) -> list[dict]:
    """Top k chunks by cosine similarity, at most per_doc from any one document."""
    rows = s.execute(select(DocChunk).where(DocChunk.embedder == embedder.name)).scalars().all()
    if not rows:
        return []
    matrix = np.stack([np.frombuffer(r.embedding, dtype=np.float32) for r in rows])
    q = embedder.embed([query])[0]
    if q.shape[0] != matrix.shape[1]:
        raise ValueError("query and stored vectors have different sizes")
    if getattr(embedder, "sparse", False):
        matrix, q = _idf_weight(matrix, q)
    scores = matrix @ q  # all vectors are normalised, so the dot product is cosine similarity

    top: list[int] = []
    taken: dict[str, int] = {}
    for i in np.argsort(-scores, kind="stable"):
        doc = rows[i].doc_id
        if taken.get(doc, 0) < per_doc:
            taken[doc] = taken.get(doc, 0) + 1
            top.append(int(i))
            if len(top) == k:
                break
    return [
        {
            "chunk_id": rows[i].id,
            "doc_id": rows[i].doc_id,
            "doc_title": rows[i].doc_title,
            "heading": rows[i].heading,
            "text": rows[i].text,
            "score": round(float(scores[i]), 4),
        }
        for i in top
    ]
