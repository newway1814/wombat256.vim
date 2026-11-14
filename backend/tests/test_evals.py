"""M7: the golden set is well formed and the eval runner scores correctly."""

import yaml

from evals import run_evals

KNOWN = {
    "id", "question", "tools_all", "tools_any", "tools_none",
    "contains_all", "contains_any", "not_contains", "cites", "drafts",
}  # fmt: skip


def test_golden_set_is_well_formed():
    cases = yaml.safe_load(run_evals.GOLDEN.read_text())
    assert len(cases) == 15
    assert len({c["id"] for c in cases}) == len(cases)
    for c in cases:
        assert set(c) <= KNOWN, c["id"]
        assert c["question"].strip()


def test_runner_passes_the_reference_case_with_the_demo_model():
    summary = run_evals.main(["--provider", "demo", "--only", "root-cause", "--no-save"])
    assert summary["passed"] == summary["total"] == 1


def test_runner_fails_a_case_that_breaks_its_checks():
    summary = run_evals.main(["--provider", "demo", "--only", "flagged-lots", "--no-save"])
    case = summary["cases"][0]
    assert not case["passed"]
    assert "drafted a work order" in case["failures"]


def test_invariants_are_always_checked():
    fails = run_evals.check({}, [], "fine", lots=39, agent_decisions=1, drafted=False)
    assert "lots table changed: 39 rows" in fails
    assert "a work order was decided without a human" in fails


def test_an_api_error_fails_one_case_and_the_run_continues(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("429 RESOURCE_EXHAUSTED quota")

    monkeypatch.setattr(run_evals, "run_case", boom)
    summary = run_evals.main(
        ["--provider", "demo", "--only", "root-cause", "spc-healthy", "--no-save"]
    )
    assert summary["total"] == 2 and summary["errored"] == 2
    assert summary["cases"][0]["failures"][0].startswith("error: RuntimeError: 429")
