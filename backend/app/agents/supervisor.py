from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict, Optional

from .analysis_agent import AnalysisAgent
from .intake_agent import IntakeAgent
from .memory import RunMemoryStore
from .reporting_agent import ReportingAgent
from .research_agent import ResearchAgent

log = logging.getLogger(__name__)

BroadcastFn = Callable[[str, Dict[str, Any]], Awaitable[None]]


class InvestigationSupervisor:
    """Simple in-process supervisor coordinating specialist agents."""

    def __init__(self, memory: Optional[RunMemoryStore] = None) -> None:
        self.memory = memory or RunMemoryStore()
        self.intake = IntakeAgent()
        self.research = ResearchAgent()
        self.analysis = AnalysisAgent()
        self.reporting = ReportingAgent()

    async def run(
        self,
        query: str,
        bucket: int,
        include_sar: bool = False,
        max_targets: int = 5,
        profile: str = "balanced",
        broadcast_fn: Optional[BroadcastFn] = None,
    ) -> Dict[str, Any]:
        step_count = 4
        analysis_summaries = _resolve_analysis_summary_count(profile, max_targets)
        run_id = self.memory.create_run(
            query=query,
            bucket=bucket,
            config={
                "include_sar": include_sar,
                "max_targets": max_targets,
                "profile": profile,
            },
        )
        self.memory.set_total_steps(run_id, step_count)

        await _emit(
            broadcast_fn,
            "AGENT_RUN_STARTED",
            {
                "run_id": run_id,
                "query": query,
                "bucket": bucket,
                "profile": profile,
                "total_steps": step_count,
            },
        )

        try:
            intake_output = await self._run_step(
                run_id=run_id,
                agent=self.intake.name,
                detail="Parse user query into intent and params",
                broadcast_fn=broadcast_fn,
                input_data={"query": query, "bucket": bucket},
                call=self.intake.run(query=query, bucket=bucket),
            )

            research_output = await self._run_step(
                run_id=run_id,
                agent=self.research.name,
                detail="Resolve intent into ranked entities and evidence context",
                broadcast_fn=broadcast_fn,
                input_data={
                    "intent": intake_output["intent"],
                    "params": intake_output["params"],
                    "bucket": bucket,
                    "max_targets": max_targets,
                },
                call=self.research.run(
                    intent=intake_output["intent"],
                    params=intake_output["params"],
                    bucket=bucket,
                    max_targets=max_targets,
                ),
            )

            analysis_output = await self._run_step(
                run_id=run_id,
                agent=self.analysis.name,
                detail="Score and summarize top entities",
                broadcast_fn=broadcast_fn,
                input_data={"bucket": bucket, "profile_count": len(research_output.get("profiles", []))},
                call=self.analysis.run(
                    bucket=bucket,
                    profiles=research_output.get("profiles", []),
                    max_llm_summaries=analysis_summaries,
                ),
            )

            reporting_output = await self._run_step(
                run_id=run_id,
                agent=self.reporting.name,
                detail="Generate investigator briefing and optional SAR",
                broadcast_fn=broadcast_fn,
                input_data={"include_sar": include_sar},
                call=self.reporting.run(
                    query=query,
                    bucket=bucket,
                    interpretation=intake_output.get("interpretation", ""),
                    research=research_output,
                    analysis=analysis_output,
                    include_sar=include_sar,
                    profile=profile,
                ),
            )

            result = {
                "run_id": run_id,
                "status": "completed",
                "query": query,
                "bucket": bucket,
                "profile": profile,
                "intent": intake_output.get("intent", ""),
                "params": intake_output.get("params", {}),
                "interpretation": intake_output.get("interpretation", ""),
                "research": research_output,
                "analysis": analysis_output,
                "reporting": reporting_output,
            }
            self.memory.complete_run(run_id, result)

            await _emit(
                broadcast_fn,
                "AGENT_RUN_COMPLETED",
                {"run_id": run_id, "status": "completed", "profile": profile},
            )
            return result

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            self.memory.fail_run(run_id, error_msg)
            log.exception("Agent run failed: %s", error_msg)
            await _emit(
                broadcast_fn,
                "AGENT_RUN_FAILED",
                {"run_id": run_id, "status": "failed", "error": error_msg, "profile": profile},
            )
            raise

    async def _run_step(
        self,
        run_id: str,
        agent: str,
        detail: str,
        broadcast_fn: Optional[BroadcastFn],
        input_data: Optional[Dict[str, Any]],
        call: Awaitable[Dict[str, Any]],
    ) -> Dict[str, Any]:
        step_index = self.memory.start_step(run_id, agent, detail, input_data=input_data)
        await _emit(
            broadcast_fn,
            "AGENT_STEP",
            {
                "run_id": run_id,
                "step_index": step_index,
                "agent": agent,
                "detail": detail,
                "status": "running",
            },
        )

        try:
            output = await call
            self.memory.finish_step(
                run_id=run_id,
                step_index=step_index,
                status="completed",
                output=output,
            )
            self.memory.set_artifact(run_id, agent, output)
            await _emit(
                broadcast_fn,
                "AGENT_STEP",
                {
                    "run_id": run_id,
                    "step_index": step_index,
                    "agent": agent,
                    "detail": detail,
                    "status": "completed",
                },
            )
            return output
        except Exception as exc:
            self.memory.finish_step(
                run_id=run_id,
                step_index=step_index,
                status="failed",
                error=f"{type(exc).__name__}: {exc}",
            )
            await _emit(
                broadcast_fn,
                "AGENT_STEP",
                {
                    "run_id": run_id,
                    "step_index": step_index,
                    "agent": agent,
                    "detail": detail,
                    "status": "failed",
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            raise

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        return self.memory.get_run(run_id)

    def list_runs(self, limit: int = 20) -> list:
        return self.memory.list_runs(limit=limit)


async def _emit(
    broadcast_fn: Optional[BroadcastFn],
    event: str,
    payload: Dict[str, Any],
) -> None:
    if broadcast_fn is None:
        return
    try:
        await broadcast_fn(event, payload)
    except Exception:
        # Non-blocking observability: investigation flow should not fail due to WS issues.
        pass


def _resolve_analysis_summary_count(profile: str, max_targets: int) -> int:
    cap = max(1, max_targets)
    if profile == "fast":
        return min(1, cap)
    if profile == "deep":
        return min(5, cap)
    return min(3, cap)


supervisor = InvestigationSupervisor()

