"""Per-entity feature extraction for risk scoring."""

from collections import defaultdict


def extract_features(
    transactions: list[dict],
    bucket_size_seconds: int,
) -> dict[str, dict]:
    """Extract per-entity features from a list of transactions in a bucket.

    Returns dict of entity_id -> feature dict.
    """
    features: dict[str, dict] = defaultdict(lambda: {
        "tx_out_count": 0,
        "tx_in_count": 0,
        "tx_out_sum": 0.0,
        "tx_in_sum": 0.0,
        "unique_counterparties": set(),
        "amounts": [],
        "timestamps": [],
    })

    for tx in transactions:
        from_id = tx["from_id"]
        to_id = tx["to_id"]
        amount = tx["amount"]
        ts = tx["timestamp"]

        # Outbound features
        f = features[from_id]
        f["tx_out_count"] += 1
        f["tx_out_sum"] += amount
        if from_id != to_id:
            f["unique_counterparties"].add(to_id)
        f["amounts"].append(amount)
        f["timestamps"].append(ts)

        # Inbound features
        f = features[to_id]
        f["tx_in_count"] += 1
        f["tx_in_sum"] += amount
        if from_id != to_id:
            f["unique_counterparties"].add(from_id)

    # Convert sets to counts
    result = {}
    for eid, feat in features.items():
        total_tx = feat["tx_out_count"] + feat["tx_in_count"]
        timestamps = feat["timestamps"]

        # Approximate tx per minute
        if len(timestamps) >= 2:
            time_span = max(timestamps) - min(timestamps)
            tx_per_minute = (len(timestamps) / max(time_span, 1)) * 60
        else:
            tx_per_minute = 0.0

        result[eid] = {
            "tx_out_count": feat["tx_out_count"],
            "tx_in_count": feat["tx_in_count"],
            "tx_out_sum": round(feat["tx_out_sum"], 2),
            "tx_in_sum": round(feat["tx_in_sum"], 2),
            "total_tx": total_tx,
            "unique_counterparties": len(feat["unique_counterparties"]),
            "tx_per_minute": round(tx_per_minute, 4),
            "amounts": feat["amounts"],
        }

    return result
