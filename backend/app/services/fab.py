"""Read services for lots, wafers and chamber sensor data."""

from datetime import datetime

from sqlalchemy.orm import Session

from .. import repository as repo
from ..errors import BadRequest, NotFound
from ..models import FdcSummary

MAX_PAGE = 200
FDC_PARAMS = {
    "rf_reflected_w": FdcSummary.rf_reflected_w,
    "rf_forward_w": FdcSummary.rf_forward_w,
    "pressure_mtorr": FdcSummary.pressure_mtorr,
    "esc_temp_c": FdcSummary.esc_temp_c,
}
LOT_STATUSES = {"COMPLETE", "HOLD"}


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat(timespec="seconds") if dt else None


def parse_int(raw: str | None, name: str, default: int, lo: int, hi: int) -> int:
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise BadRequest(f"'{name}' must be a whole number") from None
    if not lo <= value <= hi:
        raise BadRequest(f"'{name}' must be between {lo} and {hi}")
    return value


def parse_time(raw: str | None, name: str) -> datetime | None:
    if raw is None or raw == "":
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        raise BadRequest(f"'{name}' must be an ISO date or time, e.g. 2026-10-26") from None


def list_lots(s: Session, limit: int = 50, offset: int = 0, status: str | None = None) -> dict:
    if status is not None and status not in LOT_STATUSES:
        raise BadRequest(f"'status' must be one of {sorted(LOT_STATUSES)}")
    rows = repo.list_lots(s, limit, offset, status)
    return {
        "items": [
            {
                "id": lot.id,
                "product": lot.product,
                "status": lot.status,
                "wafer_count": lot.wafer_count,
                "started_at": _iso(lot.started_at),
                "completed_at": _iso(lot.completed_at),
                "mean_yield": round(mean_yield, 2),
            }
            for lot, mean_yield in rows
        ],
        "total": repo.count_lots(s, status),
        "limit": limit,
        "offset": offset,
    }


def get_lot(s: Session, lot_id: str) -> dict:
    lot = repo.get_lot(s, lot_id)
    if lot is None:
        raise NotFound(f"Lot {lot_id} not found")
    wafers = repo.wafers_of_lot(s, lot_id)

    steps: dict[int, dict] = {}
    for row in repo.lot_route_history(s, lot_id):
        step = steps.setdefault(
            row.seq,
            {
                "seq": row.seq,
                "step": row.name,
                "chambers": [],
                "started_at": _iso(row.first_start),
                "ended_at": _iso(row.last_end),
            },
        )
        step["chambers"].append({"chamber_id": row.chamber_id, "wafers": row.wafers})
        step["started_at"] = min(step["started_at"], _iso(row.first_start))
        step["ended_at"] = max(step["ended_at"], _iso(row.last_end))

    yields = [w.yield_pct for w in wafers]
    return {
        "id": lot.id,
        "product": lot.product,
        "status": lot.status,
        "started_at": _iso(lot.started_at),
        "completed_at": _iso(lot.completed_at),
        "mean_yield": round(sum(yields) / len(yields), 2) if yields else None,
        "wafers": [{"id": w.id, "slot": w.slot, "yield_pct": w.yield_pct} for w in wafers],
        "route": list(steps.values()),
    }


def get_wafer_map(s: Session, wafer_id: str) -> dict:
    wafer = repo.get_wafer(s, wafer_id)
    if wafer is None:
        raise NotFound(f"Wafer {wafer_id} not found")
    dies = repo.dies_of_wafer(s, wafer_id)
    bins: dict[int, int] = {}
    for d in dies:
        bins[d.bin] = bins.get(d.bin, 0) + 1
    return {
        "wafer_id": wafer.id,
        "lot_id": wafer.lot_id,
        "die_total": wafer.die_total,
        "die_pass": wafer.die_pass,
        "yield_pct": wafer.yield_pct,
        "bin_counts": {str(k): bins[k] for k in sorted(bins)},
        "dies": [{"x": d.x, "y": d.y, "bin": d.bin} for d in dies],
    }


def get_chamber_fdc(
    s: Session,
    chamber_id: str,
    param: str = "rf_reflected_w",
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 2000,
) -> dict:
    if param not in FDC_PARAMS:
        raise BadRequest(f"'param' must be one of {sorted(FDC_PARAMS)}")
    if start and end and start >= end:
        raise BadRequest("'from' must be before 'to'")
    if repo.get_chamber(s, chamber_id) is None:
        raise NotFound(f"Chamber {chamber_id} not found")
    points = repo.fdc_series(s, chamber_id, FDC_PARAMS[param], start, end, limit)
    events = repo.maintenance_of_chamber(s, chamber_id, start, end)
    return {
        "chamber_id": chamber_id,
        "param": param,
        "points": [
            {"run_at": _iso(p.run_at), "wafer_id": p.wafer_id, "value": p.value} for p in points
        ],
        "maintenance": [
            {"kind": e.kind, "performed_at": _iso(e.performed_at), "notes": e.notes} for e in events
        ],
    }
