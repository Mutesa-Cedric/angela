from __future__ import annotations

from typing import Any, Dict

from ..nlq import parse_query


class IntakeAgent:
    name = "intake"

    async def run(self, query: str, bucket: int) -> Dict[str, Any]:
        parsed = parse_query(query)
        return {
            "query": query,
            "bucket": bucket,
            "intent": parsed.get("intent", "SHOW_HIGH_RISK"),
            "params": parsed.get("params", {}),
            "interpretation": parsed.get("interpretation", ""),
        }

