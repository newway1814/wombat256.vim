"""Generate the fake fab: four weeks of seeded, realistic history with one planted problem.

The planted problem: after a preventive maintenance (PM) on chamber ETCH-03-B, its RF
match drifts, reflected power creeps up, and wafers it etches at the gate-etch step get
edge-ring failures. Everything else is normal process noise.

Usage:
    python -m scripts.generate_data                  # writes DATABASE_URL (default fabcopilot.db)
    python -m scripts.generate_data --seed 7 --db sqlite:///other.db
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
from sqlalchemy import Engine, insert

from app.db import init_db, make_engine
from app.models import (
    Alarm,
    Base,
    Chamber,
    Defect,
    DieResult,
    FdcSummary,
    Lot,
    MaintenanceEvent,
    RouteStep,
    Tool,
    Wafer,
    WaferStep,
)

DEFAULT_SEED = 42
START = datetime(2026, 10, 12, 6, 0)
DAYS = 28
N_LOTS = 40
WAFERS_PER_LOT = 25
PRODUCT = "MX22-CTRL"

CULPRIT = "ETCH-03-B"
CULPRIT_PM_AT = START + timedelta(days=14, hours=2)  # 2026-10-26 08:00

# seq, name, area, recipe, tools that can run it
ROUTE = [
    (1, "OX-GROW", "DIFF", "OX-THIN-900C", ["FURN-01", "FURN-02"]),
    (2, "LITHO-ACT", "LITHO", "ACT-193I-V3", ["LITH-01", "LITH-02"]),
    (3, "ETCH-STI", "ETCH", "STI-CL2-R4", ["ETCH-01", "ETCH-02"]),
    (4, "CMP-STI", "CMP", "STI-POL-R2", ["CMP-01", "CMP-02"]),
    (5, "IMP-WELL", "IMPLANT", "NWELL-P31-R1", ["IMP-01", "IMP-02"]),
    (6, "LITHO-GATE", "LITHO", "GATE-193I-V5", ["LITH-01", "LITH-02"]),
    (7, "ETCH-GATE", "ETCH", "GATE-HBR-R7", ["ETCH-03", "ETCH-04"]),
    (8, "DEP-SPACER", "DEP", "SPCR-SIN-R3", ["DEP-01", "DEP-02"]),
]
GATE_ETCH_SEQ = 7

TOOL_MODELS = {
    "DIFF": "VF-3000",
    "LITHO": "ArF-i 1980",
    "ETCH": "CX-Etch 300",
    "CMP": "PL-400",
    "IMPLANT": "MC-IMP 3",
    "DEP": "NX-CVD 2",
}

# Routine PMs on other etch chambers, so the culprit's PM isn't the only one.
OTHER_PMS = [
    ("ETCH-01-A", 6),
    ("ETCH-04-A", 10),
    ("ETCH-02-B", 19),
    ("ETCH-03-A", 21),
    ("ETCH-04-B", 24),
]
TECHNICIANS = ["R. Tan", "S. Kumar", "M. Lim", "J. Ong"]

# Die grid: 300 mm wafer, roughly 14 mm dies -> 21 x 21 grid, round edge.
GRID_HALF = 10
DIE_RADIUS = 10.4


@dataclass(frozen=True)
class DieGrid:
    x: np.ndarray
    y: np.ndarray
    r: np.ndarray  # 0 at centre, 1 at the outermost die


def die_grid() -> DieGrid:
    xs, ys = [], []
    for y in range(-GRID_HALF, GRID_HALF + 1):
        for x in range(-GRID_HALF, GRID_HALF + 1):
            if (x * x + y * y) ** 0.5 <= DIE_RADIUS:
                xs.append(x)
                ys.append(y)
    x = np.array(xs)
    y = np.array(ys)
    r = np.sqrt(x**2 + y**2) / DIE_RADIUS
    return DieGrid(x, y, r)


def reflected_power_drift(chamber_id: str, at: datetime) -> float:
    """Extra reflected power (W) on top of normal; non-zero only for the culprit after its PM."""
    if chamber_id != CULPRIT or at < CULPRIT_PM_AT:
        return 0.0
    days = (at - CULPRIT_PM_AT).total_seconds() / 86400
    return min(4.0 + 1.1 * days, 22.0)


def edge_ring_severity(reflected_w: float) -> float:
    """Chance an edge die fails, given the run's reflected power. Normal runs give ~0."""
    return float(np.clip((reflected_w - 15.0) / 14.0, 0.0, 0.9))


