"""Prompt templates for AI copilot. Grounded — no speculation allowed."""

from __future__ import annotations

from typing import Optional

SYSTEM_PROMPT = (
    "You are an AML compliance investigation assistant for the ANGELA platform. "
    "You analyze structured risk signals and produce clear, concise summaries "
    "for human investigators. Rules:\n"
    "1. Use ONLY the data provided — never invent numbers or facts.\n"
    "2. Keep summaries to 2-3 sentences maximum.\n"
    "3. Use professional compliance language.\n"
    "4. If risk is low, say so clearly.\n"
    "5. Reference specific metrics (counts, amounts, thresholds) from the evidence."
)


def build_entity_prompt(
    entity_id: str,
    risk_score: float,
    reasons: list[dict],
    evidence: dict,
    activity: Optional[dict],
    bucket: int,
) -> str:
    lines = [
        f"Summarize the risk assessment for entity {entity_id} in time bucket {bucket}.",
        f"",
        f"Risk score: {risk_score:.2f} (scale 0-1)",
    ]

    if reasons:
        lines.append("Risk signals:")
        for r in reasons:
            lines.append(f"  - {r['detector']}: {r['detail']} (weight: {r['weight']})")
    else:
        lines.append("No risk signals detected.")

    if evidence:
        lines.append(f"Evidence: {evidence}")

    if activity:
        lines.append(
            f"Activity in bucket: "
            f"in={activity.get('in_count', 0)} tx (${activity.get('in_sum', 0):,.2f}), "
            f"out={activity.get('out_count', 0)} tx (${activity.get('out_sum', 0):,.2f})"
        )

    lines.append("")
    lines.append("Provide a 2-3 sentence summary for an investigator.")

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
        f"Summarize the risk cluster {cluster_id} detected in time bucket {bucket}.\n\n"
        f"Cluster size: {size} entities\n"
        f"Average risk score: {risk_score:.2f}\n"
        f"Members: {member_preview}\n\n"
        f"Provide a 2-3 sentence summary for an investigator."
    )
