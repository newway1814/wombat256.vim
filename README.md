# FabCopilot

An AI copilot for semiconductor yield engineers. Ask "why did yield drop on these lots?" and an
agent investigates a (synthetic) fab: it checks yield, reads wafer maps, finds the common chamber,
checks SPC charts, cites the maintenance SOPs, and drafts a work order that only a human can approve.

> Status: **M0 · Skeleton** — empty house with plumbing. See the build plan for milestones M0–M8.

## Layout

```
backend/    Flask API (Python): the kitchen
frontend/   Vite + React + TypeScript: the shop window
.github/    CI: ruff, pytest, lint, type-check, build
```

## Run it locally

Needs Python 3.11+ and Node 20+.

```bash
# Backend (terminal 1)
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # add your OpenAI key later; .env is never committed
pytest                             # 1 passed
python wsgi.py                     # http://localhost:5000/api/health

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                        # http://localhost:5173 shows "Backend: ok"
```
