# FabCopilot

An AI copilot for semiconductor yield engineers. Ask "why did yield drop on these lots?" and an
agent investigates a (synthetic) fab: it checks yield, reads wafer maps, finds the common chamber,
checks SPC charts, cites the maintenance SOPs, and drafts a work order that only a human can approve.

> Status: **M2 · REST API** — read endpoints over the fake fab.

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
python wsgi.py                     # http://localhost:5000/api/health

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                        # http://localhost:5173 shows "Backend: ok"
```
