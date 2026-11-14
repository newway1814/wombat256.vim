"""Commonality: which chamber do the bad wafers share, more than chance would explain?

For every (step, chamber) pair we build a 2x2 table:

                   through this chamber   not through it
    bad wafers            a                    b
    good wafers           c                    d

and ask, with Fisher's exact test, how likely it is to see this many bad wafers in the
chamber by chance. Because we test many chambers at once, p-values are multiplied by the
number of tests (Bonferroni), so a lucky chamber doesn't look guilty.
"""

from collections import defaultdict

from scipy.stats import fisher_exact


def rank_chambers(
    history: list[tuple[str, str, str]], bad: set[str], top: int | None = None
) -> list[dict]:
    """history = [(wafer_id, step, chamber_id)]; bad = ids of bad wafers.

    Returns one row per (step, chamber), most suspicious first.
    """
    wafers_at_step: dict[str, set[str]] = defaultdict(set)
    wafers_in: dict[tuple[str, str], set[str]] = defaultdict(set)
    for wafer_id, step, chamber in history:
        wafers_at_step[step].add(wafer_id)
        wafers_in[(step, chamber)].add(wafer_id)

    n_tests = len(wafers_in)
    results = []
    for (step, chamber), inside in wafers_in.items():
        everyone = wafers_at_step[step]
        outside = everyone - inside
        a = len(inside & bad)
        b = len(outside & bad)
        c = len(inside) - a
        d = len(outside) - b
        if a + b == 0:
            continue
        _, p = fisher_exact([[a, b], [c, d]], alternative="greater")
        results.append(
            {
                "step": step,
                "chamber_id": chamber,
                "bad_in_chamber": a,
                "wafers_in_chamber": len(inside),
                "bad_rate_in": round(a / len(inside), 4) if inside else 0.0,
                "bad_rate_out": round(b / len(outside), 4) if outside else 0.0,
                "p_value": float(p),
                "p_adjusted": float(min(1.0, p * n_tests)),
            }
        )
    results.sort(key=lambda r: (r["p_adjusted"], r["p_value"], -r["bad_rate_in"]))
    return results[:top] if top else results
