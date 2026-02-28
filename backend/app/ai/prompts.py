"""Prompt templates for AI copilot. Grounded — no speculation allowed."""

from __future__ import annotations

from typing import Optional

SYSTEM_PROMPT = (
    "You are an AML compliance investigation assistant for the ANGELA platform. "
    "You analyze structured risk signals and produce clear, concise summaries "
    "for human investigators. Rules:\n"
    "1. Use ONLY the data provided — never invent numbers or facts.\n"
    "2. Keep summaries to exactly 3 sentences.\n"
    "3. Use professional compliance language.\n"
    "4. Lead with a clear priority call (Low, Moderate, High).\n"
    "5. If risk is low, say so clearly.\n"
    "6. Reference specific metrics (counts, amounts, thresholds) from the evidence.\n"
    "7. Translate detector jargon into plain language once when helpful (e.g., structuring = splitting transactions near reporting limits)."
)


def build_entity_prompt(
    entity_id: str,
    risk_score: float,
    reasons: list[dict],
    evidence: dict,
    activity: Optional[dict],
    bucket: int,
) -> str:
    if risk_score >= 0.75:
        priority = "High"
    elif risk_score >= 0.45:
        priority = "Moderate"
    else:
        priority = "Low"

    lines = [
        f"Prepare an investigator-facing risk brief for entity `{entity_id}` in time bucket {bucket}.",
        f"",
        f"Risk score: {risk_score:.2f} / 1.00 ({priority} priority)",
    ]

    if reasons:
        lines.append("Risk signals (sorted by contribution weight):")
        for r in sorted(reasons, key=lambda item: float(item.get("weight", 0.0)), reverse=True):
            detector = str(r.get("detector", "unknown"))
            detail = str(r.get("detail", ""))
            weight = float(r.get("weight", 0.0))
            lines.append(f"  - {detector}: {detail} (weight: {weight:.2f})")
    else:
        lines.append("No risk signals detected.")

    evidence = evidence or {}
    lines.append("Quantitative evidence:")

    velocity = evidence.get("velocity")
    if velocity:
        tx_count = int(velocity.get("tx_count", 0))
        tx_per_min = float(velocity.get("tx_per_minute", 0.0))
        p95 = float(velocity.get("population_p95", 0.0))
        lines.append(
            f"  - velocity: {tx_count} tx at {tx_per_min:.2f} tx/min "
            f"(population p95: {p95:.2f})"
        )

    structuring = evidence.get("structuring")
    if structuring:
        near_count = int(structuring.get("near_threshold_count", 0))
        threshold = float(structuring.get("threshold", 0.0))
        delta = float(structuring.get("delta", 0.0))
        lines.append(
            f"  - structuring: {near_count} near-threshold tx around "
            f"${threshold:,.0f} +/- ${delta:,.0f}"
        )

    circular = evidence.get("circular_flow")
    if circular:
        cycle_count = int(circular.get("cycle_count", 0))
        shortest = int(circular.get("shortest_cycle_length", 0))
        counterparties = len(circular.get("counterparties", []))
        lines.append(
            f"  - circular_flow: {cycle_count} cycle(s), shortest path {shortest}, "
            f"{counterparties} counterparties involved"
        )

    flagged = evidence.get("flagged_tx_ids") or []
    if flagged:
        lines.append(f"  - flagged transactions: {len(flagged)}")

    if not velocity and not structuring and not circular and not flagged:
        lines.append("  - no structured quantitative evidence fields present")

    if activity:
        inbound_count = int(activity.get("in_count", 0))
        outbound_count = int(activity.get("out_count", 0))
        inbound_sum = float(activity.get("in_sum", 0.0))
        outbound_sum = float(activity.get("out_sum", 0.0))
        net_flow = inbound_sum - outbound_sum
        lines.append(
            f"Activity in bucket: in={inbound_count} tx (${inbound_sum:,.2f}), "
            f"out={outbound_count} tx (${outbound_sum:,.2f}), net=${net_flow:,.2f}"
        )

    lines.append("")
    lines.append("Write exactly 3 sentences for a first-time investigator:")
    lines.append("1) Priority call and why this entity matters now.")
    lines.append("2) The 2-3 strongest quantified risk indicators.")
    lines.append("3) Concrete next analyst check grounded in provided data only.")
    lines.append("If risk is below 0.20 and evidence is weak, explicitly state low concern in this window.")

    return "\n".join(lines)


def build_cluster_prompt(
    cluster_id: str,
    entity_ids: list[str],
    risk_score: float,
    size: int,
    bucket: int,
) -> str:
    member_preview = ", ".join(entity_ids[:5])
    if len(entity_ids) > 5:
        member_preview += f" (+{len(entity_ids) - 5} more)"

    return (
        f"Summarize cluster `{cluster_id}` detected in time bucket {bucket}.\n\n"
        f"Cluster size: {size} entities\n"
        f"Average risk score: {risk_score:.2f} / 1.00\n"
        f"Members: {member_preview}\n\n"
        "Write exactly 3 sentences:\n"
        "1) Priority and why this cluster matters.\n"
        "2) Most important quantitative indicators.\n"
        "3) Recommended analyst follow-up checks."
    )
