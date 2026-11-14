"""Analytics services: fetch from the repository, run the tested analytics, shape the answer.

These are what the agent's tools will call in M5.
"""

from collections import OrderedDict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .. import repository as repo
from ..analytics import commonality as commonality_mod
from ..analytics import spc as spc_mod
from ..analytics import wafer_map as wafer_map_mod
from ..analytics import yield_check as yield_mod
from ..errors import BadRequest, NotFound
from .fab import FDC_PARAMS


def check_lot_yields(s: Session, k: float = 3.0) -> dict:
    """Lots whose mean yield sits more than k sigma below the fab baseline."""
    if not 1.0 <= k <= 6.0:
        raise BadRequest("'k' must be between 1 and 6")
    return yield_mod.flag_low_yield(repo.lot_yields(s), k=k)


def classify_wafer(s: Session, wafer_id: str) -> dict:
    if repo.get_wafer(s, wafer_id) is None:
        raise NotFound(f"Wafer {wafer_id} not found")
    dies = [(d.x, d.y, d.bin == 1) for d in repo.dies_of_wafer(s, wafer_id)]
    return {"wafer_id": wafer_id, **wafer_map_mod.classify(dies)}


def find_commonality(s: Session, step: str | None = None, k: float = 3.0, top: int = 10) -> dict:
    """Bad wafers sit more than k sigma below the wafer baseline. Which chamber do they share?"""
    if step and not repo.step_exists(s, step):
        raise NotFound(f"Route step {step} not found")
    wafer_yields = repo.wafer_yields(s)
    base = yield_mod.robust_baseline([y for _, y in wafer_yields])
    limit = base.limit(k)
    bad = {w for w, y in wafer_yields if y < limit}
    ranking = commonality_mod.rank_chambers(repo.step_history(s, step), bad, top=top)
    return {
        "bad_wafer_rule": f"yield below {limit:.2f}% (baseline {base.mean:.2f}% - {k} sigma)",
        "bad_wafers": len(bad),
        "wafers": len(wafer_yields),
        "ranking": ranking,
    }


def _chamber_or_404(s: Session, chamber_id: str) -> None:
    if repo.get_chamber(s, chamber_id) is None:
        raise NotFound(f"Chamber {chamber_id} not found")


def _param_column(param: str):
    if param not in FDC_PARAMS:
        raise BadRequest(f"'param' must be one of {sorted(FDC_PARAMS)}")
    return FDC_PARAMS[param]


def _last_pm(s: Session, chamber_id: str):
    pms = [e for e in repo.maintenance_of_chamber(s, chamber_id, None, None) if e.kind == "PM"]
    return pms[-1] if pms else None


def spc_chart(
    s: Session,
    chamber_id: str,
    param: str = "rf_reflected_w",
    baseline_end: datetime | None = None,
) -> dict:
    """X-bar chart per lot visit. Baseline defaults to everything before the chamber's last PM."""
    column = _param_column(param)
    _chamber_or_404(s, chamber_id)
    pm = _last_pm(s, chamber_id)
    if baseline_end is None and pm is not None:
        baseline_end = pm.performed_at

    groups: OrderedDict[str, spc_mod.Subgroup] = OrderedDict()
    for lot_id, run_at, value in repo.fdc_by_lot(s, chamber_id, column):
        if lot_id not in groups:
            groups[lot_id] = spc_mod.Subgroup(at=run_at, values=[])
        groups[lot_id].values.append(float(value))
    try:
        chart = spc_mod.xbar_chart(list(groups.values()), baseline_end)
    except ValueError as e:
        raise BadRequest(str(e)) from None

    lot_ids = list(groups)
    for point, lot_id in zip(chart["points"], lot_ids, strict=True):
        point["lot_id"] = lot_id
    for v in chart["violations"]:
        v["lot_id"] = lot_ids[v["index"]]
    return {
        "chamber_id": chamber_id,
        "param": param,
        "baseline_end": baseline_end.isoformat(timespec="seconds") if baseline_end else None,
        "pm_at": pm.performed_at.isoformat(timespec="seconds") if pm else None,
        **chart,
    }


def compare_around_pm(
    s: Session,
    chamber_id: str,
    param: str = "rf_reflected_w",
    pm_at: datetime | None = None,
    window_days: float = 7.0,
) -> dict:
    """Mean of a sensor in the window before vs after a PM (the chamber's last PM by default)."""
    column = _param_column(param)
    _chamber_or_404(s, chamber_id)
    if pm_at is None:
        pm = _last_pm(s, chamber_id)
        if pm is None:
            raise BadRequest(f"Chamber {chamber_id} has no PM on record")
        pm_at = pm.performed_at
    window = timedelta(days=window_days)
    rows = repo.fdc_by_lot(s, chamber_id, column)
    before = [float(v) for _, t, v in rows if pm_at - window <= t < pm_at]
    after = [float(v) for _, t, v in rows if pm_at <= t < pm_at + window]
    try:
        result = spc_mod.before_after(before, after)
    except ValueError as e:
        raise BadRequest(str(e)) from None
    return {
        "chamber_id": chamber_id,
        "param": param,
        "pm_at": pm_at.isoformat(timespec="seconds"),
        "window_days": window_days,
        **result,
    }
