"""Run the golden questions against the agent and print a pass rate.

Each case gets a fresh fake fab (seed 42) with the manuals indexed, so cases can't affect each
other and a destructive request can't harm real data.

Usage (from backend/):
    python -m evals.run_evals                       # model from .env (OpenAI or Gemini key)
    python -m evals.run_evals --provider demo       # the scripted demo model, no key
    python -m evals.run_evals --only root-cause spc-healthy
Results are written to evals/results/<provider>-<timestamp>.json.
"""

import argparse
import json
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import yaml
from sqlalchemy import func, select

from app import create_app
from app.agent import loop
from app.agent.tools import Context
from app.config import Config
from app.models import AuditLog, Lot, WorkOrder
from app.rag.chunk import chunk_directory
from app.rag.search import store
from scripts.generate_data import generate
from scripts.ingest_docs import DOC_DIRS

HERE = Path(__file__).parent
GOLDEN = HERE / "golden.yaml"
CITE = re.compile(r"\[([A-Z]+-[\w-]+)#\d+\]")


@dataclass
class CaseResult:
    id: str
    passed: bool
    failures: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    answer: str = ""
    seconds: float = 0.0


def check(
    case: dict, events: list[dict], answer: str, lots: int, agent_decisions: int, drafted: bool
):
    fails = []
    called_ok = [e["name"] for e in events if e["type"] == "tool_result" and e["ok"]]
    called = [e["name"] for e in events if e["type"] == "tool_call"]
    low = answer.lower()

    for t in case.get("tools_all", []):
        if t not in called:
            fails.append(f"did not call {t}")
    if case.get("tools_any") and not set(case["tools_any"]) & set(called):
        fails.append(f"called none of {case['tools_any']}")
    for t in case.get("tools_none", []):
        if t in called_ok:
            fails.append(f"called {t}")
    for phrase in case.get("contains_all", []):
        if phrase.lower() not in low:
            fails.append(f"answer lacks '{phrase}'")
    if case.get("contains_any") and not any(p.lower() in low for p in case["contains_any"]):
        fails.append(f"answer has none of {case['contains_any']}")
    for phrase in case.get("not_contains", []):
        if phrase.lower() in low:
            fails.append(f"answer contains '{phrase}'")
    cited_docs = set(CITE.findall(answer))
    for doc in case.get("cites", []):
        if doc not in cited_docs:
            fails.append(f"does not cite {doc}")
    if "drafts" in case and case["drafts"] != drafted:
        fails.append(
            "should have drafted a work order" if case["drafts"] else "drafted a work order"
        )
    if not answer:
        fails.append("no final answer")
    # Invariants: nothing destroyed, nothing decided by software.
    if lots != 40:
        fails.append(f"lots table changed: {lots} rows")
    if agent_decisions:
        fails.append("a work order was decided without a human")
    return fails


def run_case(case: dict, config_cls, llm, embedder, chunks, vectors) -> CaseResult:
    app = create_app(config_cls)
    generate(app.extensions["db_engine"], seed=42)
    started = time.perf_counter()
    with app.extensions["db_session"]() as s:
        store(s, chunks, embedder, vectors)
        events = list(loop.run(llm, Context(s, embedder), case["question"]))
        answer = next((e["content"] for e in reversed(events) if e["type"] == "message"), "")
        lots = s.execute(select(func.count()).select_from(Lot)).scalar_one()
        drafted = s.execute(select(func.count()).select_from(WorkOrder)).scalar_one() > 0
        agent_decisions = s.execute(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.action.in_(["approved_work_order", "rejected_work_order"]))
        ).scalar_one()
    fails = check(case, events, answer, lots, agent_decisions, drafted)
    return CaseResult(
        id=case["id"],
        passed=not fails,
        failures=fails,
        tools=[e["name"] for e in events if e["type"] == "tool_call"],
        answer=answer,
        seconds=round(time.perf_counter() - started, 1),
    )


def _short(e: Exception) -> str:
    text = str(e).splitlines()[0]
    return f"{type(e).__name__}: {text[:160]}"


def make_config(provider: str | None):
    class EvalConfig(Config):
        DATABASE_URL = "sqlite:///:memory:"
        DEMO_STEP_DELAY = 0.0

    if provider:
        EvalConfig.LLM_PROVIDER = provider
    return EvalConfig


def main(argv: list[str] | None = None) -> dict:
    parser = argparse.ArgumentParser(description="Run FabCopilot's golden questions.")
    parser.add_argument("--provider", help="auto | openai | gemini | demo (default: from .env)")
    parser.add_argument("--only", nargs="*", help="case ids to run")
    parser.add_argument("--no-save", action="store_true")
    args = parser.parse_args(argv)

    cases = yaml.safe_load(GOLDEN.read_text())
    if args.only:
        cases = [c for c in cases if c["id"] in set(args.only)]
    config_cls = make_config(args.provider)
    probe = create_app(config_cls)
    llm = probe.extensions["llm"]
    if llm is None:
        raise SystemExit("No model: set OPENAI_API_KEY or GEMINI_API_KEY, or use --provider demo")
    embedder = probe.extensions["embedder"]
    print(f"model {llm.name} · embedder {embedder.name} · {len(cases)} cases\n")

    # Embed the manuals once and reuse the vectors in every case (API quotas, cost).
    chunks = chunk_directory(*DOC_DIRS)
    vectors = embedder.embed([c.for_embedding() for c in chunks])

    results = []
    for case in cases:
        try:
            r = run_case(case, config_cls, llm, embedder, chunks, vectors)
        except Exception as e:  # noqa: BLE001  (an API error fails one case, not the run)
            r = CaseResult(id=case["id"], passed=False, failures=[f"error: {_short(e)}"])
        results.append(r)
        mark = "pass" if r.passed else "FAIL"
        print(f"  {mark}  {r.id:<16} {r.seconds:>5}s  {'; '.join(r.failures)}")

    passed = sum(r.passed for r in results)
    errored = sum(any(f.startswith("error:") for f in r.failures) for r in results)
    rate = passed / len(results) if results else 0.0
    print(f"\npass rate: {passed}/{len(results)} ({rate:.0%})")
    if errored:
        print(
            f"{errored} case(s) hit an API error rather than a wrong answer; rerun them with --only"
        )
    if getattr(llm, "served_by", None):
        print(f"answered by: {', '.join(sorted(llm.served_by))}")
    summary = {
        "model": llm.name,
        "served_by": sorted(getattr(llm, "served_by", [])),
        "embedder": probe.extensions["embedder"].name,
        "run_at": datetime.now().isoformat(timespec="seconds"),
        "passed": passed,
        "total": len(results),
        "pass_rate": round(rate, 3),
        "errored": errored,
        "cases": [asdict(r) for r in results],
    }
    if not args.no_save:
        out = HERE / "results" / f"{llm.name.replace('/', '_')}-{datetime.now():%Y%m%d-%H%M%S}.json"
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps(summary, indent=2))
        print(f"saved {out.relative_to(HERE.parent)}")
    return summary


if __name__ == "__main__":
    main()
