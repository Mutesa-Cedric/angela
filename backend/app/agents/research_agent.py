from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from ..data_loader import store
from ..nlq import execute_intent


class ResearchAgent:
    name = "research"

    async def run(
        self,
        intent: str,
        params: Dict[str, Any],
        bucket: int,
        max_targets: int = 5,
    ) -> Dict[str, Any]:
        query_result = await asyncio.to_thread(execute_intent, intent, params, bucket)
        all_entity_ids = query_result.get("entity_ids", [])
        selected_ids = all_entity_ids[:max_targets]
        profiles = [self._build_entity_profile(entity_id, bucket) for entity_id in selected_ids]
        profiles = [p for p in profiles if p is not None]

        return {
            "intent": intent,
            "params": params,
            "summary": query_result.get("summary", ""),
            "total_targets_found": int(query_result.get("total_count", len(all_entity_ids))),
            "entity_ids": selected_ids,
            "edge_count": len(query_result.get("edges", [])),
            "edges_preview": query_result.get("edges", [])[:20],
            "profiles": profiles,
        }

    def _build_entity_profile(self, entity_id: str, bucket: int) -> Dict[str, Any]:
        entity = store.get_entity(entity_id)
        if entity is None:
            return None

        risk = store.get_entity_risk(bucket, entity_id)
        activity = store.get_entity_activity(bucket, entity_id)

        return {
            "entity_id": entity_id,
            "entity_type": entity.get("type", "account"),
            "bank": entity.get("bank", "Unknown"),
            "jurisdiction_bucket": entity.get("jurisdiction_bucket", 0),
            "kyc_level": entity.get("kyc_level", "unknown"),
            "risk_score": risk.get("risk_score", 0.0),
            "reasons": risk.get("reasons", []),
            "evidence": risk.get("evidence", {}),
            "activity": activity,
        }

