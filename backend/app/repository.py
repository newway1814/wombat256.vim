"""Repository layer: the only place that knows how data is stored. Returns plain rows."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (
    Chamber,
    DieResult,
    FdcSummary,
    Lot,
    MaintenanceEvent,
    RouteStep,
    Wafer,
    WaferStep,
)


def count_lots(s: Session, status: str | None = None) -> int:
    q = select(func.count()).select_from(Lot)
    if status:
        q = q.where(Lot.status == status)
    return s.execute(q).scalar_one()


def list_lots(s: Session, limit: int, offset: int, status: str | None = None):
    """Lots newest first, each with its mean wafer yield."""
    q = (
        select(Lot, func.avg(Wafer.yield_pct).label("mean_yield"))
        .join(Wafer, Wafer.lot_id == Lot.id)
        .group_by(Lot.id)
        .order_by(Lot.started_at.desc(), Lot.id)
        .limit(limit)
        .offset(offset)
    )
    if status:
        q = q.where(Lot.status == status)
    return s.execute(q).all()


def get_lot(s: Session, lot_id: str) -> Lot | None:
    return s.get(Lot, lot_id)


def wafers_of_lot(s: Session, lot_id: str) -> list[Wafer]:
    return list(s.scalars(select(Wafer).where(Wafer.lot_id == lot_id).order_by(Wafer.slot)))


def lot_route_history(s: Session, lot_id: str):
    """Per route step: which chamber ran how many of the lot's wafers, and when."""
    q = (
        select(
            RouteStep.seq,
            RouteStep.name,
            WaferStep.chamber_id,
            func.count().label("wafers"),
            func.min(WaferStep.started_at).label("first_start"),
            func.max(WaferStep.ended_at).label("last_end"),
        )
        .join(RouteStep, RouteStep.id == WaferStep.step_id)
        .join(Wafer, Wafer.id == WaferStep.wafer_id)
        .where(Wafer.lot_id == lot_id)
        .group_by(RouteStep.seq, RouteStep.name, WaferStep.chamber_id)
        .order_by(RouteStep.seq, WaferStep.chamber_id)
    )
    return s.execute(q).all()


def get_wafer(s: Session, wafer_id: str) -> Wafer | None:
    return s.get(Wafer, wafer_id)


def dies_of_wafer(s: Session, wafer_id: str):
    q = (
        select(DieResult.x, DieResult.y, DieResult.bin)
        .where(DieResult.wafer_id == wafer_id)
        .order_by(DieResult.y, DieResult.x)
    )
    return s.execute(q).all()


def get_chamber(s: Session, chamber_id: str) -> Chamber | None:
    return s.get(Chamber, chamber_id)


def fdc_series(
    s: Session,
    chamber_id: str,
    column,
    start: datetime | None,
    end: datetime | None,
    limit: int,
):
    q = (
        select(FdcSummary.run_at, WaferStep.wafer_id, column.label("value"))
        .join(WaferStep, WaferStep.id == FdcSummary.wafer_step_id)
        .where(FdcSummary.chamber_id == chamber_id)
        .order_by(FdcSummary.run_at)
        .limit(limit)
    )
    if start:
        q = q.where(FdcSummary.run_at >= start)
    if end:
        q = q.where(FdcSummary.run_at < end)
    return s.execute(q).all()


def maintenance_of_chamber(
    s: Session, chamber_id: str, start: datetime | None, end: datetime | None
) -> list[MaintenanceEvent]:
    q = (
        select(MaintenanceEvent)
        .where(MaintenanceEvent.chamber_id == chamber_id)
        .order_by(MaintenanceEvent.performed_at)
    )
    if start:
        q = q.where(MaintenanceEvent.performed_at >= start)
    if end:
        q = q.where(MaintenanceEvent.performed_at < end)
    return list(s.scalars(q))


def lot_yields(s: Session) -> list[tuple[str, float]]:
    q = (
        select(Wafer.lot_id, func.avg(Wafer.yield_pct))
        .group_by(Wafer.lot_id)
        .order_by(Wafer.lot_id)
    )
    return [(lot_id, float(y)) for lot_id, y in s.execute(q)]


def wafer_yields(s: Session) -> list[tuple[str, float]]:
    q = select(Wafer.id, Wafer.yield_pct).order_by(Wafer.id)
    return [(wafer_id, float(y)) for wafer_id, y in s.execute(q)]


def step_history(s: Session, step: str | None = None) -> list[tuple[str, str, str]]:
    """(wafer_id, step name, chamber_id) for every wafer at every step (or one step)."""
    q = select(WaferStep.wafer_id, RouteStep.name, WaferStep.chamber_id).join(
        RouteStep, RouteStep.id == WaferStep.step_id
    )
    if step:
        q = q.where(RouteStep.name == step)
    return [tuple(r) for r in s.execute(q)]


def step_exists(s: Session, step: str) -> bool:
    return s.execute(select(RouteStep.id).where(RouteStep.name == step)).first() is not None


def fdc_by_lot(s: Session, chamber_id: str, column):
    """(lot_id, run_at, value) for every run in a chamber, oldest first."""
    q = (
        select(Wafer.lot_id, FdcSummary.run_at, column.label("value"))
        .join(WaferStep, WaferStep.id == FdcSummary.wafer_step_id)
        .join(Wafer, Wafer.id == WaferStep.wafer_id)
        .where(FdcSummary.chamber_id == chamber_id)
        .order_by(FdcSummary.run_at)
    )
    return s.execute(q).all()


def alarms_of_chamber(s: Session, chamber_id: str, start: datetime | None, end: datetime | None):
    from .models import Alarm

    q = select(Alarm).where(Alarm.chamber_id == chamber_id).order_by(Alarm.raised_at)
    if start:
        q = q.where(Alarm.raised_at >= start)
    if end:
        q = q.where(Alarm.raised_at < end)
    return list(s.scalars(q))
