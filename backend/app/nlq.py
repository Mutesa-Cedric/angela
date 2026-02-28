"""Natural Language Query (NLQ) engine for ANGELA graph queries.

Parses natural language into structured intents, then executes
deterministic queries against the data store.
"""

import json
import logging
from functools import lru_cache

from .ai.service import _call_llm
from .data_loader import store
from .clusters import detect_clusters

log = logging.getLogger(__name__)

# ── Intent definitions ────────────────────────────────────────────────

INTENTS = [
    "SHOW_HIGH_RISK",
    "LARGE_INCOMING",
    "HIGH_RISK_JURISDICTION",
    "STRUCTURING_NEAR_THRESHOLD",
    "CIRCULAR_FLOW",
    "TOP_CLUSTERS",
]

NLQ_SYSTEM_PROMPT = """\
You are a query parser for an AML (anti-money-laundering) graph investigation tool.
Given a user's natural language question about financial entities, extract the intent and parameters.

Return ONLY a JSON object with these fields:
- "intent": one of """ + json.dumps(INTENTS) + """
- "params": object with optional fields depending on intent
- "interpretation": a short human-readable sentence describing what you understood

Intent descriptions:
- SHOW_HIGH_RISK: Show entities with risk above a threshold. params: {"min_risk": float 0-1, default 0.6}
- LARGE_INCOMING: Show entities receiving large transaction volumes. params: {"min_amount": float, default 50000}
- HIGH_RISK_JURISDICTION: Show entities in a specific jurisdiction bucket. params: {"jurisdiction": int 0-7}
- STRUCTURING_NEAR_THRESHOLD: Show entities with transactions just below reporting thresholds ($9000-$10000). params: {}
- CIRCULAR_FLOW: Show entities involved in circular transaction patterns. params: {}
- TOP_CLUSTERS: Show the top risk clusters. params: {"limit": int, default 5}

If the user asks about "risky" or "suspicious" entities, use SHOW_HIGH_RISK.
If the user mentions "large transfers" or "big amounts" or "heavy volume", use LARGE_INCOMING.
If the user mentions a country, region, or "jurisdiction", use HIGH_RISK_JURISDICTION.
If the user mentions "structuring", "smurfing", or "just below threshold", use STRUCTURING_NEAR_THRESHOLD.
If the user mentions "circular", "round-trip", "layering", or "cycle", use CIRCULAR_FLOW.
If the user mentions "clusters", "groups", or "rings", use TOP_CLUSTERS.

Return ONLY valid JSON, no markdown, no explanation."""


def parse_query(query: str) -> dict:
    """Parse a natural language query into a structured intent via LLM."""
    raw = _call_llm(query, system_prompt=NLQ_SYSTEM_PROMPT, max_tokens=200)

    # Strip markdown fences if present
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        log.warning(f"NLQ parse failed, raw LLM output: {raw}")
        return {
            "intent": "SHOW_HIGH_RISK",
            "params": {"min_risk": 0.6},
            "interpretation": "Showing high-risk entities (query could not be parsed precisely)",
        }

    # Validate intent
    if result.get("intent") not in INTENTS:
        result["intent"] = "SHOW_HIGH_RISK"
        result.setdefault("params", {"min_risk": 0.6})
        result["interpretation"] = result.get(
            "interpretation",
            "Showing high-risk entities (unknown intent)",
        )

    return result


# ── Intent executors ──────────────────────────────────────────────────

def execute_intent(intent: str, params: dict, bucket: int) -> dict:
    """Execute a parsed intent against the data store.

    Returns:
        {
            "entity_ids": list of matched entity IDs,
            "edges": list of {from_id, to_id, amount} for relevant edges,
            "summary": short description of results,
        }
    """
    handler = _HANDLERS.get(intent)
    if not handler:
        return {"entity_ids": [], "edges": [], "summary": f"Unknown intent: {intent}"}
    return handler(params, bucket)


def _handle_high_risk(params: dict, bucket: int) -> dict:
    min_risk = float(params.get("min_risk", 0.6))
    risk_data = store.risk_by_bucket.get(bucket, {})

    matched = [
        eid for eid, data in risk_data.items()
        if data["risk_score"] >= min_risk
    ]
    matched.sort(key=lambda eid: risk_data[eid]["risk_score"], reverse=True)

    # Get edges between matched entities
    edges = _edges_between(matched, bucket)

    return {
        "entity_ids": matched[:50],
        "edges": edges,
        "total_count": len(matched),
        "summary": f"{len(matched)} entities with risk >= {min_risk:.0%}",
    }


def _handle_large_incoming(params: dict, bucket: int) -> dict:
    min_amount = float(params.get("min_amount", 50000))
    bucket_tx = store.get_bucket_transactions(bucket)

    # Compute incoming volume per entity
    incoming: dict[str, float] = {}
    for tx in bucket_tx:
        incoming[tx["to_id"]] = incoming.get(tx["to_id"], 0.0) + tx["amount"]

    matched = [
        eid for eid, vol in incoming.items()
        if vol >= min_amount
    ]
    matched.sort(key=lambda eid: incoming.get(eid, 0), reverse=True)

    edges = _edges_involving(matched, bucket)

    return {
        "entity_ids": matched[:50],
        "edges": edges,
        "total_count": len(matched),
        "summary": f"{len(matched)} entities receiving >= ${min_amount:,.0f}",
    }


