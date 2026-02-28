"""Complete FinCEN SAR data models covering all required BSA e-filing XML fields.

Reference: FinCEN SAR Electronic Filing Requirements, XML Schema v1.6
Sections map to the FinCEN SAR form parts:
  Part I   - Subject Information
  Part II  - Suspicious Activity Information
  Part III - Financial Institution Information
  Part IV  - Filing Institution Contact Information
  Part V   - Narrative
"""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enumerations matching FinCEN code tables
# ---------------------------------------------------------------------------

class FilingType(str, Enum):
    initial = "initial"
    correct = "correct"
    amend = "amend"
    joint = "joint"


class SubjectType(str, Enum):
    individual = "individual"
    entity = "entity"


class IDType(str, Enum):
    ssn_itin = "2"
    ein = "1"
    foreign = "9"
    unknown = "0"


class GovernmentIDType(str, Enum):
    drivers_license = "1"
    passport = "2"
    state_id = "5"
    alien_registration = "3"
    other = "999"


class PartyAccountAssociationType(str, Enum):
    account_holder = "T"
    agent = "A"
    beneficiary = "B"
    custodian = "C"
    other = "Z"


class InstitutionType(str, Enum):
    casino = "1"
    depository = "2"
    insurance = "4"
    loan_finance = "7"
    msb = "5"
    securities_futures = "3"
    housing_gse = "6"
    other = "999"


class FederalRegulator(str, Enum):
    fdic = "1"
    frb = "7"
    ncua = "2"
    occ = "3"
    sec = "4"
    cftc = "5"
    irs = "6"
    not_applicable = "9"


class InstitutionRole(str, Enum):
    filing = "filing"
    where_activity_occurred = "where_activity_occurred"
    both = "both"


# FinCEN SAR suspicious activity subtype codes (selected common AML codes)
ACTIVITY_SUBTYPE_LABELS: dict[str, str] = {
    "701": "Bribery/Gratuity",
    "702": "Check Fraud",
    "703": "Check Kiting",
    "705": "Computer Intrusion",
    "711": "Debit Card Fraud",
    "712": "Defalcation/Embezzlement",
    "713": "False Statement",
    "714": "Identity Theft",
    "717": "Mail Fraud",
    "720": "Mysterious Disappearance",
    "721": "No Apparent Economic/Business Purpose",
    "722": "Other",
    "724": "Structuring",
    "725": "Suspicious Informal Value Transfer (Hawala)",
    "726": "Suspicious Use of Multiple Accounts",
    "727": "Suspicious Use of Third-Party Accounts",
    "728": "Terrorist Financing",
    "729": "Transaction(s) Below BSA Recordkeeping Threshold",
    "730": "Transaction(s) Below CTR Threshold",
    "731": "Two or More Individuals Working Together",
    "732": "Wire Transfer Fraud",
    "733": "Account Takeover",
    "734": "ACH Fraud",
    "744": "Other Cyber Event",
    "747": "Ransomware",
    "799": "Other Suspicious Activity",
}

INSTRUMENT_TYPE_LABELS: dict[str, str] = {
    "I01": "Bank/Cashier's Check",
    "I02": "Foreign Currency",
    "I03": "Funding/Wire Transfer",
    "I04": "Money Orders",
    "I05": "Personal/Business Check",
    "I06": "Traveler's Check",
    "I07": "U.S. Currency",
    "I08": "Virtual Currency/Cryptocurrency",
    "I09": "Other",
}

PRODUCT_TYPE_LABELS: dict[str, str] = {
    "P01": "Brokerage/Securities",
    "P02": "Check Cashing",
    "P03": "Commercial Banking",
    "P04": "Consumer Banking",
    "P05": "Correspondent/Nested Banking",
    "P06": "Credit/Debit Card",
    "P08": "Electronic Banking",
    "P12": "Lending",
    "P14": "Money Services Business",
    "P16": "Prepaid Access",
    "P19": "Wire Transfer",
    "P20": "Other",
}


# ---------------------------------------------------------------------------
# Part I - Subject Information
# ---------------------------------------------------------------------------

class SARSubjectID(BaseModel):
    """Government-issued identification for a subject."""
    id_type: Optional[GovernmentIDType] = None
    id_number: Optional[str] = None
    issuing_state: Optional[str] = None
    issuing_country: Optional[str] = Field(None, max_length=2)


