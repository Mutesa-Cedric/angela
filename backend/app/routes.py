import json
import random
from collections import deque
from enum import Enum
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .agents.schemas import AgentInvestigateRequest
from .agents.supervisor import supervisor
from .ai.service import clear_ai_caches, generate_entity_summary, generate_sar_narrative
from .ai.warmup import get_ai_warmup_status, trigger_ai_warmup
from .ai.prompts_sar import build_sar_payload
from .assets.generator import ASSETS_DIR
from .assets.orchestrator import handle_beacon_asset, handle_cluster_asset
from .clusters import detect_clusters
from .config import DATA_PATH
from .counterfactual import compute_counterfactual
from .nlq import parse_query, execute_intent
from .investigation import generate_investigation_targets
from .input_memory import input_memory
from .csv_processor import process_csv, process_csv_mapped, preview_csv
from .dashboard import compute_dashboard
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

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


def _normalize_query(query: str) -> str:
    return " ".join((query or "").strip().split())


def _dataset_stamp() -> str:
    if not store.is_loaded:
        return "unloaded"
    sample_type = str(store.metadata.get("sample_type", "unknown"))
    tail = store.transactions[-1] if store.transactions else {}
    tail_key = str(tail.get("tx_id") or tail.get("timestamp") or "none")
    return f"{sample_type}:{store.n_buckets}:{len(store.entities)}:{len(store.transactions)}:{tail_key}"


# --- Status + Upload ---

@router.get("/status")
async def get_status() -> dict:
    return {
        "loaded": store.is_loaded,
        "n_entities": len(store.entities),
        "n_transactions": len(store.transactions),
        "n_buckets": store.n_buckets,
    }


@router.post("/upload")
async def upload_file(file: UploadFile) -> dict:
    fname = (file.filename or "").lower()
    if not fname.endswith(".csv") and not fname.endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be .csv or .json")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    if fname.endswith(".json"):
        try:
            snapshot = json.loads(contents)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
        if not isinstance(snapshot, dict) or "entities" not in snapshot or "transactions" not in snapshot:
            raise HTTPException(status_code=400, detail="JSON must contain 'entities' and 'transactions' keys")
    else:
        try:
            snapshot = process_csv(contents, filename=file.filename)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    store.load_from_dict(snapshot)
    clear_ai_caches()
    input_memory.clear_cache()
    trigger_ai_warmup(reason="upload")

    return {
        "status": "ok",
        "n_entities": len(store.entities),
        "n_transactions": len(store.transactions),
        "n_buckets": store.n_buckets,
    }


