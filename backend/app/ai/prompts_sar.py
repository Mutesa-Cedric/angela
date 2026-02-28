"""FinCEN-style SAR narrative prompt templates."""

from __future__ import annotations

from typing import Optional

SAR_SYSTEM_PROMPT = (
    "You are a Suspicious Activity Report (SAR) narrative writer for the ANGELA AML platform. "
    "You generate formal, FinCEN-style SAR narratives suitable for regulatory filing. Rules:\n"
    "1. Use ONLY the data provided — never fabricate facts, amounts, or entity details.\n"
    "2. Use formal compliance language consistent with FinCEN SAR filing standards.\n"
    "3. Structure the narrative with clear paragraphs: summary, suspicious activity, "
    "supporting evidence, and recommendation.\n"
    "4. Reference specific metrics, amounts, and patterns from the evidence.\n"
    "5. Include the time window and entity identifiers.\n"
    "6. If risk is genuinely low, state that no suspicious activity was identified.\n"
    "7. Do NOT use markdown formatting — output plain text paragraphs only."
)


def build_sar_payload(
    entity_id: str,
    entity_type: str,
    bank: str,
    jurisdiction_bucket: int,
    risk_score: float,
    reasons: list[dict],
    evidence: dict,
    activity: Optional[dict],
    connected_entities: list[dict],
    bucket: int,
    bucket_size_seconds: int,
) -> dict:
    """Assemble the full SAR data payload for LLM consumption."""
    return {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "bank": bank,
        "jurisdiction_bucket": jurisdiction_bucket,
        "risk_score": risk_score,
        "reasons": reasons,
        "evidence": evidence,
        "activity": activity,
        "connected_entities": connected_entities[:10],
        "time_window": {
            "bucket": bucket,
            "duration_seconds": bucket_size_seconds,
        },
    }


def build_sar_prompt(payload: dict) -> str:
    """Build the LLM prompt from the assembled SAR payload."""
    lines = [
        "Generate a FinCEN-style Suspicious Activity Report (SAR) narrative for the following subject.",
        "",
        f"Subject ID: {payload['entity_id']}",
        f"Entity Type: {payload['entity_type']}",
        f"Financial Institution: {payload['bank']}",
        f"Jurisdiction Bucket: {payload['jurisdiction_bucket']}",
        f"Observation Period: Time Window {payload['time_window']['bucket']} "
        f"({payload['time_window']['duration_seconds']}s duration)",
        f"Risk Score: {payload['risk_score']:.2f} / 1.00",
        "",
    ]

    # Risk signals
    if payload["reasons"]:
        lines.append("Risk Signals Detected:")
        for r in payload["reasons"]:
            lines.append(f"  - {r['detector']}: {r['detail']} (weight: {r['weight']:.2f})")
    else:
        lines.append("No automated risk signals detected.")

    # Evidence details
    ev = payload["evidence"]
    if ev.get("velocity"):
        v = ev["velocity"]
        lines.append(
            f"\nVelocity Evidence: {v.get('tx_count', 0)} transactions, "
            f"{v.get('tx_per_minute', 0):.2f} tx/min "
            f"(population median: {v.get('population_median', 0):.1f}, "
            f"p95: {v.get('population_p95', 0):.1f})"
        )
    if ev.get("structuring"):
        s = ev["structuring"]
        lines.append(
            f"\nStructuring Evidence: {s.get('near_threshold_count', 0)} transactions "
            f"near ${s.get('threshold', 10000):,.0f} threshold "
            f"(delta range: ${s.get('delta', 0):,.0f})"
        )
    if ev.get("circular_flow"):
        c = ev["circular_flow"]
        lines.append(
            f"\nCircular Flow Evidence: {c.get('cycle_count', 0)} cycle(s) detected, "
            f"shortest length: {c.get('shortest_cycle_length', 0)} hops, "
            f"counterparties: {', '.join(c.get('counterparties', [])[:5])}"
        )

    # Activity
    act = payload["activity"]
    if act:
        lines.append(
            f"\nTransaction Activity: "
            f"Inbound: {act.get('in_count', 0)} tx (${act.get('in_sum', 0):,.2f}), "
            f"Outbound: {act.get('out_count', 0)} tx (${act.get('out_sum', 0):,.2f})"
        )

    # Connected entities
    connected = payload.get("connected_entities", [])
    if connected:
        lines.append(f"\nConnected Entities ({len(connected)}):")
        for ce in connected[:5]:
            lines.append(f"  - {ce['id']} (risk: {ce.get('risk_score', 0):.2f})")

    lines.append("")
    lines.append(
        "Write a formal SAR narrative with these sections:\n"
        "1. Summary (1-2 sentences identifying the subject and nature of suspicion)\n"
        "2. Suspicious Activity Description (detailed account of patterns and behaviors)\n"
        "3. Supporting Evidence (specific metrics and data points)\n"
        "4. Recommendation (suggested next steps for investigation)\n\n"
        "Use approximately 200-400 words total. Use plain text only, no markdown."
    )

    return "\n".join(lines)
