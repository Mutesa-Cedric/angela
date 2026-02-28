from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from ..ai.prompts_sar import build_sar_payload
from ..ai.service import _call_llm, generate_sar_narrative
from ..data_loader import store


REPORTING_SYSTEM_PROMPT = (
    "You are an AML investigation reporting assistant. "
    "Generate concise, factual investigator briefings from structured run outputs. "
    "Rules: use only provided data, no speculation, plain language, clear risk prioritization, "
    "and plain text only (no markdown)."
)
REPORTING_MAX_TOKENS = int(os.getenv("ANGELA_AI_REPORT_MAX_TOKENS", "800"))


class ReportingAgent:
    name = "reporting"

    async def run(
        self,
        query: str,
        bucket: int,
        interpretation: str,
        research: Dict[str, Any],
        analysis: Dict[str, Any],
        include_sar: bool = False,
        profile: str = "balanced",
    ) -> Dict[str, Any]:
        if profile == "fast":
            narrative = _fallback_narrative(query, interpretation, research, analysis)
        else:
            prompt = _build_report_prompt(
                query=query,
                bucket=bucket,
                interpretation=interpretation,
                research=research,
                analysis=analysis,
            )
            max_tokens = REPORTING_MAX_TOKENS if profile == "deep" else min(500, REPORTING_MAX_TOKENS)
            narrative = _call_llm(
                prompt,
                system_prompt=REPORTING_SYSTEM_PROMPT,
                max_tokens=max_tokens,
            ).strip()
        if not narrative:
            narrative = _fallback_narrative(query, interpretation, research, analysis)

        sar = None
        top_entity = analysis.get("top_entity_id")
        if include_sar and top_entity:
            payload = _build_entity_sar_payload(top_entity, bucket)
            if payload is not None:
                sar = {
                    "entity_id": top_entity,
                    "payload": payload,
                    "narrative": generate_sar_narrative(
                        entity_id=top_entity,
                        payload_key=json.dumps(payload, sort_keys=True, default=str),
                    ),
                }

        return {
            "narrative": narrative,
            "sar": sar,
        }


def _build_report_prompt(
    query: str,
    bucket: int,
    interpretation: str,
    research: Dict[str, Any],
    analysis: Dict[str, Any],
) -> str:
    lines: List[str] = [
        f"User query: {query}",
        f"Time bucket: {bucket}",
        f"Intake interpretation: {interpretation}",
        "",
        f"Research summary: {research.get('summary', '')}",
        f"Total targets found: {research.get('total_targets_found', 0)}",
        f"Targets carried to analysis: {len(research.get('profiles', []))}",
        "",
        f"Average risk of selected targets: {analysis.get('average_risk', 0.0):.2f}",
        f"High-risk target count (>=0.60): {analysis.get('high_risk_count', 0)}",
        f"Detector counts: {analysis.get('detector_counts', {})}",
        "",
        "Entity highlights:",
    ]

    for item in analysis.get("highlights", [])[:5]:
        lines.extend([
            f"- {item['entity_id']}: risk={item.get('risk_score', 0.0):.2f}; "
            f"top_reason={item.get('top_reason', 'n/a')}",
            f"  summary={item.get('summary', '')}",
        ])

    lines.extend([
        "",
        "Write a concise investigation briefing with:",
        "1) Priority assessment",
        "2) Key suspicious indicators",
        "3) Recommended next actions for analyst review",
        "Use 3 short paragraphs.",
    ])

    return "\n".join(lines)


def _fallback_narrative(
    query: str,
    interpretation: str,
    research: Dict[str, Any],
    analysis: Dict[str, Any],
) -> str:
    return (
        f"Investigation query: {query}. "
        f"Interpreted as: {interpretation or 'N/A'}. "
        f"Research found {research.get('total_targets_found', 0)} targets, "
        f"with {analysis.get('high_risk_count', 0)} high-risk entities in the reviewed set. "
        "Recommend analyst review of top entities and supporting transaction evidence."
    )


def _build_entity_sar_payload(entity_id: str, bucket: int) -> Optional[Dict[str, Any]]:
    entity = store.get_entity(entity_id)
    if entity is None:
        return None

    risk = store.get_entity_risk(bucket, entity_id)
    activity = store.get_entity_activity(bucket, entity_id)
    bucket_tx = store.get_bucket_transactions(bucket)

    connected_ids: set = set()
    for tx in bucket_tx:
        if tx["from_id"] == entity_id and tx["to_id"] != entity_id:
            connected_ids.add(tx["to_id"])
        elif tx["to_id"] == entity_id and tx["from_id"] != entity_id:
            connected_ids.add(tx["from_id"])

    connected_entities = []
    for cid in sorted(connected_ids)[:10]:
        cr = store.get_entity_risk(bucket, cid)
        connected_entities.append({"id": cid, "risk_score": cr["risk_score"]})

    return build_sar_payload(
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