@router.post("/upload/preview")
async def upload_preview(file: UploadFile) -> dict:
    fname = (file.filename or "").lower()
    if not fname.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Preview only supports CSV files")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    try:
        return preview_csv(contents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload/mapped")
async def upload_mapped(file: UploadFile, mapping: str = Query(..., description="JSON column mapping")) -> dict:
    import json as _json

    fname = (file.filename or "").lower()
    if not fname.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Mapped upload only supports CSV files")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    try:
        col_mapping = _json.loads(mapping)
    except _json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid mapping JSON")

    if not isinstance(col_mapping, dict):
        raise HTTPException(status_code=400, detail="Mapping must be a JSON object")

    try:
        snapshot = process_csv_mapped(contents, col_mapping, filename=file.filename or "upload.csv")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    store.load_from_dict(snapshot)
    clear_ai_caches()
    input_memory.clear_cache()
    trigger_ai_warmup(reason="upload_mapped")

    return {
        "status": "ok",
        "n_entities": len(store.entities),
        "n_transactions": len(store.transactions),
        "n_buckets": store.n_buckets,
    }


@router.post("/load-sample")
async def load_sample() -> dict:
    if not DATA_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample data not found on server")

    store.load(DATA_PATH)
    clear_ai_caches()
    input_memory.clear_cache()
    trigger_ai_warmup(reason="load_sample")

    return {
        "status": "ok",
        "n_entities": len(store.entities),
        "n_transactions": len(store.transactions),
        "n_buckets": store.n_buckets,
    }


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

    # Precompute per-entity volume for this bucket
    bucket_tx = store.get_bucket_transactions(t)
    entity_volume: dict[str, float] = {}
    for tx in bucket_tx:
        entity_volume[tx["from_id"]] = entity_volume.get(tx["from_id"], 0.0) + tx["amount"]
        entity_volume[tx["to_id"]] = entity_volume.get(tx["to_id"], 0.0) + tx["amount"]

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
                    entity_type=entity.get("type", "account"),
                    volume=entity_volume.get(eid, 0.0),
                )
            )
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

    # Compute per-entity volume from bucket transactions
    entity_volume: dict[str, float] = {}
    for tx in bucket_tx:
        entity_volume[tx["from_id"]] = entity_volume.get(tx["from_id"], 0.0) + tx["amount"]
        entity_volume[tx["to_id"]] = entity_volume.get(tx["to_id"], 0.0) + tx["amount"]

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
                    entity_type=ent.get("type", "account"),
                    volume=entity_volume.get(eid, 0.0),
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
    input_memory.clear_cache()

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

    # Generate GLB assets for detected clusters
    assets_generated = 0
    for cluster in clusters:
        result = await handle_cluster_asset(cluster, t, manager.broadcast)
        if result:
            assets_generated += 1

    # Generate beacon for the injected high-risk entity
    target_risk = store.risk_by_bucket[t].get(target_id, {}).get("risk_score", 0)
    if target_risk > 0.5:
        await handle_beacon_asset(target_id, target_risk, t, manager.broadcast)
        assets_generated += 1

    return {
        "status": "injected",
        "pattern": pattern.value,
        "bucket": t,
        "target_entity": target_id,
        "injected_count": len(injected_tx),
        "clusters_found": len(clusters),
        "assets_generated": assets_generated,
    }


# --- Asset Serving ---

@router.get("/assets/{filename}")
async def get_asset(filename: str) -> FileResponse:
    path = ASSETS_DIR / filename
    if not path.exists() or not path.suffix == ".glb":
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(path, media_type="model/gltf-binary")


# --- AI Copilot ---

@router.get("/ai/warmup/status")
async def ai_warmup_status() -> dict:
    return get_ai_warmup_status()


@router.post("/ai/warmup/trigger")
async def ai_warmup_trigger(
    bucket: int = Query(0, ge=0),
    top_entities: int = Query(3, ge=0, le=20),
    top_sar: int = Query(1, ge=0, le=10),
) -> dict:
    if not store.is_loaded:
        raise HTTPException(status_code=400, detail="No dataset loaded. Call /load-sample or upload first.")
    return trigger_ai_warmup(
        bucket=bucket,
        top_entities=top_entities,
        top_sar=top_sar,
        reason="manual_trigger",
    )


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


# --- Autopilot / Investigation ---

@router.get("/autopilot/targets")
async def get_autopilot_targets(
    t: int = Query(..., description="Time bucket index"),
) -> dict:
    if t < 0 or t >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={t} out of range [0, {store.n_buckets - 1}]",
        )
    targets = generate_investigation_targets(t)
    return {"bucket": t, "targets": targets}


# --- Clusters ---

@router.get("/clusters")
async def get_clusters(
    t: int = Query(..., description="Time bucket index"),
) -> dict:
    if t < 0 or t >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={t} out of range [0, {store.n_buckets - 1}]",
        )
    risk_data = store.risk_by_bucket.get(t, {})
    bucket_key = str(t)
    tx_indices = store.bucket_index.get(bucket_key, [])
    bucket_tx = [store.transactions[i] for i in tx_indices if i < len(store.transactions)]
    clusters = detect_clusters(risk_data, bucket_tx, threshold=0.3)
    return {"bucket": t, "clusters": clusters}


# --- SAR Narrative ---

