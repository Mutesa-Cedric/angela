"""Risk detectors: velocity, structuring, circular flow."""

from collections import defaultdict


def velocity_detector(features: dict, all_features: dict[str, dict]) -> dict:
    """Detect unusually high transaction velocity.

    Compares entity's tx count to population stats.
    Returns score in [0, 1] and evidence.
    """
    total_tx = features["total_tx"]
    tx_per_min = features["tx_per_minute"]

    # Compute population stats
    all_totals = [f["total_tx"] for f in all_features.values()]
    if not all_totals:
        return {"score": 0.0, "detail": "", "evidence": {}}

    all_totals.sort()
    p50 = all_totals[len(all_totals) // 2]
    p95 = all_totals[int(len(all_totals) * 0.95)]

    if p95 <= p50:
        score = 0.0
    else:
        # Normalize: 0 at median, 1 at 2x the 95th percentile
        score = max(0.0, min(1.0, (total_tx - p50) / max(p95 - p50, 1)))

    evidence = {
        "tx_count": total_tx,
        "tx_per_minute": tx_per_min,
        "population_median": p50,
        "population_p95": p95,
    }

    detail = f"{total_tx} tx in bucket (p50={p50}, p95={p95})"
    return {"score": score, "detail": detail, "evidence": evidence}


STRUCTURING_THRESHOLD = 10000.0
STRUCTURING_DELTA = 1000.0


def structuring_detector(features: dict) -> dict:
    """Detect potential structuring (amounts just below threshold).

    Looks for multiple transactions in range [threshold - delta, threshold).
    Returns score in [0, 1] and evidence.
    """
    amounts = features.get("amounts", [])
    if not amounts:
        return {"score": 0.0, "detail": "", "evidence": {}}

    lower = STRUCTURING_THRESHOLD - STRUCTURING_DELTA
    near_threshold = [a for a in amounts if lower <= a < STRUCTURING_THRESHOLD]
    count = len(near_threshold)

    # Score: 0 for 0-1 hits, ramps to 1.0 at 5+ hits
    score = max(0.0, min(1.0, (count - 1) / 4)) if count > 0 else 0.0

    evidence = {
        "near_threshold_count": count,
        "threshold": STRUCTURING_THRESHOLD,
        "delta": STRUCTURING_DELTA,
    }

    detail = f"{count} tx in ${lower:,.0f}-${STRUCTURING_THRESHOLD:,.0f} range"
    return {"score": score, "detail": detail, "evidence": evidence}


def circular_flow_detector(
    entity_id: str,
    transactions: list[dict],
    max_depth: int = 4,
    max_visits: int = 500,
) -> dict:
    """Detect short cycles (potential layering loops) via depth-limited DFS.

    Returns score in [0, 1] and evidence.
    """
    # Build adjacency for this bucket's transactions
    adj: dict[str, set[str]] = defaultdict(set)
    for tx in transactions:
        if tx["from_id"] != tx["to_id"]:
            adj[tx["from_id"]].add(tx["to_id"])

    cycles_found: list[list[str]] = []
    visits = 0

    def dfs(current: str, path: list[str], depth: int) -> None:
        nonlocal visits
        if visits >= max_visits:
            return

        for neighbor in adj.get(current, set()):
            visits += 1
            if visits >= max_visits:
                return

            if neighbor == entity_id and depth >= 2:
                # Found a cycle back to start
                cycles_found.append(path + [neighbor])
                continue

            if neighbor not in path and depth < max_depth:
                dfs(neighbor, path + [neighbor], depth + 1)

    dfs(entity_id, [entity_id], 1)

    if not cycles_found:
        return {"score": 0.0, "detail": "", "evidence": {}}

    # Shorter cycles are more suspicious
    shortest = min(len(c) for c in cycles_found)
    # Score: length 3 cycle = 1.0, length 4 = 0.7, length 5 = 0.4
    score = max(0.0, min(1.0, 1.0 - (shortest - 3) * 0.3))

    # Collect unique counterparties in cycles
    cycle_entities: set[str] = set()
    for c in cycles_found:
        cycle_entities.update(c)
    cycle_entities.discard(entity_id)

    evidence = {
        "cycle_count": len(cycles_found),
        "shortest_cycle_length": shortest,
        "counterparties": sorted(cycle_entities)[:10],
    }

    detail = f"cycle of length {shortest} detected ({len(cycles_found)} total)"
    return {"score": score, "detail": detail, "evidence": evidence}
