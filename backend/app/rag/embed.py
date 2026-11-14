"""Embedders turn text into vectors. Two interchangeable kinds:

- OpenAIEmbedder: real semantic embeddings (needs OPENAI_API_KEY and network).
- HashingEmbedder: offline and deterministic, by hashing words into a fixed-size vector.
  It only matches shared words, not meaning, which is enough for tests and for running
  without a key.
"""

import math
import re
import zlib
from typing import Protocol

import numpy as np

STOPWORDS = set(
    "a an the and or of to in on at for with by is are was were be been it its this that "
    "from as not no if then than so do does did into after before over under what which "
    "who how why when where there their our your my".split()
)


class Embedder(Protocol):
    name: str

    def embed(self, texts: list[str]) -> np.ndarray:
        """Returns one L2-normalised float32 row per text."""
        ...


def _normalise(m: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    return (m / np.where(norms == 0, 1, norms)).astype(np.float32)


def tokens(text: str) -> list[str]:
    words = [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS]
    # Crude stemming so "failures" matches "failure" and "drifts" matches "drift".
    return [w[:-1] if len(w) > 4 and w.endswith("s") else w for w in words]


class HashingEmbedder:
    # Each word lands in its own few dimensions, so search can weight rare words higher (IDF).
    sparse = True

    def __init__(self, dim: int = 1024):
        self.dim = dim
        self.name = f"hashing-{dim}"

    def embed(self, texts: list[str]) -> np.ndarray:
        m = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, text in enumerate(texts):
            words = tokens(text)
            features = words + [f"{a}_{b}" for a, b in zip(words, words[1:], strict=False)]
            counts: dict[int, float] = {}
            for f in features:
                h = zlib.crc32(f.encode())  # stable across runs, unlike hash()
                sign = 1.0 if h & 1 else -1.0
                counts[h % self.dim] = counts.get(h % self.dim, 0.0) + sign
            for j, c in counts.items():
                m[i, j] = math.copysign(math.log1p(abs(c)), c)
        return _normalise(m)


class OpenAIEmbedder:
    def __init__(self, api_key: str, model: str = "text-embedding-3-small", batch: int = 96):
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.batch = batch
        self.name = f"openai-{model}"

    def embed(self, texts: list[str]) -> np.ndarray:
        rows: list[list[float]] = []
        for i in range(0, len(texts), self.batch):
            resp = self.client.embeddings.create(model=self.model, input=texts[i : i + self.batch])
            rows.extend(d.embedding for d in resp.data)
        return _normalise(np.asarray(rows, dtype=np.float32))


def make_embedder(kind: str, api_key: str = "", model: str = "text-embedding-3-small") -> Embedder:
    """kind: "openai", "hashing", or "auto" (OpenAI when a key is set, else hashing)."""
    if kind == "auto":
        kind = "openai" if api_key else "hashing"
    if kind == "openai":
        if not api_key:
            raise ValueError("EMBEDDER=openai needs OPENAI_API_KEY")
        return OpenAIEmbedder(api_key, model)
    if kind == "hashing":
        return HashingEmbedder()
    raise ValueError(f"unknown embedder {kind!r}")
