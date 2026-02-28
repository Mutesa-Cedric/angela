import json
import random
from collections import deque
from enum import Enum

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from .ai.service import generate_entity_summary
from .clusters import detect_clusters
from .data_loader import store
from .models import (
    EntityDetailOut,
    NeighborhoodOut,
    SnapshotMeta,
    SnapshotNode,
    SnapshotOut,
)
from .risk.scoring import compute_risk_for_bucket
from .ws import manager

router = APIRouter()


@router.get("/snapshot", response_model=SnapshotOut)
async def get_snapshot(t: int = Query(..., description="Time bucket index")) -> SnapshotOut:
    if t < 0 or t >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={t} out of range [0, {store.n_buckets - 1}]",
        )

    # Get entities active in this bucket
    active_ids = set(store.get_bucket_entities(t))

    # If no activity in this bucket, return all entities (bucket may be sparse)
    if not active_ids:
        active_ids = {e["id"] for e in store.entities}

    nodes = []
    for eid in sorted(active_ids):
        entity = store.get_entity(eid)
        if entity:
            risk = store.get_entity_risk(t, eid)
            nodes.append(
                SnapshotNode(
                    id=entity["id"],
                    jurisdiction_bucket=entity["jurisdiction_bucket"],
                    kyc_level=entity["kyc_level"],
                    risk_score=risk["risk_score"],
                )
            )

    # Get edges for this bucket
    bucket_tx = store.get_bucket_transactions(t)
    edges = [
        {"from_id": tx["from_id"], "to_id": tx["to_id"], "amount": tx["amount"]}
        for tx in bucket_tx
        if tx["from_id"] != tx["to_id"]
    ]

    meta = SnapshotMeta(
        t=t,
        n_buckets=store.n_buckets,
        n_entities=len(nodes),
        n_transactions=len(bucket_tx),
        bucket_size_seconds=store.metadata.get("bucket_size_seconds", 86400),
    )

    return SnapshotOut(meta=meta, nodes=nodes, edges=edges)


@router.get("/entity/{entity_id}", response_model=EntityDetailOut)
async def get_entity(
    entity_id: str,
    t: int = Query(None, description="Optional time bucket for activity context"),
) -> EntityDetailOut:
    entity = store.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    activity = None
    if t is not None:
        if t < 0 or t >= store.n_buckets:
            raise HTTPException(
                status_code=400,
                detail=f"Bucket t={t} out of range [0, {store.n_buckets - 1}]",
            )
        activity = store.get_entity_activity(t, entity_id)

    risk = store.get_entity_risk(t if t is not None else 0, entity_id)

    return EntityDetailOut(
        id=entity["id"],
        type=entity["type"],
        bank=entity["bank"],
        jurisdiction_bucket=entity["jurisdiction_bucket"],
        kyc_level=entity["kyc_level"],
        risk_score=risk["risk_score"],
        reasons=risk["reasons"],
        evidence=risk["evidence"],
        activity=activity,
    )


MAX_NEIGHBOR_NODES = 200
MAX_NEIGHBOR_EDGES = 500


