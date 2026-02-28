from __future__ import annotations

import copy
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional
from uuid import uuid4


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunMemoryStore:
    """In-memory run state store for supervisor/agent execution traces."""

    def __init__(self, max_runs: int = 200) -> None:
        self._max_runs = max_runs
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._order: List[str] = []
        self._lock = Lock()

    def create_run(self, query: str, bucket: int, config: Dict[str, Any]) -> str:
        run_id = uuid4().hex
        now = _utc_now_iso()
        record: Dict[str, Any] = {
            "run_id": run_id,
            "status": "running",
            "query": query,
            "bucket": bucket,
            "config": copy.deepcopy(config),
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
            "error": None,
            "steps": [],
            "artifacts": {},
            "result": None,
        }
        with self._lock:
            self._runs[run_id] = record
            self._order.insert(0, run_id)
            self._prune_locked()
        return run_id

    def start_step(
        self,
        run_id: str,
        agent: str,
        detail: str,
        input_data: Optional[Dict[str, Any]] = None,
    ) -> int:
        with self._lock:
            run = self._runs[run_id]
            step_index = len(run["steps"])
            step = {
                "step_index": step_index,
                "agent": agent,
                "detail": detail,
                "status": "running",
                "started_at": _utc_now_iso(),
                "finished_at": None,
                "input": copy.deepcopy(input_data or {}),
                "output": None,
                "error": None,
            }
            run["steps"].append(step)
            run["updated_at"] = _utc_now_iso()
            return step_index

    def finish_step(
        self,
        run_id: str,
        step_index: int,
        status: str,
        output: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        with self._lock:
            run = self._runs[run_id]
            step = run["steps"][step_index]
            step["status"] = status
            step["output"] = copy.deepcopy(output) if output is not None else None
            step["error"] = error
            step["finished_at"] = _utc_now_iso()
            run["updated_at"] = _utc_now_iso()

    def set_artifact(self, run_id: str, key: str, value: Any) -> None:
        with self._lock:
            run = self._runs[run_id]
            run["artifacts"][key] = copy.deepcopy(value)
            run["updated_at"] = _utc_now_iso()

    def complete_run(self, run_id: str, result: Dict[str, Any]) -> None:
        with self._lock:
            run = self._runs[run_id]
            run["status"] = "completed"
            run["result"] = copy.deepcopy(result)
            run["completed_at"] = _utc_now_iso()
            run["updated_at"] = run["completed_at"]

    def fail_run(self, run_id: str, error: str) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                return
            run["status"] = "failed"
            run["error"] = error
            run["completed_at"] = _utc_now_iso()
            run["updated_at"] = run["completed_at"]

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            run = self._runs.get(run_id)
            return copy.deepcopy(run) if run is not None else None

    def list_runs(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._lock:
            ids = self._order[:limit]
            return [copy.deepcopy(self._runs[run_id]) for run_id in ids if run_id in self._runs]

    def _prune_locked(self) -> None:
        if len(self._order) <= self._max_runs:
            return
        stale_ids = self._order[self._max_runs :]
        self._order = self._order[: self._max_runs]
        for run_id in stale_ids:
            self._runs.pop(run_id, None)

