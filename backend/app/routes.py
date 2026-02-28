from collections import deque

from fastapi import APIRouter, HTTPException, Query

from .data_loader import store
from .models import (
    EntityDetailOut,
    NeighborhoodOut,
    SnapshotMeta,
    SnapshotNode,
    SnapshotOut,
)

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
