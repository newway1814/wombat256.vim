"""M1: the fake fab is reproducible and the planted problem is really there."""

import hashlib

import pytest
from sqlalchemy import DateTime, Engine, bindparam, text

from app.db import make_engine
from app.models import Base
from scripts.generate_data import CULPRIT, CULPRIT_PM_AT, GATE_ETCH_SEQ, generate


def q(sql: str):
    """A SQL query whose :pm parameter is typed as a timestamp."""
    return text(sql).bindparams(bindparam("pm", type_=DateTime))


def fingerprint(engine: Engine) -> str:
    """A hash of every row in every table, in a fixed order."""
    h = hashlib.sha256()
    with engine.connect() as conn:
        for name in sorted(Base.metadata.tables):
            for row in conn.execute(text(f"SELECT * FROM {name} ORDER BY 1")):
                h.update(repr(tuple(row)).encode())
    return h.hexdigest()


@pytest.fixture(scope="module")
def fab() -> Engine:
    engine = make_engine("sqlite:///:memory:")
    generate(engine, seed=42)
    return engine


GATE_ETCH_YIELD = """
    SELECT ws.chamber_id,
           ws.started_at >= :pm AS after_pm,
           AVG(w.yield_pct)     AS mean_yield,
           COUNT(*)             AS n
    FROM wafer_steps ws JOIN wafers w ON w.id = ws.wafer_id
    WHERE ws.step_id = :step
    GROUP BY ws.chamber_id, after_pm
"""


def gate_etch_yields(engine: Engine) -> dict[tuple[str, bool], tuple[float, int]]:
    with engine.connect() as conn:
        result = conn.execute(q(GATE_ETCH_YIELD), {"pm": CULPRIT_PM_AT, "step": GATE_ETCH_SEQ})
        return {(r.chamber_id, bool(r.after_pm)): (r.mean_yield, r.n) for r in result}


def test_same_seed_gives_identical_data(fab):
    again = make_engine("sqlite:///:memory:")
    generate(again, seed=42)
    assert fingerprint(again) == fingerprint(fab)


def test_different_seed_gives_different_data(fab):
    other = make_engine("sqlite:///:memory:")
    generate(other, seed=7)
    assert fingerprint(other) != fingerprint(fab)


def test_expected_size(fab):
    with fab.connect() as conn:
        count = lambda t: conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar_one()  # noqa: E731
        assert count("lots") == 40
        assert count("wafers") == 1000
        assert count("route_steps") == 8
        assert count("chambers") == 18  # 4 etch tools x 2 + 10 single-chamber tools
        assert count("wafer_steps") == 8000
        assert count("fdc_summaries") == 2000  # two etch steps per wafer
        assert count("work_orders") == 0 and count("audit_log") == 0


def test_culprit_wafers_after_pm_have_clearly_lower_yield(fab):
    y = gate_etch_yields(fab)
    culprit_after, n = y[(CULPRIT, True)]
    healthy = [mean for (c, _), (mean, _) in y.items() if c != CULPRIT]
    assert n >= 30, "enough wafers ran in the culprit after its PM"
    assert culprit_after < min(healthy) - 8, (culprit_after, healthy)


def test_culprit_was_normal_before_its_pm(fab):
    y = gate_etch_yields(fab)
    before, _ = y[(CULPRIT, False)]
    healthy = [mean for (c, _), (mean, _) in y.items() if c != CULPRIT]
    assert min(healthy) - 2 < before < max(healthy) + 2


def test_other_chambers_look_normal_with_noise(fab):
    with fab.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT w.yield_pct FROM wafer_steps ws JOIN wafers w ON w.id = ws.wafer_id
                WHERE ws.step_id = :step AND ws.chamber_id != :culprit
                """
            ),
            {"step": GATE_ETCH_SEQ, "culprit": CULPRIT},
        ).scalars()
        yields = list(rows)
    mean = sum(yields) / len(yields)
    spread = max(yields) - min(yields)
    assert 90 < mean < 97, mean  # healthy wafers yield in the low-to-mid 90s
    assert spread > 5, "realistic noise, not identical wafers"


def test_reflected_power_drifts_only_on_culprit_after_pm(fab):
    with fab.connect() as conn:
        rows = conn.execute(
            q(
                """
                SELECT chamber_id, run_at >= :pm AS after_pm, AVG(rf_reflected_w) AS refl
                FROM fdc_summaries GROUP BY chamber_id, after_pm
                """
            ),
            {"pm": CULPRIT_PM_AT},
        ).all()
    refl = {(r.chamber_id, bool(r.after_pm)): r.refl for r in rows}
    assert refl[(CULPRIT, True)] > refl[(CULPRIT, False)] + 5
    others = [v for (c, _), v in refl.items() if c != CULPRIT]
    assert max(others) < 15


def test_edge_ring_is_at_the_edge(fab):
    """Culprit wafers after the PM fail mostly at the edge, in bin 4."""
    with fab.connect() as conn:
        row = conn.execute(
            q(
                """
                SELECT
                  AVG(CASE WHEN d.x*d.x + d.y*d.y > 64 THEN 1.0 - d.passed END) AS edge_fail,
                  AVG(CASE WHEN d.x*d.x + d.y*d.y < 25 THEN 1.0 - d.passed END) AS centre_fail
                FROM die_results d
                JOIN wafer_steps ws ON ws.wafer_id = d.wafer_id AND ws.step_id = :step
                WHERE ws.chamber_id = :culprit AND ws.started_at >= :pm
                """
            ),
            {"step": GATE_ETCH_SEQ, "culprit": CULPRIT, "pm": CULPRIT_PM_AT},
        ).one()
    assert row.edge_fail > 3 * row.centre_fail
