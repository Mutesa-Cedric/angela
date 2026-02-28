from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Dict, List

from ..ai.service import generate_entity_summary

ANALYSIS_PARALLELISM = max(1, int(os.getenv("ANGELA_AGENT_ANALYSIS_PARALLELISM", "4")))


class AnalysisAgent:
    name = "analysis"

    async def run(
        self,
        bucket: int,
        profiles: List[Dict[str, Any]],
        max_llm_summaries: int = 3,
    ) -> Dict[str, Any]:
        if not profiles:
            return {
                "top_entity_id": None,
                "average_risk": 0.0,
                "high_risk_count": 0,
                "detector_counts": {},
                "highlights": [],
            }

        ranked = sorted(profiles, key=lambda p: p.get("risk_score", 0.0), reverse=True)
        detector_counts: Dict[str, int] = {}
        highlights: List[Dict[str, Any]] = []
        summary_map: Dict[str, str] = {}

        llm_targets = ranked[: max(0, max_llm_summaries)]
        if llm_targets:
            semaphore = asyncio.Semaphore(ANALYSIS_PARALLELISM)

            async def summarize_profile(profile: Dict[str, Any]) -> str:
                reasons = profile.get("reasons", [])
                async with semaphore:
                    return await asyncio.to_thread(
                        generate_entity_summary,
                        entity_id=profile["entity_id"],
                        risk_score=profile.get("risk_score", 0.0),
                        reasons_key=json.dumps(reasons, sort_keys=True, default=str),
                        evidence_key=json.dumps(profile.get("evidence", {}), sort_keys=True, default=str),
                        activity_key=(
                            json.dumps(profile.get("activity"), sort_keys=True, default=str)
                            if profile.get("activity")
                            else "null"
                        ),
                        bucket=bucket,
                    )

            summary_results = await asyncio.gather(
                *(summarize_profile(profile) for profile in llm_targets),
                return_exceptions=True,
            )
            for profile, summary in zip(llm_targets, summary_results):
                if isinstance(summary, Exception):
                    summary_map[profile["entity_id"]] = ""
                else:
                    summary_map[profile["entity_id"]] = summary or ""

        for profile in ranked:
            reasons = profile.get("reasons", [])
            for reason in reasons:
                detector = reason.get("detector", "unknown")
                detector_counts[detector] = detector_counts.get(detector, 0) + 1

            summary = summary_map.get(profile["entity_id"], "")

            highlights.append({
                "entity_id": profile["entity_id"],
                "risk_score": profile.get("risk_score", 0.0),
                "top_reason": reasons[0]["detail"] if reasons else "No risk signals",
                "detectors": [r.get("detector", "unknown") for r in reasons],
                "activity": profile.get("activity"),
                "summary": summary,
            })

        avg_risk = sum(p.get("risk_score", 0.0) for p in ranked) / len(ranked)
        high_risk_count = sum(1 for p in ranked if p.get("risk_score", 0.0) >= 0.6)

        return {
            "top_entity_id": ranked[0]["entity_id"],
            "average_risk": round(avg_risk, 4),
            "high_risk_count": high_risk_count,
            "detector_counts": detector_counts,
            "highlights": highlights,
        }

