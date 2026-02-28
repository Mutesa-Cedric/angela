"""Executive dashboard aggregations."""

from .data_loader import store
from .clusters import detect_clusters


def compute_dashboard(bucket: int) -> dict:
    """Compute executive KPIs for a given bucket."""
    risk_data = store.risk_by_bucket.get(bucket, {})
    bucket_tx = store.get_bucket_transactions(bucket)

    # KPI: high-risk entities (risk > 0.5)
    high_risk_count = sum(1 for d in risk_data.values() if d["risk_score"] > 0.5)
    total_entities = len(risk_data) or len(store.entities)

    # KPI: new anomalies (entities that became high-risk vs previous bucket)
    new_anomalies = 0
    if bucket > 0:
        prev_risk = store.risk_by_bucket.get(bucket - 1, {})
        for eid, data in risk_data.items():
            if data["risk_score"] > 0.5:
                prev_score = prev_risk.get(eid, {}).get("risk_score", 0.0)
                if prev_score <= 0.5:
                    new_anomalies += 1

    # KPI: cluster count
    clusters = detect_clusters(risk_data, bucket_tx, threshold=0.3)
    cluster_count = len(clusters)

    # KPI: cross-border risk ratio
    # Entities with risk > 0.3 that have counterparties in different jurisdiction buckets
    cross_border = 0
    entity_jurisdictions: dict[str, int] = {}
    for ent in store.entities:
        entity_jurisdictions[ent["id"]] = ent["jurisdiction_bucket"]

    for tx in bucket_tx:
        f_jur = entity_jurisdictions.get(tx["from_id"], -1)
        t_jur = entity_jurisdictions.get(tx["to_id"], -1)
        if f_jur != t_jur and f_jur >= 0 and t_jur >= 0:
            f_risk = risk_data.get(tx["from_id"], {}).get("risk_score", 0)
            t_risk = risk_data.get(tx["to_id"], {}).get("risk_score", 0)
            if f_risk > 0.3 or t_risk > 0.3:
                cross_border += 1

    total_risky_tx = sum(
        1 for tx in bucket_tx
        if risk_data.get(tx["from_id"], {}).get("risk_score", 0) > 0.3
        or risk_data.get(tx["to_id"], {}).get("risk_score", 0) > 0.3
    )
    cross_border_ratio = cross_border / max(total_risky_tx, 1)

    # Risk trend (across all buckets)
    trend: list[dict] = []
    for b in range(store.n_buckets):
        b_risk = store.risk_by_bucket.get(b, {})
        if not b_risk:
            trend.append({"bucket": b, "total_risk": 0, "high_risk_count": 0, "entity_count": 0})
            continue
        total_risk = sum(d["risk_score"] for d in b_risk.values())
        hr = sum(1 for d in b_risk.values() if d["risk_score"] > 0.5)
        trend.append({
            "bucket": b,
            "total_risk": round(total_risk, 2),
            "high_risk_count": hr,
            "entity_count": len(b_risk),
        })

    # Jurisdiction heatmap
    jurisdiction_risk: dict[int, dict] = {}
    for eid, data in risk_data.items():
        jur = entity_jurisdictions.get(eid, 0)
        if jur not in jurisdiction_risk:
            jurisdiction_risk[jur] = {"total_risk": 0, "count": 0, "high_risk": 0}
        jurisdiction_risk[jur]["total_risk"] += data["risk_score"]
        jurisdiction_risk[jur]["count"] += 1
        if data["risk_score"] > 0.5:
            jurisdiction_risk[jur]["high_risk"] += 1

    heatmap = [
        {
            "jurisdiction": jur,
            "avg_risk": round(d["total_risk"] / max(d["count"], 1), 4),
            "entity_count": d["count"],
            "high_risk_count": d["high_risk"],
        }
        for jur, d in sorted(jurisdiction_risk.items())
    ]

    return {
        "bucket": bucket,
        "kpis": {
            "high_risk_entities": high_risk_count,
            "new_anomalies": new_anomalies,
            "cluster_count": cluster_count,
            "cross_border_ratio": round(cross_border_ratio, 4),
            "total_entities": total_entities,
            "total_transactions": len(bucket_tx),
        },
        "trend": trend,
        "heatmap": heatmap,
    }
