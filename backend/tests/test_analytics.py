"""M3: each analytics module on hand-made inputs, then on the fake fab."""

from datetime import datetime, timedelta

import numpy as np
import pytest
from sqlalchemy import select

from app import repository as repo
from app.analytics import commonality, spc, wafer_map, yield_check
from app.errors import BadRequest, NotFound
from app.models import RouteStep, WaferStep
from app.services import analytics
from scripts.generate_data import CULPRIT, CULPRIT_PM_AT, GATE_ETCH_SEQ, die_grid

# --- Hand-made inputs ------------------------------------------------------------------


def test_yield_flags_only_the_low_lot():
    items = [(f"L{i}", 95 + 0.5 * np.sin(i)) for i in range(20)] + [("BAD", 80.0)]
    result = yield_check.flag_low_yield(items)
    assert [f["id"] for f in result["flagged"]] == ["BAD"]
    assert result["flagged"][0]["sigmas_below"] > 3


def test_yield_baseline_is_not_dragged_down_by_bad_lots():
    good = [95.0 + d for d in (-0.6, -0.3, 0.0, 0.2, 0.4, 0.5, -0.1, 0.1)]
    base = yield_check.robust_baseline(good + [60.0, 62.0])
    assert 94.5 < base.mean < 95.5


def synthetic_map(fail) -> list[tuple[int, int, bool]]:
    g = die_grid()
    return [
        (int(x), int(y), not fail(int(x), int(y), r)) for x, y, r in zip(g.x, g.y, g.r, strict=True)
    ]


def test_map_edge_ring():
    assert wafer_map.classify(synthetic_map(lambda x, y, r: r > 0.85))["label"] == "edge_ring"


def test_map_cluster():
    def blob(x, y, r):
        return (x - 2) ** 2 + (y + 1) ** 2 <= 4

    assert wafer_map.classify(synthetic_map(blob))["label"] == "cluster"


def test_map_clean_and_random():
    assert wafer_map.classify(synthetic_map(lambda x, y, r: False))["label"] == "clean"
    scattered = synthetic_map(lambda x, y, r: (x * 7 + y * 3) % 13 == 0)
    assert wafer_map.classify(scattered)["label"] == "random"


def test_commonality_finds_the_shared_chamber_and_corrects_for_many_tests():
    history = []
    for w in range(100):
        wid = f"W{w}"
        history.append((wid, "ETCH", "E-1" if w < 50 else "E-2"))
        history.append((wid, "DEP", "D-1" if w % 2 else "D-2"))
    bad = {f"W{w}" for w in range(0, 20)}  # all ran in E-1
    ranking = commonality.rank_chambers(history, bad)
    top = ranking[0]
    assert (top["step"], top["chamber_id"]) == ("ETCH", "E-1")
    assert top["p_adjusted"] == pytest.approx(min(1.0, top["p_value"] * 4))
    assert top["p_adjusted"] < 1e-6
    dep = [r for r in ranking if r["step"] == "DEP"]
    assert all(r["p_adjusted"] > 0.05 for r in dep)


@pytest.mark.parametrize(
    "z, rule",
    [
        ([0, 0, 3.5], 1),
        ([0, 2.5, 2.4], 2),
        ([1.2, 1.5, 0.2, 1.1, 1.3], 3),
        ([0.3] * 8, 4),
    ],
)
def test_western_electric_rules(z, rule):
    assert rule in {v["rule"] for v in spc.western_electric(z)}


def test_western_electric_quiet_on_noise():
    assert spc.western_electric([0.5, -0.4, 1.1, -1.3, 0.2, -0.8, 0.9, -0.1, 0.4, -0.6]) == []


def test_xbar_flags_a_shift_after_baseline():
    rng = np.random.default_rng(1)
    t0 = datetime(2026, 1, 1)
    groups = [
        spc.Subgroup(t0 + timedelta(days=i), list(rng.normal(10 + (3 if i >= 10 else 0), 1, 8)))
        for i in range(16)
    ]
    chart = spc.xbar_chart(groups, baseline_end=t0 + timedelta(days=10))
    assert chart["out_of_control"]
    assert min(v["index"] for v in chart["violations"]) >= 10