@router.get("/neighbors", response_model=NeighborhoodOut)
async def get_neighbors(
    id: str = Query(..., description="Center entity ID"),
    k: int = Query(1, ge=1, le=3, description="Hop depth (1-3)"),
    t: int = Query(..., description="Time bucket index"),
) -> NeighborhoodOut:
    if t < 0 or t >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={t} out of range [0, {store.n_buckets - 1}]",
        )

    entity = store.get_entity(id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{id}' not found")

    # BFS k-hop neighborhood using bucket-specific transactions
    bucket_tx = store.get_bucket_transactions(t)

    # Build bucket-local adjacency
    adj: dict[str, set[str]] = {}
    for tx in bucket_tx:
        if tx["from_id"] != tx["to_id"]:
            adj.setdefault(tx["from_id"], set()).add(tx["to_id"])
            adj.setdefault(tx["to_id"], set()).add(tx["from_id"])

    visited: set[str] = {id}
    queue: deque[tuple[str, int]] = deque([(id, 0)])

    while queue:
        current, depth = queue.popleft()
        if depth >= k:
            continue
        for neighbor in adj.get(current, set()):
            if neighbor not in visited and len(visited) < MAX_NEIGHBOR_NODES:
                visited.add(neighbor)
                queue.append((neighbor, depth + 1))

    # Collect edges between visited nodes (deduplicated)
    edges = []
    seen_edges: set[tuple[str, str]] = set()
    for tx in bucket_tx:
        if tx["from_id"] in visited and tx["to_id"] in visited and tx["from_id"] != tx["to_id"]:
            edge_key = (tx["from_id"], tx["to_id"])
            if edge_key not in seen_edges and len(edges) < MAX_NEIGHBOR_EDGES:
                seen_edges.add(edge_key)
                edges.append({"from_id": tx["from_id"], "to_id": tx["to_id"], "amount": tx["amount"]})

    # Build node list
    nodes = []
    for eid in sorted(visited):
        ent = store.get_entity(eid)
        if ent:
            risk = store.get_entity_risk(t, eid)
            nodes.append(
                SnapshotNode(
                    id=ent["id"],
                    jurisdiction_bucket=ent["jurisdiction_bucket"],
                    kyc_level=ent["kyc_level"],
                    risk_score=risk["risk_score"],
                )
            )

    return NeighborhoodOut(center_id=id, k=k, nodes=nodes, edges=edges)


# --- WebSocket ---

@router.websocket("/stream")
async def websocket_stream(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keep alive, ignore client messages
    except WebSocketDisconnect:
        manager.disconnect(ws)


# --- Anomaly Injection ---

class InjectPattern(str, Enum):
    velocity = "velocity"
    structuring = "structuring"
    cycle = "cycle"


@router.post("/inject")
async def inject_anomaly(
    pattern: InjectPattern = Query(..., description="Anomaly pattern to inject"),
    t: int = Query(..., description="Target bucket"),
) -> dict:
    if t < 0 or t >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={t} out of range [0, {store.n_buckets - 1}]",
        )

    bucket_tx = store.get_bucket_transactions(t)
    if not bucket_tx:
        raise HTTPException(status_code=400, detail=f"No transactions in bucket {t}")

    # Pick a random entity from this bucket
    rng = random.Random(42 + t)
    entity_ids = list({tx["from_id"] for tx in bucket_tx if tx["from_id"] != tx["to_id"]})
    if not entity_ids:
        raise HTTPException(status_code=400, detail="No valid entities in bucket")
    target_id = rng.choice(entity_ids)

    # Get a few counterparties
    counterparties = list({
        tx["to_id"] for tx in bucket_tx
        if tx["from_id"] == target_id and tx["to_id"] != target_id
    })[:5]
    if not counterparties:
        counterparties = [rng.choice(entity_ids)]

    # Inject synthetic transactions
    base_ts = min(tx["timestamp"] for tx in bucket_tx)
    injected_tx: list[dict] = []

    if pattern == InjectPattern.velocity:
        # Inject 50 rapid-fire transactions
        for i in range(50):
            injected_tx.append({
                "tx_id": f"injected_vel_{t}_{i}",
                "from_id": target_id,
                "to_id": counterparties[i % len(counterparties)],
                "amount": round(rng.uniform(100, 5000), 2),
                "currency": "USD",
                "timestamp": base_ts + i * 60,  # one per minute
                "payment_format": "Wire",
                "is_laundering": 1,
                "bucket_index": t,
            })

    elif pattern == InjectPattern.structuring:
        # Inject 10 transactions just below $10K
        for i in range(10):
            injected_tx.append({
                "tx_id": f"injected_struct_{t}_{i}",
                "from_id": target_id,
                "to_id": counterparties[i % len(counterparties)],
                "amount": round(rng.uniform(9000, 9999), 2),
                "currency": "USD",
                "timestamp": base_ts + i * 300,
                "payment_format": "Wire",
                "is_laundering": 1,
                "bucket_index": t,
            })

    elif pattern == InjectPattern.cycle:
        # Inject a 3-node cycle: target -> A -> B -> target
        if len(counterparties) >= 2:
            a, b = counterparties[0], counterparties[1]
        else:
            a = counterparties[0]
            b = target_id  # self-referencing fallback
        for i, (f, to) in enumerate([(target_id, a), (a, b), (b, target_id)]):
            injected_tx.append({
                "tx_id": f"injected_cycle_{t}_{i}",
                "from_id": f,
                "to_id": to,
                "amount": round(rng.uniform(5000, 50000), 2),
                "currency": "USD",
                "timestamp": base_ts + i * 600,
                "payment_format": "Wire",
                "is_laundering": 1,
                "bucket_index": t,
            })

    # Add injected transactions to the bucket
    for tx in injected_tx:
        store.transactions.append(tx)
        bucket_key = str(t)
        idx = len(store.transactions) - 1
        store.bucket_index.setdefault(bucket_key, []).append(idx)

    # Recompute risk for this bucket
    all_bucket_tx = store.get_bucket_transactions(t)
    bucket_size = store.metadata.get("bucket_size_seconds", 86400)
    store.risk_by_bucket[t] = compute_risk_for_bucket(all_bucket_tx, bucket_size)

    # Detect clusters
    clusters = detect_clusters(store.risk_by_bucket[t], all_bucket_tx)

    # Broadcast events
    changed_risks = {
        eid: data["risk_score"]
        for eid, data in store.risk_by_bucket[t].items()
        if data["risk_score"] > 0
    }

    await manager.broadcast("RISK_UPDATED", {
        "bucket": t,
        "entity_risks": changed_risks,
        "injected_entity": target_id,
        "pattern": pattern.value,
    })

    for cluster in clusters:
        await manager.broadcast("CLUSTER_DETECTED", {
            "bucket": t,
            **cluster,
        })

    return {
        "status": "injected",
        "pattern": pattern.value,
        "bucket": t,
        "target_entity": target_id,
        "injected_count": len(injected_tx),
        "clusters_found": len(clusters),
    }


# --- AI Copilot ---

@router.get("/ai/explain/entity/{entity_id}")
async def ai_explain_entity(
    entity_id: str,
    t: int = Query(..., description="Time bucket index"),
) -> dict:
    if t < 0 or t >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={t} out of range [0, {store.n_buckets - 1}]",
        )

    entity = store.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    risk = store.get_entity_risk(t, entity_id)
    activity = store.get_entity_activity(t, entity_id)

    summary = generate_entity_summary(
        entity_id=entity_id,
        risk_score=risk["risk_score"],
        reasons_key=json.dumps(risk["reasons"], sort_keys=True),
        evidence_key=json.dumps(risk["evidence"], sort_keys=True),
        activity_key=json.dumps(activity, sort_keys=True) if activity else "null",
        bucket=t,
    )

    return {
        "entity_id": entity_id,
        "bucket": t,
        "summary": summary,
    }
