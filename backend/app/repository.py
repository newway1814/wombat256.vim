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
