# Backend Changelog

## v0.2.1 — Hong Kong JFIU STR Filing Support

### Overview

Adds Hong Kong Suspicious Transaction Report (STR) filing alongside the
existing US FinCEN SAR format.  Covers the full JFIU STR Proforma
(Parts A-E) with structured XML output for STREAMS 2 electronic submission.

### New Files

| File | Purpose |
|------|---------|
| `sar/hk_str_models.py` | Pydantic models for all HK STR fields (Parts A-E), HK institution types, HKMA suspicious indicators, transaction types |
| `sar/hk_str_xml_generator.py` | XML generator mirroring JFIU proforma structure for STREAMS 2 |

### Modified Files

| File | Change |
|------|--------|
| `db_models.py` | Added `report_type`, `reporting_institution`, `grounds_for_suspicion`, `additional_info`, `str_xml` columns to SARFiling |
| `routes_cases.py` | Added HK STR CRUD + narrative + validation + XML endpoints under `/cases/{id}/str`. Added HK reference data endpoints. |

### New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/cases/{id}/str` | Create HK STR filing |
| `GET` | `/cases/{id}/str` | List HK STR filings for case |
| `GET` | `/cases/{id}/str/{str_id}` | Get STR filing detail |
| `PATCH` | `/cases/{id}/str/{str_id}` | Update STR filing fields |
| `DELETE` | `/cases/{id}/str/{str_id}` | Delete STR filing |
| `POST` | `/cases/{id}/str/{str_id}/generate-narrative` | AI-generate narrative |
| `GET` | `/cases/{id}/str/{str_id}/validate` | Validate readiness for XML |
| `POST` | `/cases/{id}/str/{str_id}/generate-xml` | Generate JFIU STR XML |
| `GET` | `/cases/reference/hk-suspicious-indicators` | HKMA indicator codes |
| `GET` | `/cases/reference/hk-institution-types` | HK institution type codes |
| `GET` | `/cases/reference/hk-transaction-types` | HK transaction type codes |

### HK STR Form Structure

- **Part A** — Reporting Institution (name, type, regulator, license, contact)
- **Part B** — Subject of Suspicion (individual/corporate, HKID, accounts, relationship)
- **Part C** — Suspicious Transaction Details (dates, amounts in HKD, individual transactions)
- **Part D** — Grounds for Suspicion (indicators, customer explanation, analysis, account freeze status)
- **Part E** — Additional Information / Narrative

---

## v0.2.0 — Case Persistence & FinCEN SAR E-Filing

### Overview

Adds PostgreSQL-backed case persistence and complete FinCEN SAR XML v1.6
generation for BSA e-filing.  All changes are **non-breaking** — existing
frontend API endpoints are unmodified.

### What changed

| Area | Change |
|------|--------|
| **Docker** | Added `postgres` (16-alpine) service to `docker-compose.yml` with health check. Added `pgdata` volume. Backend now depends on Postgres being healthy. |
| **Dependencies** | Added `sqlalchemy[asyncio]>=2.0.0` and `asyncpg>=0.29.0` to `requirements.txt`. |
| **Config** | `config.py` now reads `DATABASE_URL` from environment (defaults to local dev). |
| **Database** | New `database.py` — async SQLAlchemy engine, session factory, `init_db()` bootstrap. |
| **ORM Models** | New `db_models.py` — `Case` and `SARFiling` tables with JSONB columns for all FinCEN fields. |
| **FinCEN Models** | New `sar/models.py` — Pydantic models covering every required BSA e-filing field: Subject (Part I), Suspicious Activity (Part II), Financial Institution (Part III), Filing Contact (Part IV), and Narrative (Part V). Includes FinCEN code enumerations for activity types, instruments, and products. |
| **XML Generator** | New `sar/xml_generator.py` — Builds FinCEN SAR XML Schema v1.6 output. Includes AI-generated disclaimer in the narrative. |
| **Routes** | New `routes_cases.py` — All endpoints under `/cases`. See API reference below. |
| **Startup** | `main.py` now uses a `lifespan` context manager to initialize the DB on startup and close connections on shutdown. Gracefully degrades if Postgres is unavailable. |

