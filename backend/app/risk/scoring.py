"""Risk score fusion: combine detector signals into final score + reasons."""

import logging
from .features import extract_features
from .detectors import velocity_detector, structuring_detector, circular_flow_detector

log = logging.getLogger(__name__)

# Detector weights
W_VELOCITY = 0.4
W_STRUCTURING = 0.3
W_CIRCULAR = 0.3


def compute_risk_for_bucket(
    transactions: list[dict],
    bucket_size_seconds: int,
) -> dict[str, dict]:
    """Compute risk scores for all entities in a bucket's transactions.

    Returns dict of entity_id -> {risk_score, reasons, evidence}.
    """
    if not transactions:
        return {}

    # Step 1: Extract features
    all_features = extract_features(transactions, bucket_size_seconds)

    results: dict[str, dict] = {}

    for entity_id, features in all_features.items():
        # Step 2: Run detectors
        vel = velocity_detector(features, all_features)
        struct = structuring_detector(features)
        circ = circular_flow_detector(entity_id, transactions)

        # Step 3: Fuse scores
        raw_score = (
            W_VELOCITY * vel["score"]
            + W_STRUCTURING * struct["score"]
            + W_CIRCULAR * circ["score"]
        )
        risk_score = round(max(0.0, min(1.0, raw_score)), 4)

        # Step 4: Build reasons (top signals only)
        reasons = []
        if vel["score"] > 0.05:
            reasons.append({
                "detector": "velocity",
                "detail": vel["detail"],
                "weight": round(W_VELOCITY * vel["score"], 4),
            })
        if struct["score"] > 0.05:
            reasons.append({
                "detector": "structuring",
                "detail": struct["detail"],
                "weight": round(W_STRUCTURING * struct["score"], 4),
            })
        if circ["score"] > 0.05:
            reasons.append({
                "detector": "circular_flow",
                "detail": circ["detail"],
                "weight": round(W_CIRCULAR * circ["score"], 4),
            })

        # Sort by weight descending, keep top 3
        reasons.sort(key=lambda r: r["weight"], reverse=True)
        reasons = reasons[:3]

        # Step 5: Collect evidence
        evidence: dict = {}
        flagged_tx_ids = []
        if struct["score"] > 0.05:
            evidence["structuring"] = struct["evidence"]
        if circ["score"] > 0.05:
            evidence["circular_flow"] = circ["evidence"]
        if vel["score"] > 0.05:
            evidence["velocity"] = vel["evidence"]

        # Flag transactions that contributed to structuring
        if struct["score"] > 0.05:
            threshold = struct["evidence"]["threshold"]
            delta = struct["evidence"]["delta"]
            lower = threshold - delta
            for tx in transactions:
                if tx["from_id"] == entity_id and lower <= tx["amount"] < threshold:
                    flagged_tx_ids.append(tx["tx_id"])

        if flagged_tx_ids:
            evidence["flagged_tx_ids"] = flagged_tx_ids[:20]

        results[entity_id] = {
            "risk_score": risk_score,
            "reasons": reasons,
            "evidence": evidence,
        }

    return results
