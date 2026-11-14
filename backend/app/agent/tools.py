"""The agent's tools. Each has a Pydantic model for its arguments (which also produces the
JSON schema the model sees) and calls a tested service. Tools never compute on their own."""

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from .. import repository as repo
from ..errors import ApiError, NotFound
from ..rag.embed import Embedder
from ..services import analytics, docs, fab, tickets
from . import guards
from .llm import ToolSpec

FdcParam = Literal["rf_reflected_w", "rf_forward_w", "pressure_mtorr", "esc_temp_c"]
MAX_RESULT_CHARS = 6000


class CheckLotYields(BaseModel):
    k: float = Field(3.0, ge=1, le=6, description="How many sigma below baseline to flag.")


class GetLot(BaseModel):
    lot_id: str = Field(description="Lot ID, e.g. L2610040.")


class ClassifyWaferMap(BaseModel):
    wafer_id: str = Field(description="Wafer ID, e.g. L2610040-07.")


class FindCommonality(BaseModel):
    step: str | None = Field(None, description="Limit to one route step, e.g. ETCH-GATE.")
    k: float = Field(3.0, ge=1, le=6, description="Sigma rule that defines a bad wafer.")


class SpcChart(BaseModel):
    chamber_id: str = Field(description="Chamber ID, e.g. ETCH-03-B.")
    param: FdcParam = "rf_reflected_w"


class CompareAroundPm(BaseModel):
    chamber_id: str
    param: FdcParam = "rf_reflected_w"
    window_days: float = Field(7.0, gt=0, le=30)


class GetChamberEvents(BaseModel):
    chamber_id: str
    since: str | None = Field(None, description="ISO date; only events from this date.")


class SearchDocs(BaseModel):
    query: str = Field(min_length=2, max_length=300, description="What to look up in SOPs/logs.")
    k: int = Field(5, ge=1, le=10)


class RunSql(BaseModel):
    sql: str = Field(
        max_length=4000,
        description="One read-only SELECT. Tables: lots, wafers, route_steps, tools, chambers, "
        "wafer_steps, fdc_summaries, die_results, defects, maintenance_events, alarms.",
    )


class DraftWorkOrder(BaseModel):
    chamber_id: str
    title: str = Field(min_length=5, max_length=200)
    body: str = Field(
        min_length=20,
        max_length=4000,
        description="Suspected cause, evidence with numbers and chunk IDs, requested action.",
    )


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    run: Callable[["Context", BaseModel], dict]

    def spec(self) -> ToolSpec:
        schema = self.args.model_json_schema()
        schema.pop("title", None)
        for prop in schema.get("properties", {}).values():
            prop.pop("title", None)
        return ToolSpec(self.name, self.description, schema)


@dataclass
class Context:
    session: Session
    embedder: Embedder


def _spc(ctx: Context, a: SpcChart) -> dict:
    chart = analytics.spc_chart(ctx.session, a.chamber_id, a.param)
    flagged = {v["index"] for v in chart["violations"]}
    chart["points_out_of_control"] = len(flagged)
    chart["points_out_of_control_after_baseline"] = sum(
        not chart["points"][i]["baseline"] for i in flagged
    )
    chart["violations"] = chart["violations"][:10]
    return chart


def _events(ctx: Context, a: GetChamberEvents) -> dict:
    if repo.get_chamber(ctx.session, a.chamber_id) is None:
        raise NotFound(f"Chamber {a.chamber_id} not found")
    since = fab.parse_time(a.since, "since")
    pms = repo.maintenance_of_chamber(ctx.session, a.chamber_id, since, None)
    alarms = repo.alarms_of_chamber(ctx.session, a.chamber_id, since, None)
    return {
        "chamber_id": a.chamber_id,
        "maintenance": [
            {
                "kind": e.kind,
                "performed_at": e.performed_at.isoformat(timespec="seconds"),
                "technician": e.technician,
                "notes": e.notes,
            }
            for e in pms
        ],
        "alarms": [
            {
                "code": x.code,
                "severity": x.severity,
                "raised_at": x.raised_at.isoformat(timespec="seconds"),
                "message": x.message,
            }
            for x in alarms[-30:]
        ],
        "alarm_count": len(alarms),
    }


def _commonality(ctx: Context, a: FindCommonality) -> dict:
    return analytics.find_commonality(ctx.session, step=a.step, k=a.k, top=5)


