"""Generate ranked investigation targets for autopilot camera tours."""

from .clusters import detect_clusters
from .data_loader import store


def generate_investigation_targets(bucket: int, max_targets: int = 8) -> list[dict]:
    """Return an ordered list of investigation targets for the autopilot.

    Each target: {
        type: "entity" | "cluster",
        id: str,
        entity_ids: list[str],   # for clusters
        risk_score: float,
        label: str,              # human-readable annotation
        reason: str,             # why this is interesting
    }
    """
    risk_data = store.risk_by_bucket.get(bucket, {})
    bucket_tx = store.get_bucket_transactions(bucket)

    targets: list[dict] = []

    # 1. Top risky individual entities
    scored_entities = [
        (eid, data["risk_score"], data.get("reasons", []))
        for eid, data in risk_data.items()
        if data["risk_score"] > 0.1
    ]
    scored_entities.sort(key=lambda x: x[1], reverse=True)

    for eid, score, reasons in scored_entities[:5]:
        # Build a concise reason string
        top_reason = reasons[0]["detail"] if reasons else "Elevated risk score"
        entity = store.get_entity(eid)
        entity_type = entity.get("type", "account") if entity else "account"

        targets.append({
            "type": "entity",
            "id": eid,
            "entity_ids": [eid],
            "risk_score": round(score, 4),
            "label": f"High-risk {entity_type}: {eid[:12]}",
            "reason": top_reason,
        })

    # 2. Clusters
    clusters = detect_clusters(risk_data, bucket_tx, threshold=0.3)
    clusters.sort(key=lambda c: c["risk_score"] * c["size"], reverse=True)

    for cluster in clusters[:3]:
        targets.append({
            "type": "cluster",
            "id": cluster["cluster_id"],
            "entity_ids": cluster["entity_ids"],
            "risk_score": cluster["risk_score"],
            "label": f"Cluster ({cluster['size']} entities, risk {cluster['risk_score']:.0%})",
            "reason": f"Connected component of {cluster['size']} high-risk entities",
        })

    # 3. Check for previous bucket comparison (sudden spikes)
    if bucket > 0:
        prev_risk = store.risk_by_bucket.get(bucket - 1, {})
        spikes: list[tuple[str, float]] = []
        for eid, data in risk_data.items():
            prev_score = prev_risk.get(eid, {}).get("risk_score", 0.0)
            delta = data["risk_score"] - prev_score
            if delta > 0.3:
                spikes.append((eid, delta))
        spikes.sort(key=lambda x: x[1], reverse=True)

        for eid, delta in spikes[:2]:
            # Skip if already in targets
            if any(t["id"] == eid for t in targets):
                continue
            entity = store.get_entity(eid)
            entity_type = entity.get("type", "account") if entity else "account"
            targets.append({
                "type": "entity",
                "id": eid,
                "entity_ids": [eid],
                "risk_score": risk_data[eid]["risk_score"],
                "label": f"Risk spike: {eid[:12]}",
                "reason": f"Risk jumped +{delta:.0%} from previous time window",
            })

    # Sort all targets by risk_score descending, deduplicate, cap
    seen_ids: set[str] = set()
    unique: list[dict] = []
    for t in sorted(targets, key=lambda x: x["risk_score"], reverse=True):
        if t["id"] not in seen_ids:
            seen_ids.add(t["id"])
            unique.append(t)
    return unique[:max_targets]
