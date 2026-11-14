"""Label a wafer map's failure pattern: edge ring, cluster, random, or clean."""

import numpy as np

EDGE_R = 0.78  # dies beyond 78% of the radius count as the edge band
EDGE_MIN_RATE = 0.25  # at least a quarter of edge dies fail ...
EDGE_MIN_RATIO = 3.0  # ... and 3x more often than inner dies
CLUSTER_MIN_DIES = 6  # touching failed dies that form a cluster
CLEAN_MAX_RATE = 0.02


def _largest_cluster(fails: set[tuple[int, int]]) -> int:
    """Size of the largest group of failed dies that touch (including diagonally)."""
    seen: set[tuple[int, int]] = set()
    best = 0
    for start in fails:
        if start in seen:
            continue
        stack, size = [start], 0
        seen.add(start)
        while stack:
            x, y = stack.pop()
            size += 1
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in fails and n not in seen:
                        seen.add(n)
                        stack.append(n)
        best = max(best, size)
    return best


def classify(dies: list[tuple[int, int, bool]]) -> dict:
    """dies = [(x, y, passed)]. Returns the label and the numbers behind it."""
    if not dies:
        raise ValueError("empty wafer map")
    x = np.array([d[0] for d in dies], dtype=float)
    y = np.array([d[1] for d in dies], dtype=float)
    failed = ~np.array([d[2] for d in dies], dtype=bool)
    r = np.hypot(x, y)
    r = r / r.max() if r.max() > 0 else r
    edge = r > EDGE_R

    fail_rate = float(failed.mean())
    edge_rate = float(failed[edge].mean()) if edge.any() else 0.0
    inner_rate = float(failed[~edge].mean()) if (~edge).any() else 0.0
    # Clusters are looked for away from the edge, so an edge ring isn't mistaken for one.
    inner = failed & ~edge
    inner_fails = {(int(a), int(b)) for a, b in zip(x[inner], y[inner], strict=True)}
    cluster = _largest_cluster(inner_fails)

    if edge_rate >= EDGE_MIN_RATE and edge_rate >= EDGE_MIN_RATIO * max(inner_rate, 0.01):
        label = "edge_ring"
    elif cluster >= CLUSTER_MIN_DIES:
        label = "cluster"
    elif fail_rate <= CLEAN_MAX_RATE:
        label = "clean"
    else:
        label = "random"

    return {
        "label": label,
        "fail_rate": round(fail_rate, 4),
        "edge_fail_rate": round(edge_rate, 4),
        "inner_fail_rate": round(inner_rate, 4),
        "largest_cluster": cluster,
    }