@router.post("/ai/sar/entity/{entity_id}")
async def generate_sar(
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

    # Get connected entities for context
    bucket_tx = store.get_bucket_transactions(t)
    connected_ids: set[str] = set()
    for tx in bucket_tx:
        if tx["from_id"] == entity_id and tx["to_id"] != entity_id:
            connected_ids.add(tx["to_id"])
        elif tx["to_id"] == entity_id and tx["from_id"] != entity_id:
            connected_ids.add(tx["from_id"])

    connected_entities = []
    for cid in sorted(connected_ids)[:10]:
        cr = store.get_entity_risk(t, cid)
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
        bucket=t,
        bucket_size_seconds=store.metadata.get("bucket_size_seconds", 86400),
    )

    narrative = generate_sar_narrative(
        entity_id=entity_id,
        payload_key=json.dumps(payload, sort_keys=True, default=str),
    )

    return {
        "entity_id": entity_id,
        "bucket": t,
        "narrative": narrative,
        "payload": payload,
    }


# --- Executive Dashboard ---

@router.get("/dashboard")
async def get_dashboard(
    t: int = Query(..., description="Time bucket index"),
) -> dict:
    if t < 0 or t >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={t} out of range [0, {store.n_buckets - 1}]",
        )
    return compute_dashboard(t)


# --- Natural Language Query ---


@router.get("/inputs/history")
async def get_inputs_history(
    limit: int = Query(30, ge=1, le=200),
    kind: Optional[str] = Query(None, description="Optional filter: nlq.parse or agent.investigate"),
    include_input: bool = Query(True, description="Include original input payload"),
) -> dict:
    entries = input_memory.recent_inputs(limit=limit, kind=kind)
    if not include_input:
        for entry in entries:
            entry.pop("input", None)
    return {"entries": entries}


class NLQParseRequest(BaseModel):
    query: str
    bucket: int


@router.post("/nlq/parse")
async def nlq_parse(req: NLQParseRequest) -> dict:
    if req.bucket < 0 or req.bucket >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={req.bucket} out of range [0, {store.n_buckets - 1}]",
        )
    normalized_query = _normalize_query(req.query)
    cache_payload = {
        "dataset": _dataset_stamp(),
        "query": normalized_query,
        "bucket": req.bucket,
    }
    cached = input_memory.get_cached("nlq.parse", cache_payload)
    if cached is not None:
        input_memory.record_input(
            kind="nlq.parse",
            payload={"query": normalized_query, "bucket": req.bucket},
            bucket=req.bucket,
            cache_hit=True,
            meta={"source": "cache"},
        )
        return cached

    parsed = parse_query(normalized_query)
    result = execute_intent(parsed["intent"], parsed.get("params", {}), req.bucket)
    response = {
        "intent": parsed["intent"],
        "params": parsed.get("params", {}),
        "interpretation": parsed.get("interpretation", ""),
        "entity_ids": result["entity_ids"],
        "edges": result["edges"],
        "summary": result["summary"],
    }
    input_memory.set_cached("nlq.parse", cache_payload, response)
    input_memory.record_input(
        kind="nlq.parse",
        payload={"query": normalized_query, "bucket": req.bucket},
        bucket=req.bucket,
        cache_hit=False,
        meta={
            "intent": parsed.get("intent"),
            "matched_entities": len(result.get("entity_ids", [])),
        },
    )
    return response


# --- Multi-Agent Investigation ---

