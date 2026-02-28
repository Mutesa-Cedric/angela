"""Asset orchestration: generates GLB assets when clusters are detected.

Flow: CLUSTER_DETECTED → generate GLB → save → emit ASSET_READY
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from .generator import make_beacon, make_cluster_blob

log = logging.getLogger(__name__)


async def handle_cluster_asset(
    cluster: dict,
    bucket: int,
    broadcast_fn,
) -> Optional[dict]:
    """Generate a cluster blob GLB and broadcast ASSET_READY.

    Returns asset metadata or None on failure.
    """
    try:
        glb_path = make_cluster_blob(
            entity_ids=cluster["entity_ids"],
            risk_score=cluster["risk_score"],
            cluster_id=cluster["cluster_id"],
        )
        asset_info = _asset_metadata(glb_path, cluster["cluster_id"], "cluster_blob", bucket)

        await broadcast_fn("ASSET_READY", asset_info)
        log.info(f"Asset ready: {asset_info['asset_id']}")
        return asset_info

    except Exception as e:
        log.error(f"Failed to generate cluster blob: {e}")
        # Emit fallback event so frontend can render procedurally
        await broadcast_fn("ASSET_FALLBACK", {
            "asset_id": cluster["cluster_id"],
            "asset_type": "cluster_blob",
            "bucket": bucket,
            "entity_ids": cluster["entity_ids"],
            "risk_score": cluster["risk_score"],
        })
        return None


async def handle_beacon_asset(
    entity_id: str,
    risk_score: float,
    bucket: int,
    broadcast_fn,
) -> Optional[dict]:
    """Generate a beacon GLB and broadcast ASSET_READY."""
    try:
        glb_path = make_beacon(entity_id=entity_id, risk_score=risk_score)
        asset_info = _asset_metadata(glb_path, f"beacon_{entity_id}", "beacon", bucket)

        await broadcast_fn("ASSET_READY", asset_info)
        log.info(f"Beacon ready: {asset_info['asset_id']}")
        return asset_info

    except Exception as e:
        log.error(f"Failed to generate beacon: {e}")
        await broadcast_fn("ASSET_FALLBACK", {
            "asset_id": f"beacon_{entity_id}",
            "asset_type": "beacon",
            "bucket": bucket,
            "entity_id": entity_id,
            "risk_score": risk_score,
        })
        return None


def _asset_metadata(glb_path: Path, asset_id: str, asset_type: str, bucket: int) -> dict:
    return {
        "asset_id": asset_id,
        "asset_type": asset_type,
        "bucket": bucket,
        "url": f"/api/assets/{glb_path.name}",
        "size_bytes": glb_path.stat().st_size,
    }
