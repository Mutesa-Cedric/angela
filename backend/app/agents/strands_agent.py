"""In-process Strands Agent for ANGELA — direct function calls, no HTTP hop.

Uses Bedrock (Claude or Nova) for LLM reasoning and the existing DataStore
for all tool data. This module provides:
  - Tool definitions via @tool decorator
  - Agent factory (lazy init)
  - invoke() coroutine for routes.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any
from uuid import uuid4

from strands import Agent, tool
from strands.models.bedrock import BedrockModel

from ..clusters import detect_clusters
from ..data_loader import store
from ..investigation import generate_investigation_targets
from ..dashboard import compute_dashboard
from ..ai.service import generate_entity_summary as _gen_summary, generate_sar_narrative as _gen_sar
from ..ai.prompts_sar import build_sar_payload
from ..risk.scoring import compute_risk_for_bucket

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are ANGELA, an AI-powered Anti-Money Laundering investigation agent \
for Hong Kong financial institutions. You help compliance officers \
investigate suspicious transactions, assess entity risk, and prepare \
Suspicious Transaction Reports (STRs) for filing with the JFIU.

When investigating, follow the HKMA SAFE approach:
1. Screen: Use search_high_risk_entities or get_investigation_targets to find suspicious entities
2. Ask: Use lookup_entity to get detailed risk profiles and evidence
3. Find: Use get_entity_neighbors to map the transaction network
4. Evaluate: Use detect_clusters and generate_entity_summary to assess patterns

Always cite specific evidence from tool results. Never fabricate data. \
If risk is genuinely low, state that clearly.

When asked to generate a report, use generate_sar_narrative to produce \
filing content. Always recommend that a compliance officer reviews output before filing.

If the user provides a bucket number, use it. If not, default to bucket 0."""


# ---------------------------------------------------------------------------
# Tool definitions — direct calls to the in-memory DataStore
# ---------------------------------------------------------------------------

@tool
def get_system_status() -> dict:
    """Check if ANGELA has data loaded and get basic statistics.

    Returns:
        Dictionary with loaded status, entity count, transaction count, and bucket count.
    """
    return {
        "loaded": store.is_loaded,
        "n_entities": len(store.entities),
        "n_transactions": len(store.transactions),
        "n_buckets": store.n_buckets,
    }


@tool
def lookup_entity(entity_id: str, bucket: int) -> dict:
    """Look up an entity by ID and return its details, risk score, reasons, evidence, and activity.

    Args:
        entity_id: The entity identifier to look up.
        bucket: Time bucket index (0-based).
    """
    entity = store.get_entity(entity_id)
    if entity is None:
        return {"error": f"Entity '{entity_id}' not found"}

    risk = store.get_entity_risk(bucket, entity_id)
    activity = store.get_entity_activity(bucket, entity_id)

    return {
        "entity_id": entity["id"],
        "type": entity.get("type", "account"),
        "bank": entity.get("bank", "Unknown"),
        "jurisdiction_bucket": entity.get("jurisdiction_bucket"),
        "kyc_level": entity.get("kyc_level"),
        "risk_score": risk["risk_score"],
        "reasons": risk["reasons"],
        "evidence": risk["evidence"],
        "activity": activity,
    }


@tool
def search_high_risk_entities(bucket: int, limit: int = 10) -> dict:
    """Search for the highest-risk entities in a time bucket, ranked by risk score descending.

    Args:
        bucket: Time bucket index.
        limit: Maximum entities to return. Default 10.
    """
    risk_data = store.risk_by_bucket.get(bucket, {})
    scored = [
        {
            "entity_id": eid,
            "risk_score": data["risk_score"],
            "top_reason": data["reasons"][0]["detail"] if data.get("reasons") else "Elevated risk",
            "type": (store.get_entity(eid) or {}).get("type", "unknown"),
            "bank": (store.get_entity(eid) or {}).get("bank", "Unknown"),
        }
        for eid, data in risk_data.items()
        if data["risk_score"] > 0.1
    ]
    scored.sort(key=lambda x: x["risk_score"], reverse=True)
    return {
        "bucket": bucket,
        "total_with_risk": len(scored),
        "entities": scored[:limit],
    }


