from __future__ import annotations

import copy
import json
from collections import OrderedDict, deque
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from typing import Any, Deque, Dict, List, Optional, Tuple


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stable_json(value: Dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


class InputCacheHistoryStore:
    """In-process request cache + recent input history.

    - Cache is TTL-based + LRU bounded.
    - History is append-only with fixed max length.
    """

    def __init__(
        self,
        cache_ttl_seconds: float = 180.0,
        max_cache_entries: int = 256,
        max_history_entries: int = 300,
    ) -> None:
        self._cache_ttl_seconds = max(1.0, cache_ttl_seconds)
        self._max_cache_entries = max(1, max_cache_entries)
        self._cache: "OrderedDict[str, Tuple[float, Dict[str, Any]]]" = OrderedDict()
        self._history: Deque[Dict[str, Any]] = deque(maxlen=max(10, max_history_entries))
        self._counter = 0
        self._lock = Lock()

    def _make_key(self, namespace: str, payload: Dict[str, Any]) -> str:
        return f"{namespace}:{_stable_json(payload)}"

    def _prune_expired_locked(self, now: float) -> None:
        stale = [k for k, (expires_at, _) in self._cache.items() if expires_at <= now]
        for key in stale:
            self._cache.pop(key, None)

    def get_cached(self, namespace: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        key = self._make_key(namespace, payload)
        now = monotonic()
        with self._lock:
            self._prune_expired_locked(now)
            hit = self._cache.get(key)
            if hit is None:
                return None
            expires_at, value = hit
            if expires_at <= now:
                self._cache.pop(key, None)
                return None
            self._cache.move_to_end(key, last=True)
            return copy.deepcopy(value)

    def set_cached(self, namespace: str, payload: Dict[str, Any], value: Dict[str, Any]) -> None:
        key = self._make_key(namespace, payload)
        now = monotonic()
        expires_at = now + self._cache_ttl_seconds
        with self._lock:
            self._prune_expired_locked(now)
            self._cache[key] = (expires_at, copy.deepcopy(value))
            self._cache.move_to_end(key, last=True)
            while len(self._cache) > self._max_cache_entries:
                self._cache.popitem(last=False)

    def clear_cache(self) -> None:
        with self._lock:
            self._cache.clear()

    def clear_all(self) -> None:
        with self._lock:
            self._cache.clear()
            self._history.clear()
            self._counter = 0

    def record_input(
        self,
        kind: str,
        payload: Dict[str, Any],
        bucket: Optional[int] = None,
        cache_hit: bool = False,
        meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        query = str(payload.get("query", "")).strip()
        if len(query) > 140:
            query = f"{query[:137]}..."

        with self._lock:
            self._counter += 1
            entry: Dict[str, Any] = {
                "id": self._counter,
                "timestamp": _utc_now_iso(),
                "kind": kind,
                "bucket": bucket,
                "cache_hit": cache_hit,
                "query_preview": query,
                "input": copy.deepcopy(payload),
            }
            if meta:
                entry["meta"] = copy.deepcopy(meta)
            self._history.append(entry)

    def recent_inputs(self, limit: int = 30, kind: Optional[str] = None) -> List[Dict[str, Any]]:
        requested = max(1, limit)
        with self._lock:
            items = list(reversed(self._history))
        if kind:
            items = [item for item in items if item.get("kind") == kind]
        return [copy.deepcopy(item) for item in items[:requested]]


input_memory = InputCacheHistoryStore()

