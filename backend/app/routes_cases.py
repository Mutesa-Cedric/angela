"""API routes for case management and FinCEN SAR filings.

All routes are mounted under /cases and are purely additive — they do not
modify or shadow any existing endpoints.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .ai.prompts_sar import build_sar_payload
from .ai.service import generate_sar_narrative
from .data_loader import store
from .database import get_session
from .db_models import Case, SARFiling
from .sar.models import (
    CaseCreate,
    CaseDetailOut,
    CaseOut,
    CaseUpdate,
    SARFilingCreate,
    SARFilingOut,
    SARFilingUpdate,
    SARSubject,
    SARSuspiciousActivity,
    SARFinancialInstitution,
    SARFilingContact,
    SARValidationResult,
)
from .sar.xml_generator import generate_fincen_xml, validate_for_xml

log = logging.getLogger(__name__)

router = APIRouter(prefix="/cases", tags=["cases"])


# ---------------------------------------------------------------------------
# Reference data (must be before /{case_id} routes to avoid UUID parsing)
# ---------------------------------------------------------------------------

@router.get("/reference/activity-types", include_in_schema=True)
async def get_activity_type_codes() -> dict:
    """Return FinCEN suspicious activity subtype codes and labels."""
    from .sar.models import ACTIVITY_SUBTYPE_LABELS
    return {"activity_types": ACTIVITY_SUBTYPE_LABELS}


@router.get("/reference/instrument-types", include_in_schema=True)
async def get_instrument_type_codes() -> dict:
    from .sar.models import INSTRUMENT_TYPE_LABELS
    return {"instrument_types": INSTRUMENT_TYPE_LABELS}


@router.get("/reference/product-types", include_in_schema=True)
async def get_product_type_codes() -> dict:
    from .sar.models import PRODUCT_TYPE_LABELS
    return {"product_types": PRODUCT_TYPE_LABELS}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _case_to_out(case: Case) -> CaseOut:
    input_data = case.input_data or {}
    return CaseOut(
        id=str(case.id),
        title=case.title,
        status=case.status,
        metadata=case.metadata_ or {},
        n_entities=len(input_data.get("entities", [])),
        n_transactions=len(input_data.get("transactions", [])),
        n_sar_filings=len(case.sar_filings) if case.sar_filings else 0,
        created_at=case.created_at.isoformat(),
        updated_at=case.updated_at.isoformat(),
    )


def _sar_to_out(sar: SARFiling) -> SARFilingOut:
    return SARFilingOut(
        id=str(sar.id),
        case_id=str(sar.case_id),
        entity_id=sar.entity_id,
        bucket=sar.bucket,
        status=sar.status,
        filing_type=sar.filing_type,
        prior_report_bsa_id=sar.prior_report_bsa_id,
        subject=sar.subject or {},
        financial_institution=sar.financial_institution or {},
        filing_institution=sar.filing_institution or {},
        filing_contact=sar.filing_contact or {},
        suspicious_activity=sar.suspicious_activity or {},
        narrative=sar.narrative,
        narrative_payload=sar.narrative_payload or {},
        fincen_xml=sar.fincen_xml,
        risk_score=sar.risk_score,
        risk_evidence=sar.risk_evidence or {},
        created_at=sar.created_at.isoformat(),
        updated_at=sar.updated_at.isoformat(),
    )


async def _get_case_or_404(session: AsyncSession, case_id: UUID) -> Case:
    result = await session.execute(
        select(Case).where(Case.id == case_id)
    )
    case = result.scalar_one_or_none()
    if case is None:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return case


async def _get_sar_or_404(session: AsyncSession, case_id: UUID, sar_id: UUID) -> SARFiling:
    result = await session.execute(
        select(SARFiling).where(
            SARFiling.id == sar_id,
            SARFiling.case_id == case_id,
        )
    )
    sar = result.scalar_one_or_none()
    if sar is None:
        raise HTTPException(status_code=404, detail=f"SAR filing '{sar_id}' not found in case '{case_id}'")
    return sar


# ---------------------------------------------------------------------------
# Case CRUD
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def create_case(
    body: CaseCreate,
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """Create a new investigation case with snapshot JSON input data."""
    input_data = body.input_data
    if not isinstance(input_data, dict):
        raise HTTPException(status_code=400, detail="input_data must be a JSON object")
    if "entities" not in input_data or "transactions" not in input_data:
        raise HTTPException(
            status_code=400,
            detail="input_data must contain 'entities' and 'transactions' keys",
        )

    case = Case(
        title=body.title,
        input_data=input_data,
        metadata_=body.metadata,
    )
    session.add(case)
    await session.flush()
    await session.refresh(case)

    log.info("Created case %s: %s", case.id, case.title)
    return _case_to_out(case)


@router.get("")
async def list_cases(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List investigation cases, newest first."""
    stmt = select(Case).order_by(Case.created_at.desc()).limit(limit).offset(offset)
    if status:
        stmt = stmt.where(Case.status == status)
    result = await session.execute(stmt)
    cases = result.scalars().all()
    return {"cases": [_case_to_out(c) for c in cases]}