@tool
def get_entity_neighbors(entity_id: str, bucket: int, hops: int = 2) -> dict:
    """Get the transaction network neighborhood of an entity via BFS traversal.

    Args:
        entity_id: Center entity ID.
        bucket: Time bucket index.
        hops: BFS depth 1-3. Default 2.
    """
    from collections import deque

    entity = store.get_entity(entity_id)
    if entity is None:
        return {"error": f"Entity '{entity_id}' not found"}

    bucket_tx = store.get_bucket_transactions(bucket)
    adj: dict[str, set[str]] = {}
    for tx in bucket_tx:
        if tx["from_id"] != tx["to_id"]:
            adj.setdefault(tx["from_id"], set()).add(tx["to_id"])
            adj.setdefault(tx["to_id"], set()).add(tx["from_id"])

    visited: set[str] = {entity_id}
    queue: deque[tuple[str, int]] = deque([(entity_id, 0)])
    while queue:
        current, depth = queue.popleft()
        if depth >= min(hops, 3):
            continue
        for neighbor in adj.get(current, set()):
            if neighbor not in visited and len(visited) < 50:
                visited.add(neighbor)
                queue.append((neighbor, depth + 1))

    neighbors = []
    for eid in sorted(visited):
        if eid == entity_id:
            continue
        risk = store.get_entity_risk(bucket, eid)
        ent = store.get_entity(eid)
        neighbors.append({
            "entity_id": eid,
            "type": ent.get("type", "account") if ent else "unknown",
            "risk_score": risk["risk_score"],
        })

    return {
        "center": entity_id,
        "hops": hops,
        "neighbor_count": len(neighbors),
        "neighbors": neighbors[:20],
    }


@tool
def detect_risk_clusters(bucket: int) -> dict:
    """Find clusters of connected high-risk entities in a time bucket.

    Args:
        bucket: Time bucket index.
    """
    risk_data = store.risk_by_bucket.get(bucket, {})
    bucket_tx = store.get_bucket_transactions(bucket)
    clusters = detect_clusters(risk_data, bucket_tx, threshold=0.3)
    return {
        "bucket": bucket,
        "cluster_count": len(clusters),
        "clusters": clusters,
    }


@tool
def get_investigation_targets(bucket: int) -> dict:
    """Get ranked investigation targets — the most interesting entities and clusters to look at.

    Args:
        bucket: Time bucket index.
    """
    targets = generate_investigation_targets(bucket)
    return {"bucket": bucket, "targets": targets}


@tool
def get_executive_dashboard(bucket: int) -> dict:
    """Get executive dashboard metrics: aggregate risk distribution, alerts, and flow statistics.

    Args:
        bucket: Time bucket index.
    """
    return compute_dashboard(bucket)


@tool
def generate_entity_summary(entity_id: str, bucket: int) -> dict:
    """Generate an AI narrative summary of an entity's risk profile for a compliance officer.

    Args:
        entity_id: Entity ID to summarize.
        bucket: Time bucket index.
    """
    entity = store.get_entity(entity_id)
    if entity is None:
        return {"error": f"Entity '{entity_id}' not found"}

    risk = store.get_entity_risk(bucket, entity_id)
    activity = store.get_entity_activity(bucket, entity_id)

    summary = _gen_summary(
        entity_id=entity_id,
        risk_score=risk["risk_score"],
        reasons_key=json.dumps(risk["reasons"], sort_keys=True),
        evidence_key=json.dumps(risk["evidence"], sort_keys=True),
        activity_key=json.dumps(activity, sort_keys=True) if activity else "null",
        bucket=bucket,
    )
    return {"entity_id": entity_id, "bucket": bucket, "summary": summary}


