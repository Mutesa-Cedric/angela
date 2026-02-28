"""Counterfactual explainer: "What if this entity behaved normally?"

Identifies suspicious edges, removes them from a temporary copy,
recomputes risk, and returns the delta.
"""

import logging
from collections import defaultdict

from .data_loader import store
from .risk.scoring import compute_risk_for_bucket
from .risk.detectors import STRUCTURING_THRESHOLD, STRUCTURING_DELTA

log = logging.getLogger(__name__)

MAX_REMOVED_EDGES = 50
MAX_GRAPH_NODES = 100


def compute_counterfactual(entity_id: str, bucket: int, k_hops: int = 1) -> dict:
    """Compute counterfactual for an entity by removing suspicious edges.

    Returns:
        {
            entity_id, bucket,
            original: { risk_score, reasons, evidence },
            counterfactual: { risk_score, reasons, evidence },
            removed_edges: [{ from_id, to_id, amount, reason }],
            delta: { risk_score, tx_count_removed },
        }
    """
    bucket_tx = store.get_bucket_transactions(bucket)
    bucket_size = store.metadata.get("bucket_size_seconds", 86400)

    # Get original risk
    original_risk = store.get_entity_risk(bucket, entity_id)

    # Identify suspicious edges
    suspicious = _identify_suspicious_edges(entity_id, bucket_tx, original_risk)

    # Remove suspicious edges from transaction list
    suspicious_keys = {(e["from_id"], e["to_id"], e["amount"]) for e in suspicious}
    cleaned_tx = [
        tx for tx in bucket_tx
        if (tx["from_id"], tx["to_id"], tx["amount"]) not in suspicious_keys
    ]

    # Recompute risk on cleaned transactions
    cleaned_risk_data = compute_risk_for_bucket(cleaned_tx, bucket_size)
    counterfactual_risk = cleaned_risk_data.get(entity_id, {
        "risk_score": 0.0,
        "reasons": [],
        "evidence": {},
    })

    # Compute delta
    delta_score = round(counterfactual_risk["risk_score"] - original_risk["risk_score"], 4)

    return {
        "entity_id": entity_id,
        "bucket": bucket,
        "original": {
            "risk_score": original_risk["risk_score"],
            "reasons": original_risk["reasons"],
            "evidence": original_risk["evidence"],
        },
        "counterfactual": {
            "risk_score": counterfactual_risk["risk_score"],
            "reasons": counterfactual_risk["reasons"],
            "evidence": counterfactual_risk["evidence"],
        },
        "removed_edges": suspicious[:MAX_REMOVED_EDGES],
        "delta": {
            "risk_score": delta_score,
            "tx_count_removed": len(suspicious),
        },
    }


def _identify_suspicious_edges(
    entity_id: str,
    transactions: list[dict],
    risk_data: dict,
) -> list[dict]:
    """Identify suspicious edges involving this entity based on risk evidence."""
    suspicious: list[dict] = []
    seen: set[tuple[str, str, float]] = set()
    evidence = risk_data.get("evidence", {})

    # Get entity's transactions
    entity_tx = [
        tx for tx in transactions
        if tx["from_id"] == entity_id or tx["to_id"] == entity_id
    ]

    # 1) Structuring: edges near threshold
    if evidence.get("structuring", {}).get("near_threshold_count", 0) > 0:
        lower = STRUCTURING_THRESHOLD - STRUCTURING_DELTA
        for tx in entity_tx:
            if lower <= tx["amount"] < STRUCTURING_THRESHOLD:
                key = (tx["from_id"], tx["to_id"], tx["amount"])
                if key not in seen:
                    seen.add(key)
                    suspicious.append({
                        "from_id": tx["from_id"],
                        "to_id": tx["to_id"],
                        "amount": tx["amount"],
                        "reason": "structuring",
                    })

    # 2) Circular flow: edges in cycle paths
    if evidence.get("circular_flow", {}).get("counterparties"):
        cycle_parties = set(evidence["circular_flow"]["counterparties"])
        for tx in entity_tx:
            other = tx["to_id"] if tx["from_id"] == entity_id else tx["from_id"]
            if other in cycle_parties:
                key = (tx["from_id"], tx["to_id"], tx["amount"])
                if key not in seen:
                    seen.add(key)
                    suspicious.append({
                        "from_id": tx["from_id"],
                        "to_id": tx["to_id"],
                        "amount": tx["amount"],
                        "reason": "circular_flow",
                    })

    # 3) Velocity: if high velocity, flag rapid-fire transactions
    vel_evidence = evidence.get("velocity", {})
    if vel_evidence.get("tx_count", 0) > vel_evidence.get("population_p95", float("inf")):
        # Sort entity tx by timestamp, flag those in tight clusters
        sorted_tx = sorted(entity_tx, key=lambda t: t.get("timestamp", 0))
        for i in range(1, len(sorted_tx)):
            gap = sorted_tx[i].get("timestamp", 0) - sorted_tx[i - 1].get("timestamp", 0)
            if gap < 120:  # less than 2 minutes apart
                tx = sorted_tx[i]
                key = (tx["from_id"], tx["to_id"], tx["amount"])
                if key not in seen:
                    seen.add(key)
                    suspicious.append({
                        "from_id": tx["from_id"],
                        "to_id": tx["to_id"],
                        "amount": tx["amount"],
                        "reason": "velocity",
                    })

    return suspicious[:MAX_REMOVED_EDGES]