class SARSubjectAccount(BaseModel):
    """Account associated with a subject."""
    account_number: str
    account_type: Optional[PartyAccountAssociationType] = PartyAccountAssociationType.account_holder
    still_open: Optional[bool] = None
    date_closed: Optional[str] = Field(None, description="YYYYMMDD")


class SARSubject(BaseModel):
    """FinCEN SAR Part I - Subject Information.

    Supports both individual and entity subjects.  Up to 999 subjects may
    be associated with a single SAR filing; in practice, ANGELA attaches
    one subject per filing and lets the user add more.
    """
    subject_type: SubjectType = SubjectType.individual

    # Individual name fields
    last_name: Optional[str] = Field(None, max_length=150)
    first_name: Optional[str] = Field(None, max_length=35)
    middle_name: Optional[str] = Field(None, max_length=30)
    suffix: Optional[str] = Field(None, max_length=4)

    # Entity name
    entity_name: Optional[str] = Field(None, max_length=150)
    dba_name: Optional[str] = Field(None, max_length=150, description="Also known as / DBA")

    # Occupation / business
    occupation_or_business: Optional[str] = Field(None, max_length=50)
    naics_code: Optional[str] = Field(None, max_length=6)

    # Tax ID
    ssn_itin: Optional[str] = Field(None, max_length=9)
    ein: Optional[str] = Field(None, max_length=9)

    date_of_birth: Optional[str] = Field(None, description="YYYYMMDD format")

    # Address
    address_street: Optional[str] = Field(None, max_length=100)
    address_city: Optional[str] = Field(None, max_length=50)
    address_state: Optional[str] = Field(None, max_length=2)
    address_zip: Optional[str] = Field(None, max_length=9)
    address_country: Optional[str] = Field("US", max_length=2)

    # Contact
    phone_number: Optional[str] = Field(None, max_length=16)
    phone_extension: Optional[str] = Field(None, max_length=6)
    email: Optional[str] = Field(None, max_length=50)

    # Government IDs
    government_ids: list[SARSubjectID] = Field(default_factory=list)

    # Accounts
    accounts: list[SARSubjectAccount] = Field(default_factory=list)

    # Relationship to FI
    relationship_to_institution: Optional[str] = Field(
        None, description="accountholder | agent | employee | officer | owner | other"
    )
    relationship_other_description: Optional[str] = None
    no_amount_involved: bool = False
    amount_unknown: bool = False

    # Internal reference linking back to ANGELA entity
    angela_entity_id: Optional[str] = Field(
        None, description="ANGELA platform entity_id for cross-reference"
    )


# ---------------------------------------------------------------------------
# Part II - Suspicious Activity Information
# ---------------------------------------------------------------------------

class SARSuspiciousActivity(BaseModel):
    """FinCEN SAR Part II - Suspicious Activity Information."""

    date_range_begin: Optional[str] = Field(None, description="MMDDYYYY")
    date_range_end: Optional[str] = Field(None, description="MMDDYYYY")

    total_suspicious_amount: Optional[float] = Field(None, ge=0)
    cumulative_amount: Optional[float] = Field(None, ge=0)
    no_amount_involved: bool = False
    amount_unknown: bool = False

    activity_type_codes: list[str] = Field(
        default_factory=list,
        description="FinCEN suspicious activity subtype IDs (e.g. '724' for Structuring)",
    )
    activity_type_other_text: Optional[str] = Field(None, max_length=50)

    instrument_types: list[str] = Field(
        default_factory=list, description="Instrument codes I01-I09"
    )
    instrument_other_text: Optional[str] = None

    product_types: list[str] = Field(
        default_factory=list, description="Product codes P01-P20"
    )
    product_other_text: Optional[str] = None

    law_enforcement_contacted: bool = False
    law_enforcement_name: Optional[str] = None

    # Cyber-related fields
    ip_addresses: list[str] = Field(default_factory=list)
    cyber_event_indicators: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Part III - Financial Institution Information
# ---------------------------------------------------------------------------