def test_before_after_detects_shift():
    result = spc.before_after([10.0, 10.2, 9.9, 10.1, 9.8], [13.0, 13.2, 12.9, 13.1])
    assert result["shift"] == pytest.approx(3.04, abs=0.01)
    assert result["p_value"] < 0.001


# --- On the fake fab -------------------------------------------------------------------


@pytest.fixture
def s(fab_app):
    session = fab_app.extensions["db_session"]()
    yield session
    session.close()


def test_commonality_ranks_culprit_first_with_tiny_p(s):
    result = analytics.find_commonality(s)
    top = result["ranking"][0]
    assert (top["step"], top["chamber_id"]) == ("ETCH-GATE", CULPRIT)
    assert top["p_adjusted"] < 1e-20
    # Lot-level routing makes other tools look somewhat guilty (confounding),
    # but the culprit wins by many orders of magnitude.
    assert result["ranking"][1]["p_adjusted"] > 1e6 * top["p_adjusted"]


def test_commonality_unknown_step_is_404(s):
    with pytest.raises(NotFound):
        analytics.find_commonality(s, step="NOPE")


def culprit_wafers_after_pm(s) -> set[str]:
    q = (
        select(WaferStep.wafer_id)
        .join(RouteStep, RouteStep.id == WaferStep.step_id)
        .where(
            RouteStep.seq == GATE_ETCH_SEQ,
            WaferStep.chamber_id == CULPRIT,
            WaferStep.started_at >= CULPRIT_PM_AT,
        )
    )
    return set(s.scalars(q))


def test_edge_ring_maps_come_only_from_the_culprit(s):
    suspects = culprit_wafers_after_pm(s)
    labels = {w: analytics.classify_wafer(s, w)["label"] for w, _ in repo.wafer_yields(s)}
    edge = {w for w, label in labels.items() if label == "edge_ring"}
    assert len(edge) >= 30
    assert edge <= suspects
    assert any(label == "clean" for w, label in labels.items() if w not in suspects)


def test_flagged_lots_all_ran_in_the_culprit_after_pm(s):
    result = analytics.check_lot_yields(s)
    flagged = {f["id"] for f in result["flagged"]}
    suspect_lots = {w.rsplit("-", 1)[0] for w in culprit_wafers_after_pm(s)}
    assert flagged and flagged <= suspect_lots


def test_spc_fires_on_culprit_after_pm_and_is_quiet_before(s):
    chart = analytics.spc_chart(s, CULPRIT)
    assert chart["pm_at"] == CULPRIT_PM_AT.isoformat(timespec="seconds")
    assert chart["out_of_control"]
    baseline = [p for p in chart["points"] if p["baseline"]]
    assert len(baseline) >= 5
    flagged_points = {chart["points"][v["index"]]["at"] for v in chart["violations"]}
    assert all(at >= chart["pm_at"] for at in flagged_points)


def test_spc_quiet_on_a_healthy_chamber(s):
    assert not analytics.spc_chart(s, "ETCH-04-A")["out_of_control"]


def test_before_after_pm(s):
    culprit = analytics.compare_around_pm(s, CULPRIT)
    assert culprit["shift"] > 5 and culprit["p_value"] < 1e-10
    healthy = analytics.compare_around_pm(s, "ETCH-04-A")
    assert abs(healthy["shift"]) < 1 and healthy["p_value"] > 0.01


def test_service_input_errors(s):
    with pytest.raises(NotFound):
        analytics.spc_chart(s, "ETCH-99-Z")
    with pytest.raises(BadRequest):
        analytics.spc_chart(s, CULPRIT, param="voltage")
    with pytest.raises(BadRequest):
        analytics.compare_around_pm(s, "FURN-01-A")  # no PM on record
    with pytest.raises(BadRequest):
        analytics.check_lot_yields(s, k=0.5)