### New API Endpoints

All endpoints are additive under `/cases`. Existing routes are untouched.

#### Cases

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/cases` | Create a new investigation case with JSON snapshot input |
| `GET` | `/cases` | List cases (filterable by `status`, paginated) |
| `GET` | `/cases/{case_id}` | Get case detail + SAR filings list |
| `PATCH` | `/cases/{case_id}` | Update title / status / metadata |
| `DELETE` | `/cases/{case_id}` | Delete case and all associated SAR filings |
| `POST` | `/cases/{case_id}/load` | Load case data into in-memory analysis store |

#### SAR Filings

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/cases/{id}/sar` | Create SAR filing (auto-populates risk context) |
| `GET` | `/cases/{id}/sar` | List SAR filings for case |
| `GET` | `/cases/{id}/sar/{sar_id}` | Get SAR filing detail |
| `PATCH` | `/cases/{id}/sar/{sar_id}` | Update SAR filing fields (partial) |
| `DELETE` | `/cases/{id}/sar/{sar_id}` | Delete SAR filing |
| `POST` | `/cases/{id}/sar/{sar_id}/generate-narrative` | AI-generate Part V narrative |
| `GET` | `/cases/{id}/sar/{sar_id}/validate` | Validate readiness for XML |
| `POST` | `/cases/{id}/sar/{sar_id}/generate-xml` | Generate FinCEN XML v1.6 |

#### Reference Data

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cases/reference/activity-types` | FinCEN activity subtype codes |
| `GET` | `/cases/reference/instrument-types` | Payment instrument codes |
| `GET` | `/cases/reference/product-types` | Product/service codes |

### Database Schema

```
cases
├── id              UUID (PK)
├── title           VARCHAR(255)
├── status          VARCHAR(50)  [open, in_review, filed, closed]
├── input_data      JSONB        (full snapshot JSON)
├── metadata        JSONB
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ

sar_filings
├── id                    UUID (PK)
├── case_id               UUID (FK → cases)
├── entity_id             VARCHAR(255)
├── bucket                INT
├── status                VARCHAR(50)  [draft, xml_generated, reviewed, filed]
├── filing_type           VARCHAR(50)  [initial, correct, amend, joint]
├── prior_report_bsa_id   VARCHAR(50)
├── subject               JSONB   (Part I   — SARSubject schema)
├── financial_institution JSONB   (Part III — where activity occurred)
├── filing_institution    JSONB   (Part III — filing institution)
├── filing_contact        JSONB   (Part IV  — contact person)
├── suspicious_activity   JSONB   (Part II  — activity details)
├── narrative             TEXT    (Part V   — SAR narrative)
├── narrative_payload     JSONB   (LLM input payload)
├── fincen_xml            TEXT    (generated XML v1.6)
├── risk_score            FLOAT
├── risk_evidence         JSONB
├── created_at            TIMESTAMPTZ
└── updated_at            TIMESTAMPTZ
```

### FinCEN SAR XML Generation Notes

- XML conforms to FinCEN BSA E-Filing SAR XML Schema v1.6
- Output includes an AI-disclaimer prepended to the narrative section
- Compliance officers **MUST** review all fields and validate through their
  institution's BSA e-filing software before submitting to FinCEN
- The `/validate` endpoint checks required fields before allowing XML generation
- We intentionally do **not** generate a PDF — use your institution's software
  to produce the final filing artifact from the validated XML

### Migration Notes

- No existing endpoints or response shapes were changed
- The backend starts normally even without Postgres (case endpoints will 500,
  but all existing analysis endpoints work fine)
- Tables are auto-created on first startup via `CREATE TABLE IF NOT EXISTS`
- For production, consider adding Alembic migrations
