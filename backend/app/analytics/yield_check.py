"""Flag lots whose yield is unusually low against the fab's baseline."""

from dataclasses import dataclass

import numpy as np

# Scales the median absolute deviation to match a standard deviation for normal data.
MAD_TO_SIGMA = 1.4826


@dataclass(frozen=True)
class Baseline:
    mean: float
    sigma: float

    def limit(self, k: float) -> float:
        return self.mean - k * self.sigma


def robust_baseline(values: list[float]) -> Baseline:
    """Median and MAD-based sigma: a few bad lots can't drag the baseline down to hide."""
    arr = np.asarray(values, dtype=float)
    if arr.size < 3:
        raise ValueError("need at least 3 values for a baseline")
    median = float(np.median(arr))
    sigma = float(MAD_TO_SIGMA * np.median(np.abs(arr - median)))
    if sigma == 0:
        sigma = float(arr.std(ddof=1)) or 1e-9
    return Baseline(mean=median, sigma=sigma)


def flag_low_yield(items: list[tuple[str, float]], k: float = 3.0) -> dict:
    """items = [(id, yield_pct)]. Flags ids below baseline - k*sigma, lowest first."""
    base = robust_baseline([y for _, y in items])
    limit = base.limit(k)
    flagged = sorted(
        (
            {
                "id": i,
                "yield_pct": round(y, 2),
                "sigmas_below": round((base.mean - y) / base.sigma, 1),
            }
            for i, y in items
            if y < limit
        ),
        key=lambda f: f["yield_pct"],
    )
    return {
        "baseline_yield": round(base.mean, 2),
        "sigma": round(base.sigma, 3),
        "k": k,
        "limit": round(limit, 2),
        "checked": len(items),
        "flagged": flagged,
    }
