"""Hong Kong JFIU Suspicious Transaction Report (STR) data models.

Based on the JFIU STR Proforma and STREAMS 2 filing requirements.
References:
  - JFIU: https://www.jfiu.gov.hk/en/str.html
  - AMLO (Cap. 615): Anti-Money Laundering and Counter-Terrorist Financing Ordinance
  - HKMA AML/CFT Guideline (Guideline on AML/CFT, March 2018 rev.)
  - IA Guideline on AML/CFT

Form sections:
  Part A - Reporting Institution Details
  Part B - Subject of Suspicion
  Part C - Suspicious Transaction Details
  Part D - Grounds for Suspicion
  Part E - Additional Information / Narrative
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# HK-specific enumerations
# ---------------------------------------------------------------------------

class HKInstitutionType(str, Enum):
    authorized_institution = "AI"         # HKMA-regulated bank / DTC
    licensed_corporation = "LC"           # SFC-licensed
    insurance_company = "IC"              # IA-authorized
    money_service_operator = "MSO"        # C&ED-licensed
    svf_licensee = "SVF"                  # Stored Value Facility licensee
    solicitors_firm = "SOL"              # Law Society regulated
    accounting_firm = "CPA"              # HKICPA regulated
    estate_agent = "EA"                   # EAA-licensed
    trust_company_service_provider = "TCSP"
    other = "OTH"


class HKRegulator(str, Enum):
    hkma = "HKMA"       # Hong Kong Monetary Authority
    sfc = "SFC"         # Securities and Futures Commission
    ia = "IA"           # Insurance Authority
    ced = "C&ED"        # Customs and Excise Department
    lspc = "LSPC"       # Law Society of Hong Kong
    hkicpa = "HKICPA"   # HK Institute of CPAs
    eaa = "EAA"         # Estate Agents Authority
    ccb = "CCB"         # Companies Registry (TCSP)
    other = "OTHER"


class HKSubjectType(str, Enum):
    individual = "individual"
    corporate = "corporate"


class HKIDType(str, Enum):
    hkid = "HKID"
    passport = "PASSPORT"
    br_number = "BR"           # Business Registration number
    ci_number = "CI"           # Certificate of Incorporation
    travel_doc = "TRAVEL_DOC"
    other = "OTHER"


class HKTransactionType(str, Enum):
    cash_deposit = "CASH_DEP"
    cash_withdrawal = "CASH_WDL"
    wire_transfer_in = "WIRE_IN"
    wire_transfer_out = "WIRE_OUT"
    cheque_deposit = "CHQ_DEP"
    cheque_issued = "CHQ_ISS"
    internal_transfer = "INT_TFR"
    loan_drawdown = "LOAN"
    insurance_payout = "INS_PAY"
    insurance_premium = "INS_PREM"
    securities_trade = "SEC_TRD"
    virtual_asset_transfer = "VA_TFR"
    remittance = "REMIT"
    currency_exchange = "FX"
    other = "OTHER"


class HKTransactionMethod(str, Enum):
    cash = "CASH"
    cheque = "CHEQUE"
    wire = "WIRE"
    fps = "FPS"                 # Faster Payment System
    ach = "ACH"
    rtgs = "RTGS"               # Real Time Gross Settlement (CHATS)
    virtual_asset = "VA"
    other = "OTHER"


# HK suspicious activity indicators (HKMA Guideline categories)
HK_SUSPICIOUS_INDICATORS: dict[str, str] = {
    "HK01": "Unusually large cash transaction",
    "HK02": "Structuring to avoid reporting threshold",
    "HK03": "Transactions inconsistent with customer profile",
    "HK04": "Complex/unusual transactions with no apparent economic purpose",
    "HK05": "Use of nominees, shell companies, or complex structures",
    "HK06": "Wire transfers to/from high-risk jurisdictions",
    "HK07": "Rapid movement of funds (in-and-out pattern)",
    "HK08": "Third-party transactions without clear rationale",
    "HK09": "PEP-related concerns",
    "HK10": "Sanctions screening hit",
    "HK11": "Unusual activity in dormant account",
    "HK12": "Customer reluctance to provide information",
    "HK13": "Frequent amendments to transaction instructions",
    "HK14": "Transactions involving virtual assets",
    "HK15": "Trade-based laundering indicators",
    "HK16": "Structuring across multiple accounts or institutions",
    "HK17": "Unusual loan or insurance transactions",
    "HK18": "Source of funds/wealth inconsistent with known profile",
    "HK19": "Negative media / adverse information",
    "HK20": "Other suspicious indicator",
}

HK_TRANSACTION_TYPE_LABELS: dict[str, str] = {t.value: t.name.replace("_", " ").title() for t in HKTransactionType}

HK_INSTITUTION_TYPE_LABELS: dict[str, str] = {
    "AI": "Authorized Institution (Bank/DTC)",
    "LC": "Licensed Corporation (Securities)",
    "IC": "Insurance Company",
    "MSO": "Money Service Operator",
    "SVF": "Stored Value Facility Licensee",
    "SOL": "Solicitors Firm",
    "CPA": "Accounting Firm",
    "EA": "Estate Agent",
    "TCSP": "Trust or Company Service Provider",
    "OTH": "Other",
}


# ---------------------------------------------------------------------------
# Part A - Reporting Institution Details
# ---------------------------------------------------------------------------

class STRReportingInstitution(BaseModel):
    """JFIU STR Part A — Reporting institution details."""
    institution_name: Optional[str] = Field(None, max_length=200)
    institution_name_chinese: Optional[str] = Field(None, max_length=200)
    institution_type: Optional[HKInstitutionType] = None
    regulator: Optional[HKRegulator] = None
    license_number: Optional[str] = Field(None, max_length=50)

    address: Optional[str] = Field(None, max_length=300)
    district: Optional[str] = Field(None, max_length=50)

    contact_name: Optional[str] = Field(None, max_length=100)
    contact_title: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=20)
    contact_email: Optional[str] = Field(None, max_length=100)

    institution_reference: Optional[str] = Field(
        None, max_length=50, description="Internal reference number assigned by reporting institution"
    )


# ---------------------------------------------------------------------------
# Part B - Subject of Suspicion
# ---------------------------------------------------------------------------

class STRSubjectID(BaseModel):
    """Identity document for a subject."""
    id_type: Optional[HKIDType] = None
    id_number: Optional[str] = Field(None, max_length=30)
    issuing_country: Optional[str] = Field(None, max_length=50)


class STRSubjectAccount(BaseModel):
    """Account associated with the subject at the reporting institution."""
    account_number: str
    account_type: Optional[str] = Field(None, description="savings, current, securities, insurance policy, etc.")
    account_opening_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    account_status: Optional[str] = Field(None, description="active, dormant, closed, frozen")


class STRSubject(BaseModel):
    """JFIU STR Part B — Subject of suspicion."""
    subject_type: HKSubjectType = HKSubjectType.individual

    # Individual fields
    english_name: Optional[str] = Field(None, max_length=150)
    chinese_name: Optional[str] = Field(None, max_length=100)
    date_of_birth: Optional[str] = Field(None, description="YYYY-MM-DD")
    nationality: Optional[str] = Field(None, max_length=50)
    occupation: Optional[str] = Field(None, max_length=100)

    # Corporate fields
    company_name: Optional[str] = Field(None, max_length=200)
    company_name_chinese: Optional[str] = Field(None, max_length=200)
    business_registration_number: Optional[str] = Field(None, max_length=20)
    nature_of_business: Optional[str] = Field(None, max_length=100)
    incorporation_place: Optional[str] = Field(None, max_length=50)

    # Common fields
    address: Optional[str] = Field(None, max_length=300)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)

    # Identification documents
    identity_documents: list[STRSubjectID] = Field(default_factory=list)

    # Accounts at the institution
    accounts: list[STRSubjectAccount] = Field(default_factory=list)

    # Relationship
    relationship_to_institution: Optional[str] = Field(
        None, description="customer, non-customer, employee, former_customer"
    )
    customer_since: Optional[str] = Field(None, description="YYYY-MM-DD")

    # ANGELA cross-reference
    angela_entity_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Part C - Suspicious Transaction Details
# ---------------------------------------------------------------------------

class STRTransaction(BaseModel):
    """Individual transaction within the STR."""
    transaction_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    transaction_type: Optional[HKTransactionType] = None
    transaction_method: Optional[HKTransactionMethod] = None
    amount: Optional[float] = Field(None, ge=0)
    currency: str = "HKD"

    # Counterparty
    counterparty_name: Optional[str] = Field(None, max_length=200)
    counterparty_account: Optional[str] = Field(None, max_length=50)
    counterparty_institution: Optional[str] = Field(None, max_length=200)
    counterparty_jurisdiction: Optional[str] = Field(None, max_length=50)

    description: Optional[str] = Field(None, max_length=500)


class STRSuspiciousActivity(BaseModel):
    """JFIU STR Part C — Suspicious transaction details."""
    activity_period_begin: Optional[str] = Field(None, description="YYYY-MM-DD")
    activity_period_end: Optional[str] = Field(None, description="YYYY-MM-DD")

    total_amount_hkd: Optional[float] = Field(None, ge=0)
    total_amount_other_currency: Optional[float] = Field(None, ge=0)
    other_currency: Optional[str] = Field(None, max_length=3)

    transactions: list[STRTransaction] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Part D - Grounds for Suspicion
# ---------------------------------------------------------------------------

class STRGroundsForSuspicion(BaseModel):
    """JFIU STR Part D — Grounds for suspicion and analysis."""
    suspicious_indicators: list[str] = Field(
        default_factory=list,
        description="Indicator codes from HK_SUSPICIOUS_INDICATORS (HK01-HK20)",
    )
    indicator_other_text: Optional[str] = Field(None, max_length=200)

    customer_explanation: Optional[str] = Field(
        None, max_length=2000,
        description="Explanation provided by the customer, if any",
    )
    analysis_of_suspicion: Optional[str] = Field(
        None, max_length=5000,
        description="Reasonably detailed analysis of why the activity is suspicious",
    )

    customer_tipped_off: bool = False
    account_frozen: bool = False
    account_frozen_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    related_str_references: list[str] = Field(
        default_factory=list,
        description="Reference numbers of previously filed STRs related to this matter",
    )

    # Predicate offence if known
    suspected_offence: Optional[str] = Field(
        None, description="e.g. fraud, drug trafficking, corruption, tax evasion"
    )


# ---------------------------------------------------------------------------
# Part E - Additional Information / Narrative
# ---------------------------------------------------------------------------

class STRAdditionalInfo(BaseModel):
    """JFIU STR Part E — Additional information."""
    narrative: Optional[str] = Field(
        None, max_length=10000,
        description="Free-text narrative with full details of the suspicious activity",
    )
    supporting_documents_description: Optional[str] = Field(
        None, max_length=2000,
        description="Description of any attached supporting documents",
    )


# ---------------------------------------------------------------------------
# Composite: Full STR Filing
# ---------------------------------------------------------------------------

class STRFilingCreate(BaseModel):
    """Request body to create a new HK STR filing within a case."""
    entity_id: str
    bucket: int

    reporting_institution: STRReportingInstitution = Field(default_factory=STRReportingInstitution)
    subject: STRSubject = Field(default_factory=STRSubject)
    suspicious_activity: STRSuspiciousActivity = Field(default_factory=STRSuspiciousActivity)
    grounds_for_suspicion: STRGroundsForSuspicion = Field(default_factory=STRGroundsForSuspicion)
    additional_info: STRAdditionalInfo = Field(default_factory=STRAdditionalInfo)


class STRFilingUpdate(BaseModel):
    """Partial update for an HK STR filing."""
    status: Optional[str] = None
    reporting_institution: Optional[STRReportingInstitution] = None
    subject: Optional[STRSubject] = None
    suspicious_activity: Optional[STRSuspiciousActivity] = None
    grounds_for_suspicion: Optional[STRGroundsForSuspicion] = None
    additional_info: Optional[STRAdditionalInfo] = None


class STRFilingOut(BaseModel):
    """Response model for an HK STR filing."""
    id: str
    case_id: str
    entity_id: str
    bucket: int
    status: str
    report_type: str

    reporting_institution: dict
    subject: dict
    suspicious_activity: dict
    grounds_for_suspicion: dict
    additional_info: dict

    narrative: Optional[str] = None
    narrative_payload: dict = Field(default_factory=dict)
    str_xml: Optional[str] = None

    risk_score: Optional[float] = None
    risk_evidence: dict = Field(default_factory=dict)

    created_at: str
    updated_at: str


class STRValidationResult(BaseModel):
    ready: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
