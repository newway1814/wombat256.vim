# FabCopilot

An AI copilot for semiconductor yield engineers. Ask "why did yield drop on these lots?" and an
agent investigates a (synthetic) fab: it checks yield, reads wafer maps, finds the common chamber,
checks SPC charts, cites the maintenance SOPs, and drafts a work order that only a human can approve.

> Status: **M4 · RAG over the manuals** — searchable SOPs and maintenance logs with chunk citations.

## Layout

```
backend/    Flask API (Python): the kitchen
frontend/   Vite + React + TypeScript: the shop window
.github/    CI: ruff, pytest, lint, type-check, build
```

## The fake fab

`scripts/generate_data.py` builds four weeks of history for 40 lots of 25 wafers: 8 route
steps, 4 etch tools with 2 chambers each, sensor summaries for every etch run, and a pass/fail
result for every die. The same seed always gives identical data.

One problem is planted for the agent to find: after a PM on chamber **ETCH-03-B** on
2026-10-26, reflected RF power drifts up and the wafers it etches at gate etch get edge-ring
failures (mean yield about 82% against about 95% elsewhere).

## API

Routes stay thin; logic lives in `app/services/`, storage in `app/repository.py`. The agent's
tools (M5) will call the same services. Errors are JSON:
`{"error": {"code": "not_found", "message": "Lot NOPE not found"}}`.

| Endpoint | Returns | Query |
| --- | --- | --- |
| `GET /api/health` | `{"status": "ok"}` | |
| `GET /api/lots` | lots, newest first, with mean yield | `limit` 1–200, `offset`, `status` |
| `GET /api/lots/<id>` | wafers and which chambers ran them at each step | |
| `GET /api/wafers/<id>/map` | every die's x, y and bin, plus bin counts | |
| `GET /api/chambers/<id>/fdc` | one sensor over time, plus PMs in the window | `param`, `from`, `to`, `limit` |
| `GET /api/docs/search` | top manual/log sections, each with a chunk ID | `q`, `k` 1–20 |

## Analytics

Plain, unit-tested Python in `app/analytics/`; the LLM never calculates, it calls these through
`app/services/analytics.py`.

| Module | Answers | Method |
| --- | --- | --- |
| `yield_check.py` | Which lots are unusually low? | Robust baseline (median, MAD sigma); flag below baseline - 3 sigma |
| `wafer_map.py` | What pattern is on this wafer? | Edge-band vs inner fail rate; largest touching group of failed dies |
| `commonality.py` | Which chamber do bad wafers share? | Fisher's exact test per (step, chamber), Bonferroni-adjusted |
| `spc.py` | Is this chamber out of control? | X-bar chart per lot visit, Western Electric rules 1-4; Welch t-test around a PM |

On the fake fab: commonality ranks ETCH-03-B at gate etch first (adjusted p about 1e-37), every
edge-ring wafer comes from it after its PM, and its SPC chart fires only after the PM.

## Manuals and search (RAG)

`data/sops/` holds 8 synthetic SOPs and `data/logs/` 20 past maintenance logs. They are split
at their headings into 119 chunks, embedded, and stored in the `doc_chunks` table. Search is
cosine similarity in NumPy (a few hundred vectors fit in memory; pgvector is the upgrade path),
returning the best chunk per document with its ID, e.g. `SOP-ETCH-001#3`, for citations.

- With `OPENAI_API_KEY` set, embeddings come from `text-embedding-3-small`.
- Without a key (and in tests) a deterministic word-hashing embedder with IDF weighting is
  used. It finds the right document in the top 5 for 12 of 12 golden questions, but it only
  matches words, not meaning.

## Run it locally

Needs Python 3.11+ and Node 20+.

```bash
# Backend (terminal 1)
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # add your OpenAI key later; .env is never committed
pytest                             # all tests pass
python -m scripts.generate_data    # builds fabcopilot.db (seed 42, about 2 s)
python -m scripts.ingest_docs      # chunks + embeds the manuals (offline without a key)
python wsgi.py                     # http://localhost:5000/api/health

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                        # http://localhost:5173 shows "Backend: ok"
```