@tool
def generate_sar_narrative(entity_id: str, bucket: int) -> dict:
    """Generate a FinCEN-style SAR narrative for regulatory filing based on risk evidence.

    Args:
        entity_id: Entity ID.
        bucket: Time bucket index.
    """
    entity = store.get_entity(entity_id)
    if entity is None:
        return {"error": f"Entity '{entity_id}' not found"}

    risk = store.get_entity_risk(bucket, entity_id)
    activity = store.get_entity_activity(bucket, entity_id)

    bucket_tx = store.get_bucket_transactions(bucket)
    connected_ids: set[str] = set()
    for tx in bucket_tx:
        if tx["from_id"] == entity_id and tx["to_id"] != entity_id:
            connected_ids.add(tx["to_id"])
        elif tx["to_id"] == entity_id and tx["from_id"] != entity_id:
            connected_ids.add(tx["from_id"])

    connected_entities = []
    for cid in sorted(connected_ids)[:10]:
        cr = store.get_entity_risk(bucket, cid)
        connected_entities.append({"id": cid, "risk_score": cr["risk_score"]})

    payload = build_sar_payload(
        entity_id=entity_id,
        entity_type=entity.get("type", "account"),
        bank=entity.get("bank", "Unknown"),
        jurisdiction_bucket=entity["jurisdiction_bucket"],
        risk_score=risk["risk_score"],
        reasons=risk["reasons"],
        evidence=risk["evidence"],
        activity=activity,
        connected_entities=connected_entities,
        bucket=bucket,
        bucket_size_seconds=store.metadata.get("bucket_size_seconds", 86400),
    )

    narrative = _gen_sar(
        entity_id=entity_id,
        payload_key=json.dumps(payload, sort_keys=True, default=str),
    )
    return {"entity_id": entity_id, "bucket": bucket, "narrative": narrative}


# ---------------------------------------------------------------------------
# Agent factory + invocation
# ---------------------------------------------------------------------------

ALL_TOOLS = [
    get_system_status,
    lookup_entity,
    search_high_risk_entities,
    get_entity_neighbors,
    detect_risk_clusters,
    get_investigation_targets,
    get_executive_dashboard,
    generate_entity_summary,
    generate_sar_narrative,
]

_agent: Agent | None = None


def _get_agent() -> Agent:
    global _agent
    if _agent is None:
        region = os.getenv("AWS_REGION", "us-east-1")
        model_id = os.getenv("BEDROCK_MODEL_ID", "minimax.minimax-m2")

        bedrock_model = BedrockModel(
            model_id=model_id,
            region_name=region,
        )

        _agent = Agent(
            model=bedrock_model,
            tools=ALL_TOOLS,
            system_prompt=SYSTEM_PROMPT,
        )
        log.info("Strands Agent initialized: model=%s region=%s tools=%d",
                 model_id, region, len(ALL_TOOLS))
    return _agent


async def invoke(
    query: str,
    bucket: int,
    session_id: str | None = None,
    profile: str = "balanced",
) -> dict[str, Any]:
    """Run an investigation through the Strands Agent.

    This is the main entry point called from routes.py.
    Returns a structure compatible with AgentInvestigateResult.
    """
    session_id = session_id or f"angela-{uuid4()}"

    if bucket is not None:
        prompt = f"[Time bucket: {bucket}] {query}"
    else:
        prompt = query

    log.info("Strands Agent invoke: session=%s query=%s", session_id, query[:80])

    agent = _get_agent()
    result = await asyncio.to_thread(agent, prompt)

    message_text = ""
    if hasattr(result, "message"):
        msg = result.message
        if isinstance(msg, dict):
            for block in msg.get("content", []):
                if isinstance(block, dict) and "text" in block:
                    message_text += block["text"]
        elif isinstance(msg, str):
            message_text = msg
        else:
            message_text = str(msg)
    else:
        message_text = str(result)

    # Return structure compatible with AgentInvestigateResult interface
    return {
        "run_id": session_id,
        "status": "completed",
        "query": query,
        "bucket": bucket,
        "profile": profile,
        "intent": "investigate",
        "params": {},
        "interpretation": query,
        "engine": "bedrock_agentcore",
        "research": {
            "entity_ids": [],
            "summary": "Strands Agent investigation completed.",
            "total_targets_found": 0,
        },
        "analysis": {
            "top_entity_id": None,
            "average_risk": 0.0,
            "high_risk_count": 0,
            "detector_counts": {},
            "highlights": [],
        },
        "reporting": {
            "narrative": message_text,
            "sar": None,
        },
    }
