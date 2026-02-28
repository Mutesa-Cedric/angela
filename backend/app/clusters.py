"""Cluster detection: find connected components of high-risk entities."""

from collections import deque


def detect_clusters(
    risk_data: dict[str, dict],
    transactions: list[dict],
    threshold: float = 0.3,
) -> list[dict]:
    """Find connected components of entities with risk above threshold.

    Returns list of cluster dicts: {cluster_id, entity_ids, risk_score, size}.
    """
    # Identify high-risk entities
    high_risk = {eid for eid, data in risk_data.items() if data["risk_score"] >= threshold}
    if not high_risk:
        return []

    # Build adjacency restricted to high-risk entities
    adj: dict[str, set[str]] = {}
    for tx in transactions:
        f, t = tx["from_id"], tx["to_id"]
        if f != t and f in high_risk and t in high_risk:
            adj.setdefault(f, set()).add(t)
            adj.setdefault(t, set()).add(f)

    # BFS to find connected components
    visited: set[str] = set()
    clusters: list[dict] = []
    cluster_idx = 0

    for entity_id in sorted(high_risk):
        if entity_id in visited:
            continue

        # BFS from this entity
        component: list[str] = []
        queue: deque[str] = deque([entity_id])
        visited.add(entity_id)

        while queue:
            current = queue.popleft()
            component.append(current)
            for neighbor in adj.get(current, set()):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        if len(component) >= 2:  # only report clusters of 2+
            avg_risk = sum(risk_data[eid]["risk_score"] for eid in component) / len(component)
            clusters.append({
                "cluster_id": f"cluster_{cluster_idx}",
                "entity_ids": sorted(component),
                "risk_score": round(avg_risk, 4),
                "size": len(component),
            })
            cluster_idx += 1

    return clusters