def _get_lot(ctx: Context, a: GetLot) -> dict:
    lot = fab.get_lot(ctx.session, a.lot_id)
    lot["wafers"] = sorted(lot["wafers"], key=lambda w: w["yield_pct"])  # worst first
    return lot


TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        Tool(
            "check_lot_yields",
            "Flag lots whose mean yield is more than k sigma below the fab baseline.",
            CheckLotYields,
            lambda ctx, a: analytics.check_lot_yields(ctx.session, a.k),
        ),
        Tool(
            "get_lot",
            "One lot: its wafers (worst yield first) and which chambers ran them at each step.",
            GetLot,
            _get_lot,
        ),
        Tool(
            "classify_wafer_map",
            "Label one wafer's failure pattern: edge_ring, cluster, random or clean.",
            ClassifyWaferMap,
            lambda ctx, a: analytics.classify_wafer(ctx.session, a.wafer_id),
        ),
        Tool(
            "find_commonality",
            "Rank (step, chamber) pairs by how strongly low-yield wafers share them "
            "(Fisher's exact test, Bonferroni-adjusted p-values).",
            FindCommonality,
            _commonality,
        ),
        Tool(
            "spc_chart",
            "X-bar SPC chart of a chamber's sensor, baseline before its last PM, with "
            "Western Electric rule violations.",
            SpcChart,
            _spc,
        ),
        Tool(
            "compare_around_pm",
            "Compare a chamber sensor's mean before vs after its last PM (Welch t-test).",
            CompareAroundPm,
            lambda ctx, a: analytics.compare_around_pm(
                ctx.session, a.chamber_id, a.param, window_days=a.window_days
            ),
        ),
        Tool(
            "get_chamber_events",
            "A chamber's maintenance records and alarms.",
            GetChamberEvents,
            _events,
        ),
        Tool(
            "search_docs",
            "Search SOPs and past maintenance logs. Every hit has a chunk_id to cite.",
            SearchDocs,
            lambda ctx, a: docs.search_docs(ctx.session, ctx.embedder, a.query, a.k),
        ),
        Tool(
            "run_sql",
            "Fallback for questions no other tool answers: one read-only SELECT, max 200 rows.",
            RunSql,
            lambda ctx, a: guards.run_readonly(ctx.session, a.sql),
        ),
        Tool(
            "draft_work_order",
            "Draft a work order for a human engineer to approve or reject. Creates a DRAFT only; "
            "it cannot hold a tool or change anything on the floor.",
            DraftWorkOrder,
            lambda ctx, a: tickets.draft_work_order(ctx.session, a.chamber_id, a.title, a.body),
        ),
    ]
}


@dataclass
class ToolOutcome:
    ok: bool
    result: dict  # full result (for the screen)
    for_model: str  # compact JSON (for the model)
    rows: int | None = None


def _count_rows(result: dict) -> int | None:
    for key in ("rows", "points", "hits", "ranking", "flagged", "dies", "wafers"):
        if isinstance(result.get(key), list):
            return len(result[key])
    return None


def execute(ctx: Context, name: str, arguments: dict) -> ToolOutcome:
    """Validate, run, and package one tool call. Errors become results the model can read."""
    tool = TOOLS.get(name)
    if tool is None:
        err = {"error": f"Unknown tool '{name}'. Available: {sorted(TOOLS)}"}
        return ToolOutcome(False, err, json.dumps(err))
    try:
        args = tool.args.model_validate(arguments)
    except ValidationError as e:
        problems = [f"{'.'.join(map(str, x['loc'])) or 'args'}: {x['msg']}" for x in e.errors()]
        err = {"error": "Invalid arguments", "problems": problems}
        return ToolOutcome(False, err, json.dumps(err))
    try:
        result = tool.run(ctx, args)
    except ApiError as e:
        ctx.session.rollback()
        err = {"error": e.message}
        return ToolOutcome(False, err, json.dumps(err))

    compact = json.dumps(result, default=_json_default, separators=(",", ":"))
    if len(compact) > MAX_RESULT_CHARS:
        compact = compact[:MAX_RESULT_CHARS] + '..."[truncated]"'
    return ToolOutcome(True, result, compact, _count_rows(result))


def _json_default(o):
    if isinstance(o, datetime):
        return o.isoformat(timespec="seconds")
    return str(o)
