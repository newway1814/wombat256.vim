"""M2: every endpoint, the happy path and the error paths."""

import pytest

from scripts.generate_data import CULPRIT

FIRST_LOT = "L2610001"
FIRST_WAFER = f"{FIRST_LOT}-01"


def error_code(response) -> str:
    return response.get_json()["error"]["code"]


# --- /api/lots -------------------------------------------------------------------------


def test_list_lots_defaults(fab_client):
    r = fab_client.get("/api/lots")
    assert r.status_code == 200
    body = r.get_json()
    assert body["total"] == 40
    assert body["limit"] == 50 and body["offset"] == 0
    assert len(body["items"]) == 40
    starts = [lot["started_at"] for lot in body["items"]]
    assert starts == sorted(starts, reverse=True), "newest first"
    first = body["items"][0]
    assert set(first) == {
        "id",
        "product",
        "status",
        "wafer_count",
        "started_at",
        "completed_at",
        "mean_yield",
    }
    assert 0 < first["mean_yield"] <= 100


def test_list_lots_pages(fab_client):
    page1 = fab_client.get("/api/lots?limit=10").get_json()["items"]
    page2 = fab_client.get("/api/lots?limit=10&offset=10").get_json()["items"]
    assert len(page1) == len(page2) == 10
    assert not {lot["id"] for lot in page1} & {lot["id"] for lot in page2}


@pytest.mark.parametrize(
    "query",
    ["limit=0", "limit=201", "limit=ten", "offset=-1", "status=LOST"],
)
def test_list_lots_bad_input_is_400(fab_client, query):
    r = fab_client.get(f"/api/lots?{query}")
    assert r.status_code == 400
    assert error_code(r) == "bad_request"
    assert r.get_json()["error"]["message"]


# --- /api/lots/<id> --------------------------------------------------------------------


def test_get_lot(fab_client):
    r = fab_client.get(f"/api/lots/{FIRST_LOT}")
    assert r.status_code == 200
    lot = r.get_json()
    assert lot["id"] == FIRST_LOT
    assert len(lot["wafers"]) == 25
    assert [w["slot"] for w in lot["wafers"]] == list(range(1, 26))
    assert [s["seq"] for s in lot["route"]] == list(range(1, 9))
    for step in lot["route"]:
        assert sum(c["wafers"] for c in step["chambers"]) == 25
        assert step["started_at"] <= step["ended_at"]
    gate_etch = lot["route"][6]
    assert gate_etch["step"] == "ETCH-GATE"
    assert {c["chamber_id"][-1] for c in gate_etch["chambers"]} <= {"A", "B"}


def test_get_lot_unknown_is_404(fab_client):
    r = fab_client.get("/api/lots/NOPE")
    assert r.status_code == 404
    assert error_code(r) == "not_found"
    assert "NOPE" in r.get_json()["error"]["message"]


# --- /api/wafers/<id>/map --------------------------------------------------------------


def test_wafer_map(fab_client):
    r = fab_client.get(f"/api/wafers/{FIRST_WAFER}/map")
    assert r.status_code == 200
    m = r.get_json()
    assert m["lot_id"] == FIRST_LOT
    assert len(m["dies"]) == m["die_total"] == 341
    assert sum(m["bin_counts"].values()) == m["die_total"]
    assert m["bin_counts"].get("1", 0) == m["die_pass"]
    assert {"x", "y", "bin"} == set(m["dies"][0])


def test_wafer_map_unknown_is_404(fab_client):
    r = fab_client.get("/api/wafers/NOPE-01/map")
    assert r.status_code == 404
    assert error_code(r) == "not_found"


# --- /api/chambers/<id>/fdc ------------------------------------------------------------


def test_chamber_fdc_defaults_to_reflected_power(fab_client):
    r = fab_client.get(f"/api/chambers/{CULPRIT}/fdc")
    assert r.status_code == 200
    body = r.get_json()
    assert body["param"] == "rf_reflected_w"
    times = [p["run_at"] for p in body["points"]]
    assert times == sorted(times) and len(times) > 100
    assert [e["kind"] for e in body["maintenance"]] == ["PM"]


def test_chamber_fdc_param_and_window(fab_client):
    r = fab_client.get(
        f"/api/chambers/{CULPRIT}/fdc?param=pressure_mtorr&from=2026-10-20&to=2026-10-27"
    )
    assert r.status_code == 200
    points = r.get_json()["points"]
    assert points
    assert all("2026-10-20" <= p["run_at"] < "2026-10-27" for p in points)
    assert all(25 < p["value"] < 35 for p in points)


@pytest.mark.parametrize(
    "query",
    [
        "param=voltage",
        "from=yesterday",
        "from=2026-10-27&to=2026-10-20",
        "limit=0",
    ],
)
def test_chamber_fdc_bad_input_is_400(fab_client, query):
    r = fab_client.get(f"/api/chambers/{CULPRIT}/fdc?{query}")
    assert r.status_code == 400
    assert error_code(r) == "bad_request"


def test_chamber_fdc_unknown_chamber_is_404(fab_client):
    r = fab_client.get("/api/chambers/ETCH-99-Z/fdc")
    assert r.status_code == 404


# --- Anything else ---------------------------------------------------------------------


def test_unknown_route_is_json_404(fab_client):
    r = fab_client.get("/api/does-not-exist")
    assert r.status_code == 404
    assert r.is_json and error_code(r) == "not_found"


def test_wrong_method_is_json_405(fab_client):
    r = fab_client.post("/api/lots")
    assert r.status_code == 405
    assert r.is_json
