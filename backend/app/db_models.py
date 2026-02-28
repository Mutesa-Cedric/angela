"""SQLAlchemy ORM models for case persistence and SAR filings."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="open"
    )
    input_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    sar_filings: Mapped[list[SARFiling]] = relationship(
        back_populates="case", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_cases_status", "status"),
        Index("ix_cases_created_at", "created_at"),
    )


class SARFiling(Base):
    """Stores a complete FinCEN SAR or HK JFIU STR filing."""

    __tablename__ = "sar_filings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[str] = mapped_column(String(255), nullable=False)
    bucket: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft"
    )
    report_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="fincen_sar"
    )

    # FinCEN filing info
    filing_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="initial"
    )
    prior_report_bsa_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Part I  - Subject information (JSON blob matching SARSubject schema)
    subject: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Part III - Financial institution where activity occurred
    financial_institution: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    # Part III - Filing institution (may differ from where activity occurred)
    filing_institution: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    # Part IV - Filing institution contact
    filing_contact: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    # Part II - Suspicious activity details
    suspicious_activity: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    # HK STR-specific fields (Part A reporting institution, Part D grounds)
    reporting_institution: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    grounds_for_suspicion: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    additional_info: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    # Part V - Narrative
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    narrative_payload: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    # Generated XML output (FinCEN SAR or HK STR)
    fincen_xml: Mapped[str | None] = mapped_column(Text, nullable=True)
    str_xml: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Auto-populated risk context from analysis engine
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_evidence: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    case: Mapped[Case] = relationship(back_populates="sar_filings")

    __table_args__ = (
        Index("ix_sar_filings_case_id", "case_id"),
        Index("ix_sar_filings_entity_id", "entity_id"),
        Index("ix_sar_filings_status", "status"),
        Index("ix_sar_filings_report_type", "report_type"),
    )
