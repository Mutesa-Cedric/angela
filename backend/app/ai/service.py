"""AI service wrapper with pluggable providers.

Supports:
- OpenAI-compatible endpoints (default)
- Native AWS Bedrock Runtime via boto3
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from threading import Lock
from typing import Any, Optional

import openai

from .prompts import SYSTEM_PROMPT, build_entity_prompt, build_cluster_prompt
from .prompts_sar import SAR_SYSTEM_PROMPT, build_sar_prompt

log = logging.getLogger(__name__)

PROVIDER = os.getenv("ANGELA_AI_PROVIDER", "openai_compat").strip().lower()
MODEL = os.getenv("ANGELA_AI_MODEL", "gpt-5-mini")
BASE_URL = os.getenv("ANGELA_AI_BASE_URL", "https://api.openai.com/v1")
AWS_REGION = os.getenv("AWS_REGION", os.getenv("ANGELA_AWS_REGION", "us-east-1"))
MAX_TOKENS = 200
SAR_MAX_TOKENS = int(os.getenv("ANGELA_AI_SAR_MAX_TOKENS", "1200"))
TIMEOUT = float(os.getenv("ANGELA_AI_TIMEOUT", "45.0"))

_openai_client: Optional[openai.OpenAI] = None
_bedrock_client: Any = None
_sar_cache_lock = Lock()
_sar_narrative_cache: dict[str, str] = {}


def _get_openai_client() -> openai.OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("ANGELA_AI_API_KEY") or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("ANGELA_AI_API_KEY/OPENAI_API_KEY not set")
        _openai_client = openai.OpenAI(
            api_key=api_key,
            base_url=BASE_URL,
            timeout=TIMEOUT,
        )
    return _openai_client


def _get_bedrock_client() -> Any:
    global _bedrock_client
    if _bedrock_client is None:
        try:
            import boto3
        except Exception as exc:
            raise RuntimeError(
                "boto3 is required for ANGELA_AI_PROVIDER=bedrock_native. "
                "Install with: pip install boto3"
            ) from exc
        _bedrock_client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
    return _bedrock_client


def _extract_openai_chat_text(response: Any) -> str:
    """Extract assistant text from OpenAI-compatible chat completion response."""
    if not getattr(response, "choices", None):
        return ""
    message = response.choices[0].message
    content = message.content

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            text: Optional[str] = None
            if isinstance(block, dict):
                text = block.get("text")
            else:
                text = getattr(block, "text", None)
            if isinstance(text, str) and text:
                parts.append(text)
        return "".join(parts).strip()

    return ""


def _call_openai_compat(user_prompt: str, system_prompt: str, max_tokens: int) -> str:
    client = _get_openai_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        timeout=TIMEOUT,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    text = _extract_openai_chat_text(response)
    if text:
        return text

    # Some reasoning-enabled models may spend all budget on internal reasoning
    # and return no assistant text when finish_reason is "length".
    finish_reason = response.choices[0].finish_reason if response.choices else None
    if finish_reason == "length":
        retry_tokens = max(max_tokens * 3, 600)
        retry = client.chat.completions.create(
            model=MODEL,
            max_tokens=retry_tokens,
            timeout=TIMEOUT,
            messages=[
                {"role": "system", "content": f"{system_prompt}\nRespond with final answer only."},
                {"role": "user", "content": user_prompt},
            ],
        )
        retry_text = _extract_openai_chat_text(retry)
        if retry_text:
            return retry_text

    log.warning(
        f"OpenAI-compatible model returned empty content (model={MODEL}, finish_reason={finish_reason})"
    )
    return ""


def _call_bedrock_native(user_prompt: str, system_prompt: str, max_tokens: int) -> str:
    client = _get_bedrock_client()
    response = client.converse(
        modelId=MODEL,
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_prompt}]}],
        inferenceConfig={"maxTokens": max_tokens},
    )

    content = response.get("output", {}).get("message", {}).get("content", [])
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict):
            text = block.get("text")
            if isinstance(text, str) and text:
                parts.append(text)
    return "".join(parts)


def _call_llm(user_prompt: str, system_prompt: str = SYSTEM_PROMPT, max_tokens: int = MAX_TOKENS) -> str:
    """Call the LLM and return the text response."""
    try:
        if PROVIDER == "bedrock_native":
            return _call_bedrock_native(user_prompt, system_prompt, max_tokens)
        if PROVIDER != "openai_compat":
            log.warning(f"Unknown ANGELA_AI_PROVIDER '{PROVIDER}', falling back to openai_compat")
        return _call_openai_compat(user_prompt, system_prompt, max_tokens)
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


def generate_sar_narrative(
    entity_id: str,
    payload_key: str,  # JSON string for cache key
) -> str:
    cache_key = f"{entity_id}:{payload_key}"
    with _sar_cache_lock:
        cached = _sar_narrative_cache.get(cache_key)
    if cached:
        return cached

    import json
    payload = json.loads(payload_key)
    prompt = build_sar_prompt(payload)
    narrative = _call_llm(prompt, system_prompt=SAR_SYSTEM_PROMPT, max_tokens=SAR_MAX_TOKENS)

    # Cache successful narratives to reduce repeated generation latency.
    if narrative and narrative != "AI summary temporarily unavailable.":
        with _sar_cache_lock:
            _sar_narrative_cache[cache_key] = narrative
    return narrative


def clear_ai_caches() -> None:
    """Clear all in-process AI caches.

    Called when a new dataset is loaded or warmup restarts.
    """
    generate_entity_summary.cache_clear()
    generate_cluster_summary.cache_clear()
    with _sar_cache_lock:
        _sar_narrative_cache.clear()
