from __future__ import annotations

import json
from typing import Any, Dict, List

from ..ai.service import generate_entity_summary


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

        for idx, profile in enumerate(ranked):
            reasons = profile.get("reasons", [])
            for reason in reasons:
                detector = reason.get("detector", "unknown")
                detector_counts[detector] = detector_counts.get(detector, 0) + 1

            summary = ""
            if idx < max_llm_summaries:
                summary = generate_entity_summary(
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