@router.get("/{case_id}")
async def get_case(
    case_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> CaseDetailOut:
    """Get full case details including SAR filings (without raw input_data)."""
    case = await _get_case_or_404(session, case_id)
    out = _case_to_out(case)
    sar_filings = [_sar_to_out(s) for s in (case.sar_filings or [])]
    return CaseDetailOut(**out.model_dump(), sar_filings=sar_filings)


@router.patch("/{case_id}")
async def update_case(
    case_id: UUID,
    body: CaseUpdate,
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """Update case title, status, or metadata."""
    case = await _get_case_or_404(session, case_id)
    if body.title is not None:
        case.title = body.title
    if body.status is not None:
        case.status = body.status
    if body.metadata is not None:
        case.metadata_ = body.metadata
    await session.flush()
    await session.refresh(case)
    return _case_to_out(case)


@router.delete("/{case_id}", status_code=204)
async def delete_case(
    case_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a case and all associated SAR filings."""
    case = await _get_case_or_404(session, case_id)
    await session.delete(case)


@router.post("/{case_id}/load")
async def load_case_data(
    case_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Load a case's input data into the in-memory analysis store.

    After loading, existing analysis endpoints (/snapshot, /entity, /ai/sar,
    etc.) operate on this case's data.
    """
    case = await _get_case_or_404(session, case_id)
    input_data = case.input_data

    if not isinstance(input_data, dict) or "entities" not in input_data:
        raise HTTPException(status_code=400, detail="Case input_data is missing required keys")

    store.load_from_dict(input_data)

    return {
        "status": "ok",
        "case_id": str(case.id),
        "n_entities": len(store.entities),
        "n_transactions": len(store.transactions),
        "n_buckets": store.n_buckets,
    }


# ---------------------------------------------------------------------------
# SAR Filing CRUD
# ---------------------------------------------------------------------------

@router.post("/{case_id}/sar", status_code=201)
async def create_sar_filing(
    case_id: UUID,
    body: SARFilingCreate,
    session: AsyncSession = Depends(get_session),
) -> SARFilingOut:
    """Create a new SAR filing within a case.

    Optionally auto-populates risk context from the in-memory analysis store
    if the entity is loaded.
    """
    await _get_case_or_404(session, case_id)

    risk_score = None
    risk_evidence: dict = {}
    if store.is_loaded:
        entity = store.get_entity(body.entity_id)
        if entity and body.bucket < store.n_buckets:
            risk_data = store.get_entity_risk(body.bucket, body.entity_id)
            risk_score = risk_data.get("risk_score")
            risk_evidence = {
                "reasons": risk_data.get("reasons", []),
                "evidence": risk_data.get("evidence", {}),
            }

    sar = SARFiling(
        case_id=case_id,
        entity_id=body.entity_id,
        bucket=body.bucket,
        filing_type=body.filing_type.value,
        prior_report_bsa_id=body.prior_report_bsa_id,
        subject=body.subject.model_dump(mode="json"),
        financial_institution=body.financial_institution.model_dump(mode="json"),
        filing_institution=body.filing_institution.model_dump(mode="json"),
        filing_contact=body.filing_contact.model_dump(mode="json"),
        suspicious_activity=body.suspicious_activity.model_dump(mode="json"),
        narrative=body.narrative,
        risk_score=risk_score,
        risk_evidence=risk_evidence,
    )
    session.add(sar)
    await session.flush()
    await session.refresh(sar)

    log.info("Created SAR filing %s for entity %s in case %s", sar.id, sar.entity_id, case_id)
    return _sar_to_out(sar)


@router.get("/{case_id}/sar")
async def list_sar_filings(
    case_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List all SAR filings for a case."""
    await _get_case_or_404(session, case_id)
    result = await session.execute(
        select(SARFiling)
        .where(SARFiling.case_id == case_id)
        .order_by(SARFiling.created_at.desc())
    )
    filings = result.scalars().all()
    return {"filings": [_sar_to_out(f) for f in filings]}


@router.get("/{case_id}/sar/{sar_id}")
async def get_sar_filing(
    case_id: UUID,
    sar_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> SARFilingOut:
    sar = await _get_sar_or_404(session, case_id, sar_id)
    return _sar_to_out(sar)


@router.patch("/{case_id}/sar/{sar_id}")
async def update_sar_filing(
    case_id: UUID,
    sar_id: UUID,
    body: SARFilingUpdate,
    session: AsyncSession = Depends(get_session),
) -> SARFilingOut:
    """Update individual SAR filing fields.  Partial updates — only provided
    fields are overwritten."""
    sar = await _get_sar_or_404(session, case_id, sar_id)

    if body.filing_type is not None:
        sar.filing_type = body.filing_type.value
    if body.prior_report_bsa_id is not None:
        sar.prior_report_bsa_id = body.prior_report_bsa_id
    if body.status is not None:
        sar.status = body.status
    if body.subject is not None:
        sar.subject = body.subject.model_dump(mode="json")
    if body.financial_institution is not None:
        sar.financial_institution = body.financial_institution.model_dump(mode="json")
    if body.filing_institution is not None:
        sar.filing_institution = body.filing_institution.model_dump(mode="json")
    if body.filing_contact is not None:
        sar.filing_contact = body.filing_contact.model_dump(mode="json")
    if body.suspicious_activity is not None:
        sar.suspicious_activity = body.suspicious_activity.model_dump(mode="json")
    if body.narrative is not None:
        sar.narrative = body.narrative

    # Clear previously generated XML since fields changed
    sar.fincen_xml = None

    await session.flush()
    await session.refresh(sar)
    return _sar_to_out(sar)


@router.delete("/{case_id}/sar/{sar_id}", status_code=204)
async def delete_sar_filing(
    case_id: UUID,
    sar_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    sar = await _get_sar_or_404(session, case_id, sar_id)
    await session.delete(sar)


# ---------------------------------------------------------------------------
# SAR Narrative Generation
# ---------------------------------------------------------------------------

@router.post("/{case_id}/sar/{sar_id}/generate-narrative")
async def generate_narrative_for_filing(
    case_id: UUID,
    sar_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> SARFilingOut:
    """Generate an AI SAR narrative for this filing using the in-memory
    analysis store data and persist it on the filing record.

    Requires the case data to be loaded (POST /cases/{id}/load first).
    """
    sar = await _get_sar_or_404(session, case_id, sar_id)

    if not store.is_loaded:
        raise HTTPException(
            status_code=400,
            detail="No dataset loaded. Load case data first via POST /cases/{case_id}/load",
        )

    entity = store.get_entity(sar.entity_id)
    if entity is None:
        raise HTTPException(
            status_code=404,
            detail=f"Entity '{sar.entity_id}' not found in loaded dataset",
        )

    bucket = sar.bucket
    if bucket < 0 or bucket >= store.n_buckets:
        raise HTTPException(status_code=400, detail=f"Bucket {bucket} out of range")

    risk = store.get_entity_risk(bucket, sar.entity_id)
    activity = store.get_entity_activity(bucket, sar.entity_id)

    bucket_tx = store.get_bucket_transactions(bucket)
    connected_ids: set[str] = set()
    for tx in bucket_tx:
        if tx["from_id"] == sar.entity_id and tx["to_id"] != sar.entity_id:
            connected_ids.add(tx["to_id"])
        elif tx["to_id"] == sar.entity_id and tx["from_id"] != sar.entity_id:
            connected_ids.add(tx["from_id"])

    connected_entities = []
    for cid in sorted(connected_ids)[:10]:
        cr = store.get_entity_risk(bucket, cid)
        connected_entities.append({"id": cid, "risk_score": cr["risk_score"]})

    payload = build_sar_payload(
        entity_id=sar.entity_id,
        entity_type=entity.get("type", "account"),
        bank=entity.get("bank", "Unknown"),
        jurisdiction_bucket=entity["jurisdiction_bucket"],
        risk_score=risk["risk_score"],
        reasons=risk["reasons"],
        evidence=risk["evidence"],
        activity=activity,
        connected_entities=connected_entities,
        bucket=bucket,
        bucket_size_seconds=store.metadata.get("bucket_size_seconds", 86400),
    )

    narrative = await asyncio.to_thread(
        generate_sar_narrative,
        entity_id=sar.entity_id,
        payload_key=json.dumps(payload, sort_keys=True, default=str),
    )

    sar.narrative = narrative
    sar.narrative_payload = payload
    sar.risk_score = risk["risk_score"]
    sar.risk_evidence = {
        "reasons": risk["reasons"],
        "evidence": risk["evidence"],
    }

    await session.flush()
    await session.refresh(sar)

    log.info("Generated narrative for SAR %s (entity %s)", sar.id, sar.entity_id)
    return _sar_to_out(sar)


# ---------------------------------------------------------------------------
# SAR XML Generation
# ---------------------------------------------------------------------------

@router.get("/{case_id}/sar/{sar_id}/validate")
async def validate_sar_filing(
    case_id: UUID,
    sar_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> SARValidationResult:
    """Validate whether the SAR filing has sufficient data for XML generation."""
    sar = await _get_sar_or_404(session, case_id, sar_id)
    return validate_for_xml(
        subject=SARSubject(**(sar.subject or {})),
        suspicious_activity=SARSuspiciousActivity(**(sar.suspicious_activity or {})),
        financial_institution=SARFinancialInstitution(**(sar.financial_institution or {})),
        filing_institution=SARFinancialInstitution(**(sar.filing_institution or {})),
        filing_contact=SARFilingContact(**(sar.filing_contact or {})),
        narrative=sar.narrative,
    )


@router.post("/{case_id}/sar/{sar_id}/generate-xml")
async def generate_xml_for_filing(
    case_id: UUID,
    sar_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> SARFilingOut:
    """Generate FinCEN SAR XML v1.6 for BSA e-filing.

    The generated XML includes an AI-generated disclaimer header. The
    compliance officer MUST review all fields and validate through their
    institution's BSA e-filing software before submitting to FinCEN.
    """
    sar = await _get_sar_or_404(session, case_id, sar_id)

    validation = validate_for_xml(
        subject=SARSubject(**(sar.subject or {})),
        suspicious_activity=SARSuspiciousActivity(**(sar.suspicious_activity or {})),
        financial_institution=SARFinancialInstitution(**(sar.financial_institution or {})),
        filing_institution=SARFinancialInstitution(**(sar.filing_institution or {})),
        filing_contact=SARFilingContact(**(sar.filing_contact or {})),
        narrative=sar.narrative,
    )
    if not validation.ready:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "SAR filing is not ready for XML generation",
                "errors": validation.errors,
                "warnings": validation.warnings,
            },
        )

    xml_str = generate_fincen_xml(
        filing_type=sar.filing_type,
        prior_report_bsa_id=sar.prior_report_bsa_id,
        subject=sar.subject or {},
        suspicious_activity=sar.suspicious_activity or {},
        financial_institution=sar.financial_institution or {},
        filing_institution=sar.filing_institution or {},
        filing_contact=sar.filing_contact or {},
        narrative=sar.narrative,
        filing_id=str(sar.id),
    )

    sar.fincen_xml = xml_str
    sar.status = "xml_generated"

    await session.flush()
    await session.refresh(sar)

    log.info("Generated XML for SAR %s", sar.id)
    return _sar_to_out(sar)