def generate(engine: Engine, seed: int = DEFAULT_SEED) -> dict[str, int]:
    """Drop and rebuild every table, then fill it. Returns row counts per table."""
    rng = np.random.default_rng(seed)
    Base.metadata.drop_all(engine)
    init_db(engine)

    rows: dict[str, list[dict]] = {t: [] for t in Base.metadata.tables}

    # --- Static: route, tools, chambers ---------------------------------------------
    tool_area: dict[str, str] = {}
    for seq, name, area, recipe, tools in ROUTE:
        rows["route_steps"].append(
            {"id": seq, "seq": seq, "name": name, "area": area, "recipe": recipe}
        )
        for t in tools:
            tool_area[t] = area

    chambers_of: dict[str, list[str]] = {}
    for tool_id in sorted(tool_area):
        area = tool_area[tool_id]
        rows["tools"].append({"id": tool_id, "area": area, "model": TOOL_MODELS[area]})
        names = ["A", "B"] if area == "ETCH" else ["A"]
        chambers_of[tool_id] = [f"{tool_id}-{n}" for n in names]
        for n in names:
            rows["chambers"].append({"id": f"{tool_id}-{n}", "tool_id": tool_id, "name": n})

    # Normal per-chamber sensor offsets: chambers differ a little, as real ones do.
    etch_chambers = [c for t, cs in chambers_of.items() if tool_area[t] == "ETCH" for c in cs]
    refl_offset = {c: rng.normal(0.0, 0.8) for c in etch_chambers}
    pressure_offset = {c: rng.normal(0.0, 0.4) for c in etch_chambers}

    # --- Maintenance -----------------------------------------------------------------
    pm_list = [(CULPRIT, CULPRIT_PM_AT)] + [
        (c, START + timedelta(days=d, hours=float(rng.uniform(0, 10)))) for c, d in OTHER_PMS
    ]
    pm_list.sort(key=lambda p: p[1])
    for i, (chamber_id, at) in enumerate(pm_list, start=1):
        notes = "Quarterly PM: chamber wet clean, edge ring replaced, RF match recalibrated."
        if chamber_id == CULPRIT:
            notes += " Match capacitor C2 position re-seated."
        rows["maintenance_events"].append(
            {
                "id": i,
                "chamber_id": chamber_id,
                "kind": "PM",
                "performed_at": at,
                "technician": TECHNICIANS[int(rng.integers(len(TECHNICIANS)))],
                "notes": notes,
            }
        )

    # --- Lots, wafers, processing history, FDC, die results, defects -----------------
    grid = die_grid()
    lot_starts = np.sort(rng.uniform(0, DAYS - 4.5, N_LOTS))
    ws_id = 0
    defect_id = 0
    die_id = 0
    last_alarm_at: dict[str, datetime] = {}
    alarm_id = 0

    for li, start_day in enumerate(lot_starts):
        lot_id = f"L{2610_001 + li}"
        lot_start = START + timedelta(days=float(start_day))
        lot_base_fail = rng.uniform(0.03, 0.07)  # lot-to-lot variation
        t = lot_start

        # Where each wafer ran at each step, and the gate-etch reflected power per wafer.
        wafer_ids = [f"{lot_id}-{s:02d}" for s in range(1, WAFERS_PER_LOT + 1)]
        gate_refl = np.zeros(WAFERS_PER_LOT)
        gate_time: list[datetime] = [lot_start] * WAFERS_PER_LOT

        for seq, _name, area, recipe, tools in ROUTE:
            t += timedelta(hours=float(rng.uniform(2.0, 9.0)))  # queue time
            tool_id = tools[int(rng.integers(len(tools)))]
            chambers = chambers_of[tool_id]
            for wi, wafer_id in enumerate(wafer_ids):
                # Etch tools split a lot's wafers across chambers A and B.
                chamber_id = chambers[int(rng.integers(len(chambers)))]
                started = t + timedelta(minutes=4 * wi)
                ended = started + timedelta(minutes=float(rng.uniform(3.0, 5.0)))
                ws_id += 1
                rows["wafer_steps"].append(
                    {
                        "id": ws_id,
                        "wafer_id": wafer_id,
                        "step_id": seq,
                        "chamber_id": chamber_id,
                        "recipe": recipe,
                        "started_at": started,
                        "ended_at": ended,
                    }
                )
                if area != "ETCH":
                    continue
                refl = (
                    12.0
                    + refl_offset[chamber_id]
                    + reflected_power_drift(chamber_id, started)
                    + rng.normal(0.0, 1.2)
                )
                rows["fdc_summaries"].append(
                    {
                        "id": ws_id,
                        "wafer_step_id": ws_id,
                        "chamber_id": chamber_id,
                        "run_at": started,
                        "rf_forward_w": round(float(1500 + rng.normal(0, 4)), 2),
                        "rf_reflected_w": round(float(refl), 2),
                        "pressure_mtorr": round(
                            float(30 + pressure_offset[chamber_id] + rng.normal(0, 0.5)), 2
                        ),
                        "esc_temp_c": round(float(60 + rng.normal(0, 0.6)), 2),
                    }
                )
                # Tool raises a warning when reflected power is high (at most every 6 hours).
                last = last_alarm_at.get(chamber_id)
                if refl > 20.0 and (last is None or started - last > timedelta(hours=6)):
                    alarm_id += 1
                    last_alarm_at[chamber_id] = started
                    rows["alarms"].append(
                        {
                            "id": alarm_id,
                            "chamber_id": chamber_id,
                            "code": "RF-REFL-HI",
                            "severity": "WARN" if refl < 26.0 else "ALARM",
                            "message": f"Reflected RF power {refl:.1f} W above 20 W limit",
                            "raised_at": started,
                        }
                    )
                if seq == GATE_ETCH_SEQ:
                    gate_refl[wi] = refl
                    gate_time[wi] = ended
            t = started + timedelta(minutes=10)

        lot_end = t
        rows["lots"].append(
            {
                "id": lot_id,
                "product": PRODUCT,
                "wafer_count": WAFERS_PER_LOT,
                "started_at": lot_start,
                "completed_at": lot_end,
                "status": "COMPLETE",
            }
        )

        for wi, wafer_id in enumerate(wafer_ids):
            severity = edge_ring_severity(gate_refl[wi])
            p_fail = np.full(grid.r.shape, lot_base_fail + rng.normal(0, 0.008))
            # Random clusters (scratches, particles) happen on a few wafers anywhere.
            if rng.random() < 0.08:
                cx, cy = rng.integers(-7, 8, 2)
                near = (grid.x - cx) ** 2 + (grid.y - cy) ** 2 <= 4
                p_fail = np.where(near, 0.6, p_fail)
            edge = grid.r > 0.78
            p_edge = np.where(edge, severity, 0.0)
            fail_random = rng.random(grid.r.shape) < np.clip(p_fail, 0, 1)
            fail_edge = rng.random(grid.r.shape) < p_edge
            failed = fail_random | fail_edge
            random_bins = rng.choice([2, 3, 5, 6, 7], size=grid.r.shape)
            bins = np.where(fail_edge, 4, np.where(fail_random, random_bins, 1))

            for k in range(grid.r.size):
                die_id += 1
                rows["die_results"].append(
                    {
                        "id": die_id,
                        "wafer_id": wafer_id,
                        "x": int(grid.x[k]),
                        "y": int(grid.y[k]),
                        "passed": not bool(failed[k]),
                        "bin": int(bins[k]),
                    }
                )
            die_total = int(grid.r.size)
            die_pass = die_total - int(failed.sum())
            rows["wafers"].append(
                {
                    "id": wafer_id,
                    "lot_id": lot_id,
                    "slot": wi + 1,
                    "die_total": die_total,
                    "die_pass": die_pass,
                    "yield_pct": round(100.0 * die_pass / die_total, 2),
                }
            )

            # Inline inspection after gate etch: a few random defects, plus edge residue.
            n_random = int(rng.poisson(3))
            n_edge = int(rng.poisson(18 * severity))
            for kind, n in (("random", n_random), ("edge", n_edge)):
                for _ in range(n):
                    angle = rng.uniform(0, 2 * np.pi)
                    if kind == "edge":
                        radius = rng.uniform(122, 147)
                        cls = "ETCH-RESIDUE"
                    else:
                        radius = 147 * np.sqrt(rng.random())
                        cls = str(rng.choice(["PARTICLE", "SCRATCH", "PATTERN"]))
                    defect_id += 1
                    rows["defects"].append(
                        {
                            "id": defect_id,
                            "wafer_id": wafer_id,
                            "step_id": GATE_ETCH_SEQ,
                            "x_mm": round(float(radius * np.cos(angle)), 1),
                            "y_mm": round(float(radius * np.sin(angle)), 1),
                            "size_um": round(float(rng.lognormal(-0.5, 0.5)), 3),
                            "defect_class": cls,
                            "found_at": gate_time[wi] + timedelta(hours=1),
                        }
                    )

    # A few benign alarms on healthy chambers, so alarms aren't a giveaway on their own.
    for _ in range(12):
        alarm_id += 1
        chamber_id = etch_chambers[int(rng.integers(len(etch_chambers)))]
        rows["alarms"].append(
            {
                "id": alarm_id,
                "chamber_id": chamber_id,
                "code": str(rng.choice(["PRESS-FLUCT", "HE-FLOW-LO", "DOOR-OPEN"])),
                "severity": "WARN",
                "message": "Transient condition, cleared automatically",
                "raised_at": START + timedelta(days=float(rng.uniform(0, DAYS))),
            }
        )

    # --- Write, parents before children --------------------------------------------
    order = [
        RouteStep,
        Tool,
        Chamber,
        Lot,
        Wafer,
        WaferStep,
        FdcSummary,
        DieResult,
        Defect,
        MaintenanceEvent,
        Alarm,
    ]
    with engine.begin() as conn:
        for model in order:
            data = rows[model.__tablename__]
            if data:
                conn.execute(insert(model), data)

    return {name: len(data) for name, data in rows.items()}


def main() -> None:
    from app.config import Config

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--db", default=Config.DATABASE_URL)
    args = parser.parse_args()

    counts = generate(make_engine(args.db), seed=args.seed)
    width = max(len(k) for k in counts)
    for table, n in counts.items():
        print(f"{table:<{width}}  {n:>7}")


if __name__ == "__main__":
    main()
