from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AgentInvestigateRequest(BaseModel):
    """Input contract for a supervisor-driven investigation run."""

    query: str = Field(..., min_length=1, description="Natural language investigation query")
    bucket: int = Field(..., ge=0, description="Time bucket index")
    include_sar: bool = Field(
        default=False,
        description="Generate SAR narrative for the top-risk entity in the run",
    )
    max_targets: int = Field(
        default=5,
        ge=1,
        le=15,
        description="Maximum entities to carry through analysis/reporting",
    )
    profile: Literal["fast", "balanced", "deep"] = Field(
        default="balanced",
        description="Investigation depth/latency profile",
    )

