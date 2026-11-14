"""Statistical process control: an X-bar chart with the Western Electric rules.

Each point is one subgroup: the wafers one lot ran through a chamber in one visit. Limits
come from a baseline period (for example, everything before a PM); later points are judged
against them.
"""

from dataclasses import dataclass
from datetime import datetime

import numpy as np
from scipy.stats import ttest_ind


@dataclass(frozen=True)
class Subgroup:
    at: datetime
    values: list[float]


RULES = {
    1: "1 point beyond 3 sigma",
    2: "2 of 3 points beyond 2 sigma, same side",
    3: "4 of 5 points beyond 1 sigma, same side",
    4: "8 points in a row on one side of the centre line",
}


def western_electric(z: list[float]) -> list[dict]:
    """z = each point's distance from the centre line in sigmas. Returns rule violations."""
    out = []
    for i in range(len(z)):
        hits = []
        if abs(z[i]) > 3:
            hits.append(1)
        for rule, window, need, level in ((2, 3, 2, 2.0), (3, 5, 4, 1.0)):
            if i + 1 >= window:
                w = z[i + 1 - window : i + 1]
                for sign in (1, -1):
                    if sign * z[i] > level and sum(sign * v > level for v in w) >= need:
                        hits.append(rule)
        if i + 1 >= 8:
            w = z[i - 7 : i + 1]
            if all(v > 0 for v in w) or all(v < 0 for v in w):
                hits.append(4)
        for rule in sorted(set(hits)):
            out.append({"index": i, "rule": rule, "description": RULES[rule]})
    return out


def xbar_chart(subgroups: list[Subgroup], baseline_end: datetime | None = None) -> dict:
    """Centre line and limits from the baseline subgroups; every subgroup checked against them.

    baseline_end defaults to the first half of the subgroups.
    """
    groups = sorted((g for g in subgroups if g.values), key=lambda g: g.at)
    if baseline_end is None:
        base = groups[: max(2, len(groups) // 2)]
    else:
        base = [g for g in groups if g.at < baseline_end]
    if len(base) < 2:
        raise ValueError("need at least 2 baseline subgroups")

    base_values = np.concatenate([g.values for g in base])
    centre = float(base_values.mean())
    # Within-subgroup sigma, pooled: short-term noise, not drift between subgroups.
    resid = np.concatenate([np.asarray(g.values) - np.mean(g.values) for g in base])
    dof = len(resid) - len(base)
    sigma = float(np.sqrt((resid**2).sum() / dof)) if dof > 0 else float(base_values.std(ddof=1))

    in_base = {id(g) for g in base}
    points, z = [], []
    for g in groups:
        n = len(g.values)
        se = sigma / np.sqrt(n)
        mean = float(np.mean(g.values))
        z.append((mean - centre) / se)
        points.append(
            {
                "at": g.at.isoformat(timespec="seconds"),
                "n": n,
                "mean": round(mean, 3),
                "ucl": round(centre + 3 * se, 3),
                "lcl": round(centre - 3 * se, 3),
                "baseline": id(g) in in_base,
            }
        )

    violations = western_electric(z)
    for v in violations:
        v["at"] = points[v["index"]]["at"]
    return {
        "centre": round(centre, 3),
        "sigma": round(sigma, 4),
        "baseline_subgroups": len(base),
        "points": points,
        "violations": violations,
        "out_of_control": any(not points[v["index"]]["baseline"] for v in violations),
    }


def before_after(before: list[float], after: list[float]) -> dict:
    """Did the level shift? Welch's t-test (no equal-variance assumption)."""
    if len(before) < 2 or len(after) < 2:
        raise ValueError("need at least 2 values on each side")
    t, p = ttest_ind(after, before, equal_var=False)
    mb, ma = float(np.mean(before)), float(np.mean(after))
    return {
        "n_before": len(before),
        "n_after": len(after),
        "mean_before": round(mb, 3),
        "mean_after": round(ma, 3),
        "shift": round(ma - mb, 3),
        "t": round(float(t), 2),
        "p_value": float(p),
    }
