"""The fab database: 13 tables shaped like MES, FDC, inspection and maintenance data.

How they connect:

    route_steps ─┐
    tools ── chambers ──┐
    lots ── wafers ── wafer_steps (which chamber ran which wafer at which step)
                 │          └── fdc_summaries (sensor readings for that run)
                 ├── die_results (pass/fail per die = the wafer map)
                 └── defects (inline inspection finds)
    chambers ── maintenance_events, alarms
    work_orders, audit_log (written by the agent and humans, from M5)
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class RouteStep(Base):
    """One process stage on the route, in order (seq 1..8)."""

    __tablename__ = "route_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    seq: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(32), unique=True)  # e.g. ETCH-GATE
    area: Mapped[str] = mapped_column(String(16))  # ETCH, LITHO, ...
    recipe: Mapped[str] = mapped_column(String(32))


class Tool(Base):
    __tablename__ = "tools"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # e.g. ETCH-03
    area: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(32))


class Chamber(Base):
    __tablename__ = "chambers"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # e.g. ETCH-03-B
    tool_id: Mapped[str] = mapped_column(ForeignKey("tools.id"))
    name: Mapped[str] = mapped_column(String(4))  # A, B


class Lot(Base):
    __tablename__ = "lots"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # e.g. L2610-001
    product: Mapped[str] = mapped_column(String(16))
    wafer_count: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    completed_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(16))  # COMPLETE, HOLD


class Wafer(Base):
    __tablename__ = "wafers"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)  # e.g. L2610-001-07
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.id"), index=True)
    slot: Mapped[int] = mapped_column(Integer)  # 1..25
    die_total: Mapped[int] = mapped_column(Integer)
    die_pass: Mapped[int] = mapped_column(Integer)
    yield_pct: Mapped[float] = mapped_column(Float)


class WaferStep(Base):
    """Processing history: one row per wafer per route step."""

    __tablename__ = "wafer_steps"
    __table_args__ = (
        UniqueConstraint("wafer_id", "step_id"),
        Index("ix_wafer_steps_chamber_time", "chamber_id", "started_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    wafer_id: Mapped[str] = mapped_column(ForeignKey("wafers.id"), index=True)
    step_id: Mapped[int] = mapped_column(ForeignKey("route_steps.id"))
    chamber_id: Mapped[str] = mapped_column(ForeignKey("chambers.id"))
    recipe: Mapped[str] = mapped_column(String(32))
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime] = mapped_column(DateTime)


class FdcSummary(Base):
    """Sensor summary for one wafer run in an etch chamber (FDC)."""

    __tablename__ = "fdc_summaries"

    id: Mapped[int] = mapped_column(primary_key=True)
    wafer_step_id: Mapped[int] = mapped_column(ForeignKey("wafer_steps.id"), unique=True)
    chamber_id: Mapped[str] = mapped_column(ForeignKey("chambers.id"), index=True)
    run_at: Mapped[datetime] = mapped_column(DateTime)
    rf_forward_w: Mapped[float] = mapped_column(Float)
    rf_reflected_w: Mapped[float] = mapped_column(Float)
    pressure_mtorr: Mapped[float] = mapped_column(Float)
    esc_temp_c: Mapped[float] = mapped_column(Float)


class DieResult(Base):
    """Wafer sort result for one die: the wafer map is all dies of one wafer."""

    __tablename__ = "die_results"
    __table_args__ = (UniqueConstraint("wafer_id", "x", "y"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    wafer_id: Mapped[str] = mapped_column(ForeignKey("wafers.id"), index=True)
    x: Mapped[int] = mapped_column(Integer)
    y: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    bin: Mapped[int] = mapped_column(Integer)  # 1 = good; 2..7 = fail bins


class Defect(Base):
    """A defect found by inline inspection after gate etch."""

    __tablename__ = "defects"

    id: Mapped[int] = mapped_column(primary_key=True)
    wafer_id: Mapped[str] = mapped_column(ForeignKey("wafers.id"), index=True)
    step_id: Mapped[int] = mapped_column(ForeignKey("route_steps.id"))
    x_mm: Mapped[float] = mapped_column(Float)  # from wafer centre
    y_mm: Mapped[float] = mapped_column(Float)
    size_um: Mapped[float] = mapped_column(Float)
    defect_class: Mapped[str] = mapped_column(String(24))
    found_at: Mapped[datetime] = mapped_column(DateTime)


class MaintenanceEvent(Base):
    __tablename__ = "maintenance_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    chamber_id: Mapped[str] = mapped_column(ForeignKey("chambers.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # PM, REPAIR
    performed_at: Mapped[datetime] = mapped_column(DateTime)
    technician: Mapped[str] = mapped_column(String(32))
    notes: Mapped[str] = mapped_column(Text)


class Alarm(Base):
    __tablename__ = "alarms"

    id: Mapped[int] = mapped_column(primary_key=True)
    chamber_id: Mapped[str] = mapped_column(ForeignKey("chambers.id"), index=True)
    code: Mapped[str] = mapped_column(String(16))
    severity: Mapped[str] = mapped_column(String(8))  # WARN, ALARM
    message: Mapped[str] = mapped_column(Text)
    raised_at: Mapped[datetime] = mapped_column(DateTime)


class WorkOrder(Base):
    """Drafted by the agent; only a human approves or rejects (M5)."""

    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    chamber_id: Mapped[str] = mapped_column(ForeignKey("chambers.id"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="DRAFT")  # DRAFT, APPROVED, REJECTED
    created_at: Mapped[datetime] = mapped_column(DateTime)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AuditLog(Base):
    """Every agent tool call and every human decision, in order (M5)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime)
    actor: Mapped[str] = mapped_column(String(64))  # "agent" or a user name
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str] = mapped_column(Text)
