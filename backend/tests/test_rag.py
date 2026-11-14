"""M4: chunking, embedding and search over the manuals, all offline."""

import os

import numpy as np
import pytest

from app.rag.chunk import chunk_directory, chunk_markdown
from app.rag.embed import HashingEmbedder, make_embedder
from app.rag.search import search, store
from scripts.ingest_docs import DOC_DIRS

# Questions an engineer might ask, and the document that should answer each.
GOLDEN = [
    ("edge ring reflected power", "SOP-ETCH-001"),
    ("RF match capacitor not seated after maintenance", "SOP-ETCH-001"),
    ("what checks must pass before an etch chamber runs product after PM", "SOP-ETCH-002"),
    ("HE-FLOW-LO helium backside alarm", "SOP-ETCH-003"),
    ("which process causes a cluster of failing dies on the wafer map", "SOP-YLD-001"),
    ("who must approve a work order before the module team acts", "SOP-YLD-002"),
    ("western electric rules for control charts", "SOP-SPC-001"),
    ("scratch defects after CMP pad conditioner", "SOP-CMP-001"),
    ("implant sheet resistance dose drift", "SOP-IMP-001"),
    ("ETCH-03-B reflected power high after quarterly PM", "MLOG-2025-014"),
    ("edge bead removal nozzle litho edge failures", "MLOG-2025-068"),
    ("edge ring wrong part number with normal reflected power", "MLOG-2026-062"),
]


@pytest.fixture(scope="module")
def chunks():
    return chunk_directory(*DOC_DIRS)


@pytest.fixture
def indexed(fab_app, chunks):
    """The fab app's database with every chunk stored under the offline embedder."""
    embedder = fab_app.extensions["embedder"]
    with fab_app.extensions["db_session"]() as s:
        store(s, chunks, embedder)
    return fab_app


# --- Chunking --------------------------------------------------------------------------


def test_chunks_split_at_headings():
    doc = "# Title here\n\nScope line.\n\n## Symptoms\n\nA\n\n## Fix\n\nB\n\n### Detail\n\nC\n"
    chunks = chunk_markdown(doc, "SOP-X")
    assert [c.heading for c in chunks] == ["Overview", "Symptoms", "Fix", "Detail"]
    assert [c.id for c in chunks] == ["SOP-X#1", "SOP-X#2", "SOP-X#3", "SOP-X#4"]
    assert all(c.doc_title == "Title here" for c in chunks)
    assert "Title here" in chunks[1].for_embedding()


def test_long_sections_are_split():
    body = "\n\n".join(["word " * 100] * 6)  # about 3,000 characters
    chunks = chunk_markdown(f"# T\n\n## Long\n\n{body}", "D")
    assert len(chunks) >= 2
    assert all(len(c.text) <= 1500 for c in chunks)


def test_corpus_size(chunks):
    docs = {c.doc_id for c in chunks}
    assert sum(d.startswith("SOP-") for d in docs) == 8
    assert sum(d.startswith("MLOG-") for d in docs) == 20
    assert len({c.id for c in chunks}) == len(chunks), "chunk IDs are unique"


# --- Embedding -------------------------------------------------------------------------


def test_hashing_embedder_is_deterministic_and_normalised():
    e = HashingEmbedder()
    a = e.embed(["reflected power drift", "reflected power drift"])
    assert np.array_equal(a[0], a[1])
    assert np.allclose(np.linalg.norm(a, axis=1), 1.0, atol=1e-5)


def test_auto_embedder_without_key_is_offline():
    assert make_embedder("auto", api_key="").name.startswith("hashing")
    with pytest.raises(ValueError):
        make_embedder("openai", api_key="")


# --- Search ----------------------------------------------------------------------------


def test_demo_query_finds_the_rf_match_sop(indexed):
    """Offline, word matching ranks two maintenance logs that share the words above the SOP,
    so this checks the top 5; the live test below holds real embeddings to the top 3."""
    with indexed.extensions["db_session"]() as s:
        hits = search(s, "edge ring reflected power", indexed.extensions["embedder"], k=5)
    assert "SOP-ETCH-001" in {h["doc_id"] for h in hits}
    assert all(h["chunk_id"].startswith(h["doc_id"] + "#") for h in hits)
    scores = [h["score"] for h in hits]
    assert scores == sorted(scores, reverse=True)


def hit_rate_at_k(app, k: int = 5) -> float:
    embedder = app.extensions["embedder"]
    with app.extensions["db_session"]() as s:
        found = sum(
            expected in {h["doc_id"] for h in search(s, q, embedder, k=k)} for q, expected in GOLDEN
        )
    return found / len(GOLDEN)


def test_one_chunk_per_document(indexed):
    with indexed.extensions["db_session"]() as s:
        hits = search(s, "reflected power", indexed.extensions["embedder"], k=10)
    docs = [h["doc_id"] for h in hits]
    assert len(docs) == len(set(docs))


def test_retrieval_hit_rate_at_5(indexed):
    rate = hit_rate_at_k(indexed, k=5)
    print(f"\nhit rate @5 ({indexed.extensions['embedder'].name}): {rate:.0%}")
    assert rate >= 0.9  # offline today: 12 of 12


# --- API -------------------------------------------------------------------------------


def test_search_endpoint(indexed):
    r = indexed.test_client().get("/api/docs/search?q=edge%20ring%20reflected%20power&k=3")
    assert r.status_code == 200
    body = r.get_json()
    assert len(body["hits"]) == 3
    assert {"chunk_id", "doc_id", "doc_title", "heading", "text", "score"} == set(body["hits"][0])


@pytest.mark.parametrize("query", ["q=", "q=%20", "q=x&k=0", f"q={'a' * 501}"])
def test_search_endpoint_bad_input(indexed, query):
    assert indexed.test_client().get(f"/api/docs/search?{query}").status_code == 400


# --- Real embeddings (only with a key) -------------------------------------------------


@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="needs OPENAI_API_KEY")
def test_openai_embeddings_hit_rate(chunks):
    from app import create_app
    from app.config import TestConfig

    class LiveConfig(TestConfig):
        EMBEDDER = "openai"
        OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

    app = create_app(LiveConfig)
    with app.extensions["db_session"]() as s:
        store(s, chunks, app.extensions["embedder"])
    rate = hit_rate_at_k(app, k=5)
    print(f"\nhit rate @5 (openai): {rate:.0%}")
    assert rate >= 0.9
    with app.extensions["db_session"]() as s:
        top3 = search(s, "edge ring reflected power", app.extensions["embedder"], k=3)
    assert "SOP-ETCH-001" in {h["doc_id"] for h in top3}
