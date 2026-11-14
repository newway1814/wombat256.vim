# FabCopilot

An AI copilot for semiconductor yield engineers. Ask "why did yield drop on these lots?" and an
agent investigates a (synthetic) fab: it checks yield, reads wafer maps, finds the common chamber,
checks SPC charts, cites the maintenance SOPs, and drafts a work order that only a human can approve.

> Status: **M6 · The screen** — ask a question, watch the workspace fill live, approve the work order.

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
| `POST /api/chat` | the agent's steps as Server-Sent Events | body `{"message", "history"?}` |
| `GET /api/tickets` | work orders, newest first | |
| `POST /api/tickets/<id>/approve` | approve a DRAFT (409 if already decided) | body `{"by"}` |
| `POST /api/tickets/<id>/reject` | reject a DRAFT (409 if already decided) | body `{"by"}` |
| `GET /api/audit` | every chat, tool call and human decision, newest first | `limit` |

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

## The agent

`app/agent/` runs a tool-calling loop (at most 8 steps) over 10 tools: eight analysis tools
that call the tested services, a read-only `run_sql` fallback, and `draft_work_order`.

- **Model**: OpenAI or Gemini, whichever key is in `.env` (`LLM_PROVIDER` to force one). Both
  sit behind one small interface, so tests use a scripted fake model and never call an API.
- **Arguments** are validated with Pydantic; the same models produce the JSON schemas the
  model sees. Bad arguments come back to the model as a readable error, not a crash.
- **`run_sql`** accepts one SELECT, refuses write keywords, runs on a connection switched to
  read-only (`PRAGMA query_only`), and returns at most 200 rows.
- **Work orders** are drafts. Approving or rejecting is a separate endpoint only a human
  click calls; the agent has no tool for it. Deciding twice returns 409.
- **Audit log**: every question, tool call (arguments, ok, duration) and decision.

Try it from the terminal once a key is set: `python -m scripts.ask`.

**Demo mode** (`LLM_PROVIDER=demo`, no key needed) swaps the model for a scripted stand-in that
runs the real tools on the real data in the reference order and writes its answer only from
their results. It always runs that same investigation, whatever you ask; use it to demo the
screen, and a real key to ask anything else.

## The screen

`frontend/` is React + TypeScript (Vite), styled by hand from design tokens in
`src/styles/tokens.css` (light and dark), with IBM Plex Sans and Mono bundled locally.

- **Investigate**: a single question box. Press Enter and the conversation moves left while a
  workspace opens on the right. Every tool result appears there as it arrives over Server-Sent
  Events: flagged lots, commonality, the lot, the wafer map, the SPC chart, the before/after
  PM test, chamber events, sources, and the draft work order with Approve and Reject. The trace
  on the left shows each call running, then done; click a line for its raw result. Clicking a
  lot or wafer opens it in the workspace.
- **Lots**, **Work orders**, **Audit log**: plain pages over the same API.
- Charts are hand-drawn SVG (no chart library), so they follow the design exactly.

## Run it locally

Needs Python 3.11+ and Node 20+.

```bash
# Backend (terminal 1)
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # add an OpenAI or Gemini key; .env is never committed
pytest                             # all tests pass
python -m scripts.generate_data    # builds fabcopilot.db (seed 42, about 2 s)
python -m scripts.ingest_docs      # chunks + embeds the manuals (offline without a key)
python wsgi.py                     # API on :5000 (LLM_PROVIDER=demo python wsgi.py: no key)

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                        # http://localhost:5173
```
