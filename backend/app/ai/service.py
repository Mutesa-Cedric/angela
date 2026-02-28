"""AI service wrapper using OpenAI-compatible API."""

import logging
import os
from functools import lru_cache

import openai

from .prompts import SYSTEM_PROMPT, build_entity_prompt, build_cluster_prompt

log = logging.getLogger(__name__)

MODEL = os.getenv("ANGELA_AI_MODEL", "gpt-4o-mini")
BASE_URL = os.getenv("ANGELA_AI_BASE_URL", "https://api.openai.com/v1")
MAX_TOKENS = 200
TIMEOUT = 8.0

_client: openai.OpenAI | None = None


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        _client = openai.OpenAI(
            api_key=api_key,
            base_url=BASE_URL,
            timeout=TIMEOUT,
        )
    return _client


def _call_llm(user_prompt: str) -> str:
    """Call the LLM and return the text response."""
    client = _get_client()
    try:
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        log.warning(f"AI call failed: {e}")
        return "AI summary temporarily unavailable."


# Cache by (entity_id, bucket) — LRU for hackathon
@lru_cache(maxsize=256)
def generate_entity_summary(
    entity_id: str,
    risk_score: float,
    reasons_key: str,  # JSON string for cache key
    evidence_key: str,  # JSON string for cache key
    activity_key: str,  # JSON string for cache key
    bucket: int,
) -> str:
    import json
    reasons = json.loads(reasons_key)
    evidence = json.loads(evidence_key)
    activity = json.loads(activity_key) if activity_key != "null" else None

    prompt = build_entity_prompt(entity_id, risk_score, reasons, evidence, activity, bucket)
    return _call_llm(prompt)


@lru_cache(maxsize=64)
def generate_cluster_summary(
    cluster_id: str,
    entity_ids_key: str,
    risk_score: float,
    size: int,
    bucket: int,
) -> str:
    import json
    entity_ids = json.loads(entity_ids_key)

    prompt = build_cluster_prompt(cluster_id, entity_ids, risk_score, size, bucket)
    return _call_llm(prompt)
