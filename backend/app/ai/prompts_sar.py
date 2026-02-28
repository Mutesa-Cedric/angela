"""FinCEN-style SAR narrative prompt templates."""

from __future__ import annotations

from typing import Optional

SAR_SYSTEM_PROMPT = (
    "You are a Suspicious Activity Report (SAR) narrative writer for the ANGELA AML platform. "
    "You generate formal, FinCEN-style SAR narratives suitable for regulatory filing. Rules:\n"
    "1. Use ONLY the data provided — never fabricate facts, amounts, or entity details.\n"
    "2. Use formal compliance language consistent with FinCEN SAR filing standards.\n"
    "3. Prioritize material facts: who, what, when, how much, and why activity appears suspicious.\n"
    "4. Reference specific metrics, amounts, and patterns from the evidence.\n"
    "5. Include the time window and entity identifiers.\n"
    "6. Explain technical terms once in plain language for first-time reviewers.\n"
    "7. If risk is genuinely low, state that no suspicious activity was identified.\n"
    "8. Use markdown output with clear section headings and concise bullet points where useful.\n"
    "9. Wrap all entity identifiers in backticks, for example `070_100428660`."
)


def _detector_label(detector: str) -> str:
    mapping = {
        "velocity": "Velocity Burst",
        "structuring": "Threshold Splitting (Structuring)",
        "circular_flow": "Circular Layering",
    }
    return mapping.get(detector, detector.replace("_", " ").title())


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
    reasons = payload.get("reasons", [])
    if reasons:
        lines.append("Top Risk Signals (highest contribution first):")
        ordered = sorted(reasons, key=lambda item: float(item.get("weight", 0.0)), reverse=True)
        for r in ordered:
            detector = str(r.get("detector", "unknown"))
            lines.append(
                f"  - {_detector_label(detector)}: {r.get('detail', '')} "
                f"(weight: {float(r.get('weight', 0.0)):.2f})"
            )
    else:
        lines.append("No automated risk signals detected.")

    # Evidence details
    ev = payload.get("evidence", {})
    key_facts = []
    if ev.get("velocity"):
        v = ev["velocity"]
        p95 = float(v.get("population_p95", 0.0))
        tx_per_min = float(v.get("tx_per_minute", 0.0))
        rate_multiple = (tx_per_min / p95) if p95 > 0 else 0.0
        lines.append(
            f"\nVelocity Burst Evidence: {v.get('tx_count', 0)} transactions, "
            f"{tx_per_min:.2f} tx/min "
            f"(population median: {float(v.get('population_median', 0.0)):.1f}, "
            f"p95: {p95:.1f})"
        )
        if rate_multiple > 0:
            key_facts.append(f"Transaction velocity is {rate_multiple:.2f}x above the p95 baseline.")
    if ev.get("structuring"):
        s = ev["structuring"]
        lines.append(
            f"\nThreshold Splitting Evidence: {s.get('near_threshold_count', 0)} transactions "
            f"near ${float(s.get('threshold', 10000)):,.0f} threshold "
            f"(delta range: +/- ${float(s.get('delta', 0)):,.0f})"
        )
        key_facts.append(
            f"{int(s.get('near_threshold_count', 0))} transactions were clustered around the reporting threshold."
        )
    if ev.get("circular_flow"):
        c = ev["circular_flow"]
        counterparties = c.get("counterparties", [])[:5]
        lines.append(
            f"\nCircular Layering Evidence: {c.get('cycle_count', 0)} cycle(s) detected, "
            f"shortest length: {c.get('shortest_cycle_length', 0)} hops, "
            f"counterparties: {', '.join([f'`{x}`' for x in counterparties])}"
        )
        key_facts.append(
            f"{int(c.get('cycle_count', 0))} circular pattern(s) were identified with shortest cycle length "
            f"{int(c.get('shortest_cycle_length', 0))}."
        )

    # Activity
    act = payload["activity"]
    if act:
        inbound_sum = float(act.get("in_sum", 0.0))
        outbound_sum = float(act.get("out_sum", 0.0))
        net_flow = inbound_sum - outbound_sum
        lines.append(
            f"\nTransaction Activity: "
            f"Inbound: {act.get('in_count', 0)} tx (${inbound_sum:,.2f}), "
            f"Outbound: {act.get('out_count', 0)} tx (${outbound_sum:,.2f}), "
            f"Net: ${net_flow:,.2f}"
        )
        key_facts.append(
            f"Observed net flow in this window is ${net_flow:,.2f} "
            f"(inbound ${inbound_sum:,.2f} vs outbound ${outbound_sum:,.2f})."
        )

    # Connected entities
    connected = payload.get("connected_entities", [])
    if connected:
        lines.append(f"\nConnected Entities ({len(connected)}):")
        for ce in connected[:5]:
            lines.append(f"  - `{ce['id']}` (risk: {ce.get('risk_score', 0):.2f})")
        high_risk_connected = [ce for ce in connected if float(ce.get("risk_score", 0.0)) >= 0.60]
        if high_risk_connected:
            key_facts.append(
                f"{len(high_risk_connected)} connected entity(ies) have elevated risk (>=0.60)."
            )

    if key_facts:
        lines.append("\nCritical Facts To Mention:")
        for fact in key_facts[:6]:
            lines.append(f"  - {fact}")

    lines.append("")
    lines.append(
        "Write a formal SAR narrative in markdown with these sections:\n"
        "## Summary\n"
        "## Why Activity Appears Suspicious\n"
        "## Supporting Quantitative Evidence\n"
        "## Customer and Network Context\n"
        "## Recommendation\n\n"
        "Requirements:\n"
        "- Prioritize the most material risk drivers in the first paragraph.\n"
        "- Explain detector jargon once in plain language (velocity burst, threshold splitting/structuring, circular layering).\n"
        "- Include at least five concrete quantitative facts when available.\n"
        "- Keep tone factual and non-speculative; do not infer criminal intent.\n"
        "- If evidence is weak or risk is low, explicitly state that and recommend monitoring.\n"
        "- Target 280-520 words."
    )

    return "\n".join(lines)
