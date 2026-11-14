"""Record a real demo-mode investigation and the data the screens need, for a static site.

Netlify (or any static host) can't run the Python backend, so the static build replays this
recording in the browser. Every number in it comes from the real tools on the fake fab.

Usage:
    python -m scripts.export_demo            # writes ../frontend/public/demo/
"""

import json
from pathlib import Path

from app import create_app
from app.agent import loop
from app.agent.demo import DemoLLM
from app.agent.tools import Context, _json_default
from app.config import TestConfig
from app.rag.chunk import chunk_directory
from app.rag.search import store
from app.services import fab
from scripts.generate_data import generate
from scripts.ingest_docs import DOC_DIRS

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "demo"
QUESTION = "Yield dropped on recent lots. Find the cause and recommend an action."


def write(name: str, data) -> None:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, default=_json_default, separators=(",", ":")))


def compact_map(m: dict) -> dict:
    """Wafer maps as [x, y, bin] triples: a third of the size."""
    return {k: v for k, v in m.items() if k != "dies"} | {
        "d": [[d["x"], d["y"], d["bin"]] for d in m["dies"]]
    }


def main() -> None:
    app = create_app(TestConfig)
    generate(app.extensions["db_engine"], seed=42)
    with app.extensions["db_session"]() as s:
        store(s, chunk_directory(*DOC_DIRS), app.extensions["embedder"])
        lots = fab.list_lots(s, limit=200)
        status = {
            "lots": lots["total"],
            "baseline_yield": None,
            "flagged_lots": 0,
            "open_work_orders": 0,
            "model": "demo/recorded",
            "embedder": app.extensions["embedder"].name,
        }
        events = list(
            loop.run(DemoLLM(step_delay=0), Context(s, app.extensions["embedder"]), QUESTION)
        )
        flagged = next(
            e for e in events if e["type"] == "tool_result" and e["name"] == "check_lot_yields"
        )
        status["baseline_yield"] = flagged["result"]["baseline_yield"]
        status["flagged_lots"] = len(flagged["result"]["flagged"])

        details = {lot["id"]: fab.get_lot(s, lot["id"]) for lot in lots["items"]}
        for lot_id, lot in details.items():
            worst = sorted(lot["wafers"], key=lambda w: w["yield_pct"])[:4]
            write(
                f"maps/{lot_id}.json",
                {w["id"]: compact_map(fab.get_wafer_map(s, w["id"])) for w in worst},
            )

    write("status.json", status)
    write("lots.json", lots)
    write("lot-details.json", details)
    write("chat.json", {"question": QUESTION, "events": events})
    size = sum(p.stat().st_size for p in OUT.rglob("*.json"))
    print(f"wrote {len(list(OUT.rglob('*.json')))} files, {size / 1024:.0f} KB, to {OUT}")


if __name__ == "__main__":
    main()