@router.post("/agent/investigate")
async def agent_investigate(req: AgentInvestigateRequest) -> dict:
    if not store.is_loaded:
        raise HTTPException(
            status_code=400,
            detail="No dataset loaded. Call /load-sample or upload data first.",
        )
    if req.bucket < 0 or req.bucket >= store.n_buckets:
        raise HTTPException(
            status_code=400,
            detail=f"Bucket t={req.bucket} out of range [0, {store.n_buckets - 1}]",
        )

    normalized_query = _normalize_query(req.query)
    cache_payload = {
        "dataset": _dataset_stamp(),
        "query": normalized_query,
        "bucket": req.bucket,
        "include_sar": bool(req.include_sar),
        "max_targets": int(req.max_targets),
        "profile": req.profile,
    }
    cached_result = input_memory.get_cached("agent.investigate", cache_payload)
    if cached_result is not None:
        materialized = supervisor.materialize_cached_result(
            cached_result=cached_result,
            query=normalized_query,
            bucket=req.bucket,
            include_sar=req.include_sar,
            max_targets=req.max_targets,
            profile=req.profile,
        )
        input_memory.record_input(
            kind="agent.investigate",
            payload={
                "query": normalized_query,
                "bucket": req.bucket,
                "include_sar": req.include_sar,
                "max_targets": req.max_targets,
                "profile": req.profile,
            },
            bucket=req.bucket,
            cache_hit=True,
            meta={"source": "cache", "profile": req.profile},
        )
        return materialized

    try:
        result = await supervisor.run(
            query=normalized_query,
            bucket=req.bucket,
            include_sar=req.include_sar,
            max_targets=req.max_targets,
            profile=req.profile,
            broadcast_fn=manager.broadcast,
        )
        input_memory.set_cached("agent.investigate", cache_payload, result)
        input_memory.record_input(
            kind="agent.investigate",
            payload={
                "query": normalized_query,
                "bucket": req.bucket,
                "include_sar": req.include_sar,
                "max_targets": req.max_targets,
                "profile": req.profile,
            },
            bucket=req.bucket,
            cache_hit=False,
            meta={"run_id": result.get("run_id"), "profile": req.profile},
        )
        return result
    except Exception as e:
        input_memory.record_input(
            kind="agent.investigate",
            payload={
                "query": normalized_query,
                "bucket": req.bucket,
                "include_sar": req.include_sar,
                "max_targets": req.max_targets,
                "profile": req.profile,
            },
            bucket=req.bucket,
            cache_hit=False,
            meta={"error": str(e)},
        )
        raise HTTPException(status_code=500, detail=f"Agent investigation failed: {e}")


@router.get("/agent/run/{run_id}")
async def agent_get_run(run_id: str) -> dict:
    run = supervisor.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return run


@router.get("/agent/runs")
async def agent_list_runs(
    limit: int = Query(20, ge=1, le=100),
    compact: bool = Query(True, description="Return summarized run records"),
) -> dict:
    runs = supervisor.list_runs(limit=limit)
    if not compact:
        return {"runs": runs}

    summarized = []
    for run in runs:
        summarized.append({
            "run_id": run.get("run_id"),
            "status": run.get("status"),
            "query": run.get("query"),
            "bucket": run.get("bucket"),
            "created_at": run.get("created_at"),
            "updated_at": run.get("updated_at"),
            "completed_at": run.get("completed_at"),
            "error": run.get("error"),
            "progress": run.get("progress", 0),
            "current_step": run.get("current_step"),
            "profile": run.get("config", {}).get("profile", "balanced"),
        })
    return {"runs": summarized}


@router.get("/agent/presets")
async def agent_presets() -> dict:
    return {
        "presets": [
            {
                "id": "high-risk",
                "label": "High Risk Entities",
                "query": "show high risk entities",
                "profile": "balanced",
                "include_sar": False,
                "max_targets": 5,
            },
            {
                "id": "large-incoming",
                "label": "Large Incoming Flows",
                "query": "show entities receiving large transaction volumes",
                "profile": "balanced",
                "include_sar": True,
                "max_targets": 3,
            },
            {
                "id": "structuring",
                "label": "Structuring Patterns",
                "query": "find structuring near threshold transactions",
                "profile": "deep",
                "include_sar": True,
                "max_targets": 5,
            },
            {
                "id": "circular",
                "label": "Circular Flow Rings",
                "query": "show circular flow and layering activity",
                "profile": "deep",
                "include_sar": False,
                "max_targets": 8,
            },
        ]
    }


# --- Counterfactual Explainer ---

@router.post("/counterfactual/entity/{entity_id}")
async def counterfactual_entity(
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

    return compute_counterfactual(entity_id, t)
