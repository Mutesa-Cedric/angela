from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from threading import Lock, Thread
from typing import Any, Dict, Optional
from uuid import uuid4

from ..data_loader import store
from .prompts_sar import build_sar_payload
from .service import clear_ai_caches, generate_entity_summary, generate_sar_narrative

log = logging.getLogger(__name__)

_state_lock = Lock()
_warmup_state: Dict[str, Any] = {
    "status": "idle",
    "run_id": None,
    "reason": None,
    "bucket": 0,
    "started_at": None,
    "finished_at": None,
    "progress": 0.0,
    "entities_total": 0,
    "entities_done": 0,
    "sar_total": 0,
    "sar_done": 0,
    "errors": [],
    "top_entity_ids": [],
    "partial": False,
    "max_seconds": None,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_ai_warmup_status() -> Dict[str, Any]:
    with _state_lock:
        return dict(_warmup_state)


def trigger_ai_warmup(
    bucket: Optional[int] = None,
    top_entities: Optional[int] = None,
    top_sar: Optional[int] = None,
    reason: str = "manual",
) -> Dict[str, Any]:
    enabled = os.getenv("ANGELA_AI_WARMUP_ENABLED", "1").strip().lower() not in {"0", "false", "off"}
    if not enabled:
        return {"status": "disabled"}

    if not store.is_loaded or store.n_buckets <= 0:
        return {"status": "skipped", "detail": "No dataset loaded"}

    target_bucket = _clamp_bucket(
        bucket if bucket is not None else int(os.getenv("ANGELA_AI_WARMUP_BUCKET", "0"))
    )
    entity_budget = max(0, top_entities if top_entities is not None else int(os.getenv("ANGELA_AI_WARMUP_TOP_ENTITIES", "1")))
    sar_budget = max(0, top_sar if top_sar is not None else int(os.getenv("ANGELA_AI_WARMUP_TOP_SAR", "0")))
    max_seconds = max(1, int(os.getenv("ANGELA_AI_WARMUP_MAX_SECONDS", "25")))

    run_id = uuid4().hex
    clear_ai_caches()
    with _state_lock:
        _warmup_state.update({
            "status": "running",
            "run_id": run_id,
            "reason": reason,
            "bucket": target_bucket,
            "started_at": _now_iso(),
            "finished_at": None,
            "progress": 0.0,
            "entities_total": entity_budget,
            "entities_done": 0,
            "sar_total": sar_budget,
            "sar_done": 0,
            "errors": [],
            "top_entity_ids": [],
            "partial": False,
            "max_seconds": max_seconds,
        })

    Thread(
        target=_run_warmup,
        args=(run_id, target_bucket, entity_budget, sar_budget, max_seconds),
        daemon=True,
        name=f"angela-ai-warmup-{run_id[:8]}",
    ).start()

    return get_ai_warmup_status()


def _run_warmup(run_id: str, bucket: int, top_entities: int, top_sar: int, max_seconds: int) -> None:
    try:
        deadline = time.monotonic() + max_seconds
        entity_ids = _select_top_entities(bucket=bucket, limit=top_entities)
        _set_state(run_id, {"top_entity_ids": entity_ids, "entities_total": len(entity_ids)})

        for idx, entity_id in enumerate(entity_ids):
            if not _is_active_run(run_id):
                return
            if time.monotonic() >= deadline:
                _mark_partial_completion(run_id)
                return
            _warm_entity_summary(entity_id=entity_id, bucket=bucket)
            _set_state(run_id, {"entities_done": idx + 1})

        sar_ids = entity_ids[:top_sar]
        _set_state(run_id, {"sar_total": len(sar_ids)})

        for idx, entity_id in enumerate(sar_ids):
            if not _is_active_run(run_id):
                return
            if time.monotonic() >= deadline:
                _mark_partial_completion(run_id)
                return
            _warm_sar(entity_id=entity_id, bucket=bucket)
            _set_state(run_id, {"sar_done": idx + 1})

        _set_state(
            run_id,
            {
                "status": "completed",
                "progress": 100.0,
                "finished_at": _now_iso(),
            },
        )
    except Exception as exc:
        log.exception("AI warmup failed: %s", exc)
        _set_state(
            run_id,
            {
                "status": "failed",
                "finished_at": _now_iso(),
                "errors": [f"{type(exc).__name__}: {exc}"],
            },
        )


def _select_top_entities(bucket: int, limit: int) -> list[str]:
    if limit <= 0:
        return []

    risk_data = store.risk_by_bucket.get(bucket, {})
    ranked = sorted(
        risk_data.items(),
        key=lambda item: float(item[1].get("risk_score", 0.0)),
        reverse=True,
    )
    entity_ids = [entity_id for entity_id, data in ranked if data.get("risk_score", 0.0) > 0][:limit]

    # Fallback if no risky entities are available in this bucket.
    if not entity_ids:
        entity_ids = [e["id"] for e in store.entities[:limit] if "id" in e]
    return entity_ids


def _warm_entity_summary(entity_id: str, bucket: int) -> None:
    risk = store.get_entity_risk(bucket, entity_id)
    activity = store.get_entity_activity(bucket, entity_id)
    generate_entity_summary(
        entity_id=entity_id,
        risk_score=float(risk.get("risk_score", 0.0)),
        reasons_key=json.dumps(risk.get("reasons", []), sort_keys=True, default=str),
        evidence_key=json.dumps(risk.get("evidence", {}), sort_keys=True, default=str),
        activity_key=json.dumps(activity, sort_keys=True, default=str) if activity else "null",
        bucket=bucket,
    )


def _warm_sar(entity_id: str, bucket: int) -> None:
    payload = _build_entity_sar_payload(entity_id=entity_id, bucket=bucket)
    if payload is None:
        return
    generate_sar_narrative(
        entity_id=entity_id,
        payload_key=json.dumps(payload, sort_keys=True, default=str),
    )


def _build_entity_sar_payload(entity_id: str, bucket: int) -> Optional[Dict[str, Any]]:
    entity = store.get_entity(entity_id)
    if entity is None:
        return None

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
        connected_entities.append({"id": cid, "risk_score": cr.get("risk_score", 0.0)})

    return build_sar_payload(
        entity_id=entity_id,
        entity_type=entity.get("type", "account"),
        bank=entity.get("bank", "Unknown"),
        jurisdiction_bucket=entity.get("jurisdiction_bucket", 0),
        risk_score=risk.get("risk_score", 0.0),
        reasons=risk.get("reasons", []),
        evidence=risk.get("evidence", {}),
        activity=activity,
        connected_entities=connected_entities,
        bucket=bucket,
        bucket_size_seconds=store.metadata.get("bucket_size_seconds", 86400),
    )


def _clamp_bucket(bucket: int) -> int:
    if store.n_buckets <= 0:
        return 0
    if bucket < 0:
        return 0
    if bucket >= store.n_buckets:
        return store.n_buckets - 1
    return bucket


def _is_active_run(run_id: str) -> bool:
    with _state_lock:
        return _warmup_state.get("run_id") == run_id and _warmup_state.get("status") == "running"


def _set_state(run_id: str, updates: Dict[str, Any]) -> None:
    with _state_lock:
        if _warmup_state.get("run_id") != run_id:
            return
        _warmup_state.update(updates)
        if _warmup_state.get("status") == "running":
            _warmup_state["progress"] = _compute_progress(_warmup_state)


def _compute_progress(state: Dict[str, Any]) -> float:
    entities_total = int(state.get("entities_total") or 0)
    entities_done = int(state.get("entities_done") or 0)
    sar_total = int(state.get("sar_total") or 0)
    sar_done = int(state.get("sar_done") or 0)

    total = entities_total + sar_total
    done = entities_done + sar_done
    if total <= 0:
        return 0.0
    return round(min(99.0, (done / total) * 100.0), 1)


def _mark_partial_completion(run_id: str) -> None:
    _set_state(
        run_id,
        {
            "status": "completed",
            "partial": True,
            "progress": 100.0,
            "finished_at": _now_iso(),
        },
    )