def _handle_high_risk_jurisdiction(params: dict, bucket: int) -> dict:
    jurisdiction = int(params.get("jurisdiction", 0))
    risk_data = store.risk_by_bucket.get(bucket, {})

    # Get entities in this jurisdiction with nonzero risk
    matched = []
    for eid, data in risk_data.items():
        entity = store.get_entity(eid)
        if entity and entity.get("jurisdiction_bucket") == jurisdiction and data["risk_score"] > 0:
            matched.append(eid)

    matched.sort(key=lambda eid: risk_data.get(eid, {}).get("risk_score", 0), reverse=True)
    edges = _edges_between(matched, bucket)

    return {
        "entity_ids": matched[:50],
        "edges": edges,
        "total_count": len(matched),
        "summary": f"{len(matched)} risky entities in jurisdiction {jurisdiction}",
    }


def _handle_structuring(params: dict, bucket: int) -> dict:
    risk_data = store.risk_by_bucket.get(bucket, {})

    matched = []
    for eid, data in risk_data.items():
        evidence = data.get("evidence", {})
        structuring = evidence.get("structuring", {})
        if structuring.get("near_threshold_count", 0) >= 2:
            matched.append(eid)

    matched.sort(key=lambda eid: risk_data.get(eid, {}).get("risk_score", 0), reverse=True)
    edges = _edges_involving(matched, bucket)

    return {
        "entity_ids": matched[:50],
        "edges": edges,
        "total_count": len(matched),
        "summary": f"{len(matched)} entities with structuring patterns",
    }


def _handle_circular_flow(params: dict, bucket: int) -> dict:
    risk_data = store.risk_by_bucket.get(bucket, {})

    matched = []
    all_cycle_counterparties: set[str] = set()
    for eid, data in risk_data.items():
        evidence = data.get("evidence", {})
        circular = evidence.get("circular_flow", {})
        if circular.get("cycle_count", 0) >= 1:
            matched.append(eid)
            all_cycle_counterparties.update(circular.get("counterparties", []))

    # Include counterparties in the result for richer visualization
    for cp in all_cycle_counterparties:
        if cp not in matched:
            matched.append(cp)

    matched.sort(key=lambda eid: risk_data.get(eid, {}).get("risk_score", 0), reverse=True)
    edges = _edges_between(matched, bucket)

    return {
        "entity_ids": matched[:50],
        "edges": edges,
        "total_count": len(matched),
        "summary": f"{len(matched)} entities involved in circular flows",
    }


def _handle_top_clusters(params: dict, bucket: int) -> dict:
    limit = int(params.get("limit", 5))
    risk_data = store.risk_by_bucket.get(bucket, {})
    bucket_tx = store.get_bucket_transactions(bucket)
    clusters = detect_clusters(risk_data, bucket_tx, threshold=0.3)

    # Sort by risk_score descending
    clusters.sort(key=lambda c: c["risk_score"], reverse=True)
    top = clusters[:limit]

    matched = []
    for cluster in top:
        for eid in cluster["entity_ids"]:
            if eid not in matched:
                matched.append(eid)

    edges = _edges_between(matched, bucket)

    return {
        "entity_ids": matched[:100],
        "edges": edges,
        "total_count": len(matched),
        "summary": f"Top {len(top)} clusters ({len(matched)} entities)",
    }


# ── Edge helpers ──────────────────────────────────────────────────────

def _edges_between(entity_ids: list[str], bucket: int) -> list[dict]:
    """Get edges where both endpoints are in entity_ids."""
    id_set = set(entity_ids)
    bucket_tx = store.get_bucket_transactions(bucket)
    edges = []
    seen: set[tuple[str, str]] = set()
    for tx in bucket_tx:
        if tx["from_id"] in id_set and tx["to_id"] in id_set and tx["from_id"] != tx["to_id"]:
            key = (tx["from_id"], tx["to_id"])
            if key not in seen:
                seen.add(key)
                edges.append({"from_id": tx["from_id"], "to_id": tx["to_id"], "amount": tx["amount"]})
    return edges[:200]


def _edges_involving(entity_ids: list[str], bucket: int) -> list[dict]:
    """Get edges where at least one endpoint is in entity_ids."""
    id_set = set(entity_ids)
    bucket_tx = store.get_bucket_transactions(bucket)
    edges = []
    seen: set[tuple[str, str]] = set()
    for tx in bucket_tx:
        if (tx["from_id"] in id_set or tx["to_id"] in id_set) and tx["from_id"] != tx["to_id"]:
            key = (tx["from_id"], tx["to_id"])
            if key not in seen:
                seen.add(key)
                edges.append({"from_id": tx["from_id"], "to_id": tx["to_id"], "amount": tx["amount"]})
    return edges[:200]


_HANDLERS = {
    "SHOW_HIGH_RISK": _handle_high_risk,
    "LARGE_INCOMING": _handle_large_incoming,
    "HIGH_RISK_JURISDICTION": _handle_high_risk_jurisdiction,
    "STRUCTURING_NEAR_THRESHOLD": _handle_structuring,
    "CIRCULAR_FLOW": _handle_circular_flow,
    "TOP_CLUSTERS": _handle_top_clusters,
}