class SARFinancialInstitution(BaseModel):
    """FinCEN SAR Part III - Financial Institution.

    Used for both the filing institution and the institution where activity
    occurred (may be the same).
    """
    name: Optional[str] = Field(None, max_length=150)
    tin: Optional[str] = Field(None, max_length=9)
    tin_type: Optional[IDType] = None

    id_type: Optional[str] = Field(None, description="RSSD, CRD, NIC, SEC, etc.")
    id_number: Optional[str] = None

    address_street: Optional[str] = Field(None, max_length=100)
    address_city: Optional[str] = Field(None, max_length=50)
    address_state: Optional[str] = Field(None, max_length=2)
    address_zip: Optional[str] = Field(None, max_length=9)
    address_country: Optional[str] = Field("US", max_length=2)

    institution_type: Optional[InstitutionType] = None
    institution_type_other: Optional[str] = None
    primary_federal_regulator: Optional[FederalRegulator] = None

    role: InstitutionRole = InstitutionRole.both

    # Branch where activity occurred
    branch_id: Optional[str] = None
    branch_address_street: Optional[str] = None
    branch_address_city: Optional[str] = None
    branch_address_state: Optional[str] = None
    branch_address_zip: Optional[str] = None


# ---------------------------------------------------------------------------
# Part IV - Filing Institution Contact
# ---------------------------------------------------------------------------

class SARFilingContact(BaseModel):
    """FinCEN SAR Part IV - Filing institution contact person."""
    last_name: Optional[str] = Field(None, max_length=150)
    first_name: Optional[str] = Field(None, max_length=35)
    middle_name: Optional[str] = Field(None, max_length=30)
    title: Optional[str] = Field(None, max_length=35)
    phone_number: Optional[str] = Field(None, max_length=16)
    phone_extension: Optional[str] = Field(None, max_length=6)
    date_filed: Optional[str] = Field(None, description="YYYYMMDD")


# ---------------------------------------------------------------------------
# Composite: Full SAR Filing
# ---------------------------------------------------------------------------

class SARFilingCreate(BaseModel):
    """Request body to create a new SAR filing within a case."""
    entity_id: str
    bucket: int

    filing_type: FilingType = FilingType.initial
    prior_report_bsa_id: Optional[str] = None

    subject: SARSubject = Field(default_factory=SARSubject)
    financial_institution: SARFinancialInstitution = Field(default_factory=SARFinancialInstitution)
    filing_institution: SARFinancialInstitution = Field(default_factory=SARFinancialInstitution)
    filing_contact: SARFilingContact = Field(default_factory=SARFilingContact)
    suspicious_activity: SARSuspiciousActivity = Field(default_factory=SARSuspiciousActivity)

    narrative: Optional[str] = None


class SARFilingUpdate(BaseModel):
    """Request body to patch an existing SAR filing.  All fields optional."""
    filing_type: Optional[FilingType] = None
    prior_report_bsa_id: Optional[str] = None
    status: Optional[str] = None

    subject: Optional[SARSubject] = None
    financial_institution: Optional[SARFinancialInstitution] = None
    filing_institution: Optional[SARFinancialInstitution] = None
    filing_contact: Optional[SARFilingContact] = None
    suspicious_activity: Optional[SARSuspiciousActivity] = None

    narrative: Optional[str] = None


class SARFilingOut(BaseModel):
    """Response model for a SAR filing."""
    id: str
    case_id: str
    entity_id: str
    bucket: int
    status: str

    filing_type: str
    prior_report_bsa_id: Optional[str] = None

    subject: dict
    financial_institution: dict
    filing_institution: dict
    filing_contact: dict
    suspicious_activity: dict

    narrative: Optional[str] = None
    narrative_payload: dict = Field(default_factory=dict)

    fincen_xml: Optional[str] = None

    risk_score: Optional[float] = None
    risk_evidence: dict = Field(default_factory=dict)

    created_at: str
    updated_at: str


class SARValidationResult(BaseModel):
    """Result of validating a SAR filing for XML generation readiness."""
    ready: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Case models
# ---------------------------------------------------------------------------

class CaseCreate(BaseModel):
    """Request body to create a new investigation case."""
    title: str = Field(..., min_length=1, max_length=255)
    input_data: dict = Field(..., description="Snapshot JSON with 'entities' and 'transactions'")
    metadata: dict = Field(default_factory=dict)


class CaseUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    status: Optional[Literal["open", "in_review", "filed", "closed"]] = None
    metadata: Optional[dict] = None


class CaseOut(BaseModel):
    id: str
    title: str
    status: str
    metadata: dict
    n_entities: int
    n_transactions: int
    n_sar_filings: int
    created_at: str
    updated_at: str


class CaseDetailOut(CaseOut):
    """Full case detail including the SAR filings list (but not the raw input_data)."""
    sar_filings: list[SARFilingOut] = Field(default_factory=list)
