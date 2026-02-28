# ANGELA -- Complete Documentation

**Anomaly Network Graph for Explainable Laundering Analysis**

An AI-powered 3D graph intelligence platform for anti-money-laundering (AML) investigation. ANGELA combines a FastAPI backend with real-time risk detection, a multi-agent LLM investigation system, and an immersive Three.js 3D visualization frontend.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Docker Deployment](#docker-deployment)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [AI Provider Configuration](#ai-provider-configuration)
- [Backend](#backend)
  - [Application Entry Point](#application-entry-point)
  - [Data Store](#data-store)
  - [Data Models](#data-models)
  - [Risk Detection Engine](#risk-detection-engine)
  - [Multi-Agent Investigation System](#multi-agent-investigation-system)
  - [AI Service Layer](#ai-service-layer)
  - [Natural Language Query Engine](#natural-language-query-engine)
  - [Counterfactual Explainer](#counterfactual-explainer)
  - [Executive Dashboard](#executive-dashboard)
  - [Cluster Detection](#cluster-detection)
  - [Anomaly Injection](#anomaly-injection)
  - [3D Asset Generation](#3d-asset-generation)
  - [WebSocket Events](#websocket-events)
  - [Input Memory and Caching](#input-memory-and-caching)
- [API Reference](#api-reference)
  - [Health and Status](#health-and-status)
  - [Data Upload](#data-upload)
  - [Graph Data](#graph-data)
  - [AI Copilot](#ai-copilot)
  - [Multi-Agent Investigation](#multi-agent-investigation)
  - [Natural Language Query](#natural-language-query)
  - [Dashboard and Clusters](#dashboard-and-clusters)
  - [Anomaly Injection Endpoints](#anomaly-injection-endpoints)
  - [Counterfactual Analysis](#counterfactual-analysis)
  - [Asset Serving](#asset-serving)
  - [WebSocket](#websocket)
- [Frontend](#frontend)
  - [3D Scene and Rendering](#3d-scene-and-rendering)
  - [Graph Visualization Layers](#graph-visualization-layers)
  - [Visual Encoding Scheme](#visual-encoding-scheme)
  - [UI Components](#ui-components)
  - [Camera and Autopilot](#camera-and-autopilot)
  - [API Client and WebSocket Client](#api-client-and-websocket-client)
- [Data Formats](#data-formats)
  - [Entity Schema](#entity-schema)
  - [Transaction Schema](#transaction-schema)
  - [Snapshot JSON Format](#snapshot-json-format)
  - [CSV Upload Format](#csv-upload-format)
- [Testing](#testing)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                    Frontend                      │
│           Vite + TypeScript + Three.js           │
│   ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│   │ 3D Graph │ │ UI Panels│ │ Camera/Autopilot│  │
│   │ Layers   │ │ Dashboard│ │ System          │  │
│   └────┬─────┘ └────┬─────┘ └───────┬────────┘  │
│        │             │               │           │
│        └─────────────┼───────────────┘           │
│                      │                           │
│               ┌──────┴──────┐                    │
│               │  API Client │                    │
│               │  WS Client  │                    │
│               └──────┬──────┘                    │
└──────────────────────┼───────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────┼───────────────────────────┐
│                      │                           │
│               ┌──────┴──────┐     Backend        │
│               │  FastAPI    │                    │
│               │  Routes     │                    │
│               └──────┬──────┘                    │
│                      │                           │
│  ┌──────────┬────────┼────────┬──────────┐       │
│  │          │        │        │          │       │
│  ▼          ▼        ▼        ▼          ▼       │
│ Risk     Multi-    NLQ     Dashboard  Counter-   │
│ Engine   Agent     Engine   KPIs      factual    │
│          System                       Explainer  │
│  │          │        │                           │
│  ▼          ▼        ▼                           │
│ ┌──────────────────────┐                         │
│ │   In-Memory DataStore │                        │
│ │   (entities, tx, risk)│                        │
│ └──────────────────────┘                         │
│  │                                               │
│  ▼                                               │
│ ┌──────────────────────┐                         │
│ │  AI Service Layer     │                        │
│ │  (OpenAI / Bedrock)   │                        │
│ └──────────────────────┘                         │
└──────────────────────────────────────────────────┘
```

The system follows a **stateless REST + WebSocket** communication model. Data is held in an **in-memory DataStore** singleton (no external database required). Risk scores are computed on-the-fly using a **feature extraction → detection → fusion** pipeline. The **multi-agent system** orchestrates LLM-powered investigation workflows, and results are broadcast to the frontend in real time via WebSocket.

---

## Tech Stack

| Layer    | Technology                      | Purpose                              |
|----------|---------------------------------|--------------------------------------|
| Backend  | Python 3.11+                    | Runtime                              |
| Backend  | FastAPI 0.115+                  | HTTP/WebSocket framework             |
| Backend  | Uvicorn                         | ASGI server                          |
| Backend  | OpenAI SDK 1.50+                | LLM API client                       |
| Backend  | boto3                           | AWS Bedrock native provider          |
| Backend  | NumPy 1.26+                     | Numerical operations                 |
| Backend  | Trimesh 4.0+                    | GLB 3D asset generation              |
| Frontend | TypeScript 5.9                  | Language                             |
| Frontend | Vite 7.3                        | Build tool and dev server            |
| Frontend | Three.js 0.182                  | 3D rendering engine                  |
| Frontend | Marked 17.0                     | Markdown parsing                     |
| Frontend | DOMPurify 3.3                   | HTML sanitization                    |

---

## Project Structure

```
angela/
├── backend/
│   ├── app/
│   │   ├── agents/                 # Multi-agent investigation system
│   │   │   ├── __init__.py
│   │   │   ├── supervisor.py       # Orchestrates the 4-agent pipeline
│   │   │   ├── intake_agent.py     # Query parsing agent
│   │   │   ├── research_agent.py   # Entity resolution and ranking agent
│   │   │   ├── analysis_agent.py   # Risk scoring and LLM summarization agent
│   │   │   ├── reporting_agent.py  # Briefing and SAR generation agent
│   │   │   ├── schemas.py          # Pydantic request schemas
│   │   │   └── memory.py           # In-memory run state store
│   │   ├── ai/                     # AI service layer
│   │   │   ├── service.py          # LLM wrapper (OpenAI / Bedrock)
│   │   │   ├── prompts.py          # Entity and cluster prompt templates
│   │   │   ├── prompts_sar.py      # SAR narrative prompt templates
│   │   │   └── warmup.py           # Pre-warming AI caches
│   │   ├── risk/                   # Risk detection engine
│   │   │   ├── scoring.py          # Weighted risk fusion
│   │   │   ├── detectors.py        # Velocity, structuring, circular flow detectors
│   │   │   └── features.py         # Per-entity feature extraction
│   │   ├── assets/                 # 3D asset generation
│   │   │   ├── generator.py        # GLB mesh creation via Trimesh
│   │   │   └── orchestrator.py     # Asset orchestration (beacons, cluster blobs)
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── routes.py               # All API endpoints
│   │   ├── models.py               # Pydantic response models
│   │   ├── config.py               # Path and data configuration
│   │   ├── data_loader.py          # DataStore singleton
│   │   ├── csv_processor.py        # CSV parsing and column mapping
│   │   ├── nlq.py                  # Natural language query engine
│   │   ├── clusters.py             # Connected-component cluster detection
│   │   ├── investigation.py        # Autopilot investigation target generation
│   │   ├── dashboard.py            # Executive KPI computation
│   │   ├── counterfactual.py       # Counterfactual risk explainer
│   │   ├── ws.py                   # WebSocket connection manager
│   │   └── input_memory.py         # Request caching and history
│   ├── tests/
│   │   └── test_api.py             # API tests
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.ts                 # Application entry point and main loop
│   │   ├── types.ts                # TypeScript interfaces
│   │   ├── scene.ts                # Three.js scene, renderer, post-processing
│   │   ├── skybox.ts               # Skybox layer
│   │   ├── ambientAudio.ts         # Ambient audio controller
│   │   ├── graph/                  # Graph visualization layers
│   │   │   ├── NodeLayer.ts        # Instanced node mesh rendering
│   │   │   ├── EdgeLayer.ts        # Edge line rendering
│   │   │   ├── ClusterLayer.ts     # Cluster visualization
│   │   │   ├── AssetLayer.ts       # GLB model loading
│   │   │   └── NodeFactory.ts      # Node geometry factory
│   │   ├── camera/                 # Camera system
│   │   │   └── Autopilot.ts        # Automated camera investigation tours
│   │   ├── ui/                     # UI overlay components
│   │   │   ├── wizard.ts           # Multi-step data upload wizard
│   │   │   ├── panel.ts            # Entity detail panel
│   │   │   ├── dashboard.ts        # Executive dashboard overlay
│   │   │   ├── slider.ts           # Time bucket slider
│   │   │   ├── camera.ts           # Camera preset controls
│   │   │   ├── stats.ts            # FPS/performance stats overlay
│   │   │   ├── markdown.ts         # Markdown rendering utilities
│   │   │   ├── sarPanel.ts         # SAR report panel
│   │   │   ├── axisLabels.ts       # 3D axis labels
│   │   │   └── wizardParticles.ts  # Upload wizard particle effects
│   │   └── api/                    # API communication
│   │       ├── client.ts           # REST API client functions
│   │       └── ws.ts               # WebSocket client
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
├── scripts/
│   ├── preprocess_aml.py           # Data preprocessing utility
│   └── record-demo.ts              # Demo recording script
├── data/
│   ├── raw/                        # Raw datasets (gitignored)
│   └── processed/                  # Processed JSON snapshots
├── blender_mcp/                    # Future Blender integration
├── .env                            # Environment variables
├── package.json                    # Root package (dev tools)
└── README.md
```

---

## Getting Started

### Prerequisites

| Tool   | Version | Install                                |
|--------|---------|----------------------------------------|
| Python | 3.11+   | `pyenv install 3.11` or system install |
| Node   | 20+     | `nvm install 20` or system install     |
| pnpm   | 9+      | `npm install -g pnpm`                  |

### Backend Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Verify the backend is running:

```bash
curl http://localhost:8000/health
# {"status": "ok"}
```

### Frontend Setup

```bash
cd frontend
pnpm install
pnpm dev
```

The frontend dev server starts at `http://localhost:5173` and proxies `/api` requests to the backend at `localhost:8000`.

**Available npm scripts:**

| Script          | Command                  | Description                |
|-----------------|--------------------------|----------------------------|
| `pnpm dev`      | `vite`                   | Start dev server           |
| `pnpm build`    | `tsc && vite build`      | Type-check and build       |
| `pnpm preview`  | `vite preview`           | Preview production build   |

### Docker Deployment

**Backend:**

```bash
cd backend
docker build -t angela-backend .
docker run -p 8000:8000 --env-file ../.env angela-backend
```

**Frontend:**

```bash
cd frontend
docker build -t angela-frontend .
docker run -p 80:80 angela-frontend
```

The frontend Docker image uses a multi-stage build: Node 20 for building, nginx-alpine for serving.

---

## Configuration

### Environment Variables

| Variable                  | Default                        | Description                                      |
|---------------------------|--------------------------------|--------------------------------------------------|
| `OPENAI_API_KEY`          | *(required)*                   | API key for AI provider                          |
| `ANGELA_AI_API_KEY`       | Falls back to `OPENAI_API_KEY` | Explicit AI API key override                     |
| `ANGELA_AI_BASE_URL`      | `https://api.openai.com/v1`    | Base URL for the AI provider                     |
| `ANGELA_AI_MODEL`         | `gpt-5-mini`                   | Model identifier                                 |
| `ANGELA_AI_PROVIDER`      | `openai_compat`                | Provider type: `openai_compat` or `bedrock_native` |
| `ANGELA_AI_TIMEOUT`       | `45.0`                         | LLM request timeout in seconds                   |
| `ANGELA_AI_SAR_MAX_TOKENS`| `1200`                         | Max tokens for SAR narrative generation           |
| `AWS_REGION`              | `us-east-1`                    | AWS region (for Bedrock native provider)         |
| `ANGELA_DATA_DIR`         | `<project_root>/data/processed`| Directory for processed data files               |
| `ANGELA_DATA_FILE`        | `sample_small.json`            | Default sample data filename                     |

### AI Provider Configuration

ANGELA supports two AI provider backends:

**OpenAI-Compatible (default):**
Any endpoint that implements the OpenAI chat completions API. Configure with `ANGELA_AI_PROVIDER=openai_compat` and set `ANGELA_AI_BASE_URL` to your provider's endpoint.

**AWS Bedrock Native:**
Direct integration with AWS Bedrock Runtime via `boto3.client("bedrock-runtime").converse()`. Configure with `ANGELA_AI_PROVIDER=bedrock_native`. Requires valid AWS credentials in the environment.

---

## Backend

### Application Entry Point

`backend/app/main.py` initializes the FastAPI application with:
- CORS middleware allowing the frontend dev server origins (`localhost:5173`, `localhost:5174`)
- A health check endpoint at `GET /health`
- All routes mounted from `routes.py`
- Environment loaded from the project root `.env` file via `python-dotenv`

### Data Store

`backend/app/data_loader.py` provides a singleton `DataStore` instance (`store`) that holds all data in memory. There is no external database; the entire dataset lives in Python dictionaries and lists.

**Key properties and methods:**

| Member                              | Description                                          |
|-------------------------------------|------------------------------------------------------|
| `store.entities`                    | List of entity dicts                                 |
| `store.transactions`                | List of transaction dicts                            |
| `store.n_buckets`                   | Number of time buckets                               |
| `store.metadata`                    | Dataset metadata dict                                |
| `store.risk_by_bucket`              | `dict[int, dict[str, dict]]` — risk data per bucket  |
| `store.bucket_index`                | `dict[str, list[int]]` — tx indices per bucket       |
| `store.is_loaded`                   | Whether data has been loaded                         |
| `store.load(path)`                  | Load from a JSON file                                |
| `store.load_from_dict(snapshot)`    | Load from an in-memory dict                          |
| `store.get_entity(id)`              | Retrieve a single entity                             |
| `store.get_entity_risk(bucket, id)` | Risk data for entity in a bucket                     |
| `store.get_entity_activity(bucket, id)` | Activity summary (in/out counts, sums)          |
| `store.get_bucket_transactions(t)`  | All transactions in bucket `t`                       |
| `store.get_bucket_entities(t)`      | Entity IDs active in bucket `t`                      |

### Data Models

Defined in `backend/app/models.py` using Pydantic:

**`SnapshotNode`** — A node in a time-bucket snapshot:
- `id`, `jurisdiction_bucket`, `kyc_level`, `risk_score`, `entity_type`, `volume`

**`SnapshotMeta`** — Metadata for a snapshot:
- `t`, `n_buckets`, `n_entities`, `n_transactions`, `bucket_size_seconds`

**`SnapshotOut`** — Full snapshot response:
- `meta: SnapshotMeta`, `nodes: list[SnapshotNode]`, `edges: list[dict]`

**`EntityDetailOut`** — Detailed entity view:
- `id`, `type`, `bank`, `jurisdiction_bucket`, `kyc_level`, `risk_score`, `reasons: list[ReasonOut]`, `evidence: dict`, `activity: dict | None`

**`ReasonOut`** — A risk reason:
- `detector`, `detail`, `weight`

**`NeighborhoodOut`** — k-hop neighborhood:
- `center_id`, `k`, `nodes: list[SnapshotNode]`, `edges: list[NeighborEdge]`

**`NeighborEdge`** — Edge in a neighborhood:
- `from_id`, `to_id`, `amount`

### Risk Detection Engine

Located in `backend/app/risk/`. The risk pipeline follows three stages:

#### Stage 1: Feature Extraction (`features.py`)

Extracts per-entity features from a bucket's transactions:
- `total_tx` — total transaction count
- `tx_per_minute` — transaction frequency
- `amounts` — list of individual transaction amounts
- Aggregated in/out volumes and counterparty counts

#### Stage 2: Detectors (`detectors.py`)

Three independent detectors each produce a score in `[0, 1]`:

**Velocity Detector:**
Compares an entity's transaction count against the population distribution. Normalizes between the population median (p50) and 95th percentile (p95). An entity at 2x the p95 scores 1.0.

**Structuring Detector:**
Identifies transactions with amounts in the range `[$9,000, $10,000)` — just below the Bank Secrecy Act reporting threshold. Scores ramp from 0 at 1 hit to 1.0 at 5+ hits.

**Circular Flow Detector:**
Uses depth-limited DFS (max depth 4, max 500 node visits) to find cycles that include the entity. Shorter cycles score higher: length 3 = 1.0, length 4 = 0.7, length 5 = 0.4.

#### Stage 3: Risk Fusion (`scoring.py`)

Combines detector outputs using fixed weights:

| Detector       | Weight |
|----------------|--------|
| Velocity       | 0.4    |
| Structuring    | 0.3    |
| Circular Flow  | 0.3    |

The final risk score is clamped to `[0, 1]` and rounded to 4 decimal places. Reasons are sorted by weighted contribution and capped at the top 3. Evidence from each detector (with scores > 0.05) is collected, and flagged transaction IDs are attached when structuring is detected.

### Multi-Agent Investigation System

Located in `backend/app/agents/`. Implements a supervisor pattern with four specialist agents executed sequentially:

```
Intake → Research → Analysis → Reporting
```

**`InvestigationSupervisor`** (`supervisor.py`):
Coordinates the pipeline. Creates a run record, executes each agent step, broadcasts progress via WebSocket, and manages caching of results.

**Agent Pipeline:**

| Step | Agent            | Purpose                                              |
|------|------------------|------------------------------------------------------|
| 1    | `IntakeAgent`    | Parse natural language query into intent and params   |
| 2    | `ResearchAgent`  | Resolve intent into ranked entity profiles            |
| 3    | `AnalysisAgent`  | Score entities, generate LLM summaries for top targets|
| 4    | `ReportingAgent` | Generate investigator briefing and optional SAR       |

**Investigation Profiles:**

| Profile    | LLM Summaries | Use Case                          |
|------------|---------------|-----------------------------------|
| `fast`     | min(1, max)   | Quick triage, low latency         |
| `balanced` | min(3, max)   | Default investigation depth       |
| `deep`     | min(5, max)   | Thorough analysis, highest fidelity|

**Run State (`memory.py`):**
Each investigation run is tracked in-memory with:
- Unique `run_id`
- Status: `running` → `completed` or `failed`
- Step-by-step progress tracking
- Artifacts from each agent
- Timestamps for creation, updates, and completion

**Request Schema (`schemas.py`):**

```python
AgentInvestigateRequest:
    query: str          # Natural language investigation query
    bucket: int         # Time bucket index (>= 0)
    include_sar: bool   # Generate SAR narrative (default: False)
    max_targets: int    # Max entities to analyze (1-15, default: 5)
    profile: str        # "fast" | "balanced" | "deep"
```

### AI Service Layer

`backend/app/ai/service.py` provides a unified interface for LLM calls.

**Features:**
- Pluggable providers: OpenAI-compatible and AWS Bedrock native
- LRU caching: entity summaries (256 entries), cluster summaries (64 entries)
- Thread-safe SAR narrative cache with explicit lock
- Automatic retry with increased token budget when reasoning models exhaust tokens
- Graceful fallback on errors: returns "AI summary temporarily unavailable."
- Cache clearing on dataset reload

**Exported Functions:**

| Function                    | Description                            |
|-----------------------------|----------------------------------------|
| `generate_entity_summary()` | LLM summary for a single entity        |
| `generate_cluster_summary()`| LLM summary for a cluster              |
| `generate_sar_narrative()`  | Full SAR narrative for an entity        |
| `clear_ai_caches()`         | Clear all LLM caches                   |

### Natural Language Query Engine

`backend/app/nlq.py` translates natural language questions into structured graph queries.

**Supported Intents:**

| Intent                        | Trigger Keywords                              | Parameters                    |
|-------------------------------|-----------------------------------------------|-------------------------------|
| `SHOW_HIGH_RISK`              | "risky", "suspicious"                         | `min_risk` (float, default 0.6)|
| `LARGE_INCOMING`              | "large transfers", "big amounts"              | `min_amount` (float, default 50000)|
| `HIGH_RISK_JURISDICTION`      | "country", "jurisdiction"                     | `jurisdiction` (int, 0-7)     |
| `STRUCTURING_NEAR_THRESHOLD`  | "structuring", "smurfing", "below threshold"  | *(none)*                      |
| `CIRCULAR_FLOW`               | "circular", "round-trip", "layering"          | *(none)*                      |
| `TOP_CLUSTERS`                | "clusters", "groups", "rings"                 | `limit` (int, default 5)      |

**Flow:** User query → LLM intent parsing → Deterministic execution against the DataStore → Entity IDs + edges + summary returned to the frontend.

### Counterfactual Explainer

`backend/app/counterfactual.py` answers: *"What if this entity behaved normally?"*

**Algorithm:**
1. Retrieve the entity's current risk profile
2. Identify suspicious edges based on risk evidence:
   - **Structuring:** transactions in the `[$9,000, $10,000)` range
   - **Circular flow:** edges involving cycle counterparties
   - **Velocity:** transactions less than 2 minutes apart during high-velocity periods
3. Remove suspicious edges from a temporary transaction copy
4. Recompute risk on the cleaned data
5. Return the delta between original and counterfactual risk scores

**Response includes:** original risk, counterfactual risk, removed edges with reasons, and the risk score delta.

### Executive Dashboard

`backend/app/dashboard.py` computes KPIs for a given time bucket:

| KPI                    | Description                                                   |
|------------------------|---------------------------------------------------------------|
| `high_risk_entities`   | Count of entities with risk > 0.5                            |
| `new_anomalies`        | Entities that crossed the 0.5 risk threshold vs. previous bucket|
| `cluster_count`        | Number of detected risk clusters                              |
| `cross_border_ratio`   | Ratio of cross-jurisdiction risky transactions                |
| `total_entities`       | Total entity count in bucket                                  |
| `total_transactions`   | Total transaction count in bucket                             |

Also returns:
- **Risk trend:** per-bucket total risk, high-risk count, and entity count across all buckets
- **Jurisdiction heatmap:** average risk, entity count, and high-risk count per jurisdiction bucket

### Cluster Detection

`backend/app/clusters.py` identifies connected components of high-risk entities using a configurable risk threshold (default: 0.3). Only entities with risk above the threshold are included, and clusters are formed based on shared transaction edges.

### Anomaly Injection

The `/inject` endpoint allows injecting synthetic anomalous transactions for demonstration and testing:

| Pattern       | Behavior                                                      |
|---------------|---------------------------------------------------------------|
| `velocity`    | 50 rapid-fire transactions (one per minute) from a random entity|
| `structuring` | 10 transactions with amounts in `[$9,000, $9,999]`           |
| `cycle`       | A 3-node cycle: `target → A → B → target`                    |

After injection, the system recomputes risk for the affected bucket, detects clusters, broadcasts `RISK_UPDATED` and `CLUSTER_DETECTED` events, and generates GLB assets for visualization.

### 3D Asset Generation

`backend/app/assets/` uses Trimesh to generate GLB (binary glTF) 3D models:

- **Beacon assets:** visual indicators for high-risk entities (risk > 0.5)
- **Cluster blob assets:** visual representations of detected clusters

Assets are served via `GET /assets/{filename}` with MIME type `model/gltf-binary`.

### WebSocket Events

The WebSocket endpoint at `WS /stream` broadcasts real-time events:

| Event                  | Payload                                               | Trigger                        |
|------------------------|-------------------------------------------------------|--------------------------------|
| `RISK_UPDATED`         | `bucket`, `entity_risks`, `injected_entity`, `pattern`| After anomaly injection        |
| `CLUSTER_DETECTED`     | `bucket`, cluster data                                | After cluster detection        |
| `ASSET_READY`          | Asset filename and metadata                           | After GLB generation           |
| `ASSET_FALLBACK`       | Fallback info when asset generation fails             | Asset generation failure       |
| `AGENT_RUN_STARTED`    | `run_id`, `query`, `bucket`, `profile`, `total_steps` | Investigation begins           |
| `AGENT_STEP`           | `run_id`, `step_index`, `agent`, `detail`, `status`   | Agent step starts/completes    |
| `AGENT_RUN_COMPLETED`  | `run_id`, `status`, `profile`                         | Investigation completes        |
| `AGENT_RUN_FAILED`     | `run_id`, `status`, `error`, `profile`                | Investigation fails            |

**Connection Manager** (`ws.py`): Maintains a list of active WebSocket connections. Dead connections are automatically pruned during broadcasts.

### Input Memory and Caching

`backend/app/input_memory.py` provides:
- **Request caching:** Results for NLQ queries and agent investigations are cached by a composite key (dataset stamp, query, bucket, parameters). Identical requests return cached results instantly.
- **Input history:** All requests are recorded with timestamps, cache hit status, and metadata. Accessible via `GET /inputs/history`.

---

## API Reference

Base URL: `http://localhost:8000`

### Health and Status

| Method | Path      | Description              | Response                                     |
|--------|-----------|--------------------------|----------------------------------------------|
| `GET`  | `/health` | Health check             | `{"status": "ok"}`                           |
| `GET`  | `/status` | Dataset load status      | `{loaded, n_entities, n_transactions, n_buckets}` |

### Data Upload

| Method | Path              | Description                    | Body / Query                                |
|--------|-------------------|--------------------------------|---------------------------------------------|
| `POST` | `/upload`         | Upload CSV or JSON dataset     | `multipart/form-data` file (max 50 MB)      |
| `POST` | `/upload/preview` | Preview CSV columns            | `multipart/form-data` CSV file              |
| `POST` | `/upload/mapped`  | Upload CSV with column mapping | File + `mapping` query param (JSON string)  |
| `POST` | `/load-sample`    | Load the default sample dataset| *(no body)*                                 |

**Upload response:**
```json
{
  "status": "ok",
  "n_entities": 150,
  "n_transactions": 5000,
  "n_buckets": 8
}
```

### Graph Data

| Method | Path                  | Query Params         | Response Model       |
|--------|-----------------------|----------------------|----------------------|
| `GET`  | `/snapshot`           | `t` (bucket index)   | `SnapshotOut`        |
| `GET`  | `/entity/{entity_id}` | `t` (optional bucket)| `EntityDetailOut`    |
| `GET`  | `/neighbors`          | `id`, `k` (1-3), `t`| `NeighborhoodOut`    |

**`GET /snapshot?t=0`** returns all active nodes with risk scores, edges between them, and snapshot metadata for the given time bucket.

**`GET /entity/{id}?t=0`** returns full entity details including risk score, reasons, evidence, and optional activity summary.

**`GET /neighbors?id=E001&k=2&t=0`** performs BFS k-hop neighborhood expansion (max 200 nodes, 500 edges).

### AI Copilot

| Method | Path                           | Query Params | Description                    |
|--------|--------------------------------|--------------|--------------------------------|
| `GET`  | `/ai/warmup/status`            | —            | Check AI cache warmup status   |
| `POST` | `/ai/warmup/trigger`           | `bucket`, `top_entities`, `top_sar` | Trigger cache warmup |
| `GET`  | `/ai/explain/entity/{id}`      | `t`          | LLM-generated entity summary   |
| `POST` | `/ai/sar/entity/{id}`          | `t`          | Generate SAR narrative          |

### Multi-Agent Investigation

| Method | Path                   | Body / Query                        | Description                 |
|--------|------------------------|-------------------------------------|-----------------------------|
| `POST` | `/agent/investigate`   | `AgentInvestigateRequest` JSON body | Start investigation run     |
| `GET`  | `/agent/run/{run_id}`  | —                                   | Get run details             |
| `GET`  | `/agent/runs`          | `limit`, `compact`                  | List recent runs            |
| `GET`  | `/agent/presets`       | —                                   | Get preset investigation queries |

**Investigation request:**
```json
{
  "query": "show high risk entities",
  "bucket": 0,
  "include_sar": false,
  "max_targets": 5,
  "profile": "balanced"
}
```

**Preset investigations:**

| Preset ID       | Query                                          | Profile    | SAR  |
|-----------------|-------------------------------------------------|-----------|------|
| `high-risk`     | "show high risk entities"                       | balanced  | No   |
| `large-incoming`| "show entities receiving large transaction volumes" | balanced | Yes  |
| `structuring`   | "find structuring near threshold transactions"  | deep      | Yes  |
| `circular`      | "show circular flow and layering activity"      | deep      | No   |

### Natural Language Query

| Method | Path              | Body                     | Description              |
|--------|-------------------|--------------------------|--------------------------|
| `POST` | `/nlq/parse`      | `{"query": str, "bucket": int}` | Parse and execute NLQ |
| `GET`  | `/inputs/history`  | `limit`, `kind`, `include_input` | Query history      |

**NLQ response:**
```json
{
  "intent": "SHOW_HIGH_RISK",
  "params": {"min_risk": 0.6},
  "interpretation": "Showing entities with risk score above 60%",
  "entity_ids": ["E001", "E042", "E117"],
  "edges": [{"from_id": "E001", "to_id": "E042", "amount": 15000}],
  "summary": "3 entities with risk >= 60%"
}
```

### Dashboard and Clusters

| Method | Path          | Query Params | Description                  |
|--------|---------------|--------------|------------------------------|
| `GET`  | `/dashboard`  | `t`          | Executive dashboard KPIs     |
| `GET`  | `/clusters`   | `t`          | Detected risk clusters       |
| `GET`  | `/autopilot/targets` | `t`   | Investigation targets list   |

**Dashboard response:**
```json
{
  "bucket": 0,
  "kpis": {
    "high_risk_entities": 12,
    "new_anomalies": 3,
    "cluster_count": 2,
    "cross_border_ratio": 0.45,
    "total_entities": 150,
    "total_transactions": 5000
  },
  "trend": [{"bucket": 0, "total_risk": 15.2, "high_risk_count": 12, "entity_count": 150}],
  "heatmap": [{"jurisdiction": 0, "avg_risk": 0.35, "entity_count": 20, "high_risk_count": 3}]
}
```

### Anomaly Injection Endpoints

| Method | Path      | Query Params           | Description                         |
|--------|-----------|------------------------|-------------------------------------|
| `POST` | `/inject` | `pattern`, `t`         | Inject synthetic anomaly            |

`pattern` is one of: `velocity`, `structuring`, `cycle`.

### Counterfactual Analysis

| Method | Path                              | Query Params | Description                        |
|--------|-----------------------------------|--------------|------------------------------------|
| `POST` | `/counterfactual/entity/{id}`     | `t`          | Counterfactual risk analysis       |

### Asset Serving

| Method | Path                  | Description                |
|--------|-----------------------|----------------------------|
| `GET`  | `/assets/{filename}`  | Serve GLB 3D model files   |

### WebSocket

| Protocol | Path      | Description                            |
|----------|-----------|----------------------------------------|
| `WS`     | `/stream` | Real-time event stream (see events above)|

---

## Frontend

### 3D Scene and Rendering

`frontend/src/scene.ts` sets up the Three.js rendering pipeline:
- WebGL renderer with antialiasing
- Perspective camera
- Post-processing effects
- Orbit controls for camera manipulation

### Graph Visualization Layers

The graph is rendered through composable layers, each responsible for a visual element:

**`NodeLayer.ts`** — Renders entities as instanced meshes (spheres, boxes, diamonds). Uses GPU instancing for performance with large graphs. Node properties are mapped to visual attributes (see encoding scheme below).

**`EdgeLayer.ts`** — Renders transaction edges as lines with width and color encoding transaction amount and risk context.

**`ClusterLayer.ts`** — Renders detected cluster boundaries and groupings.

**`AssetLayer.ts`** — Loads and displays GLB 3D assets (beacons for high-risk entities, blob meshes for clusters) fetched from the backend.

**`NodeFactory.ts`** — Factory for creating different node geometries based on entity type.

### Visual Encoding Scheme

The 3D visualization maps data attributes to spatial and visual properties:

| Visual Property  | Data Attribute              | Encoding                          |
|------------------|-----------------------------|-----------------------------------|
| Node size        | Transaction volume          | Proportional scaling              |
| Node color       | Jurisdiction bucket         | Discrete color palette (0-7)      |
| Node glow        | Risk score                  | Intensity proportional to risk    |
| Node Y position  | Risk score                  | Higher risk = higher elevation    |
| Node X position  | Jurisdiction bucket         | Lane-based horizontal layout      |
| Node Z position  | KYC level                   | Depth separation                  |
| Edge width       | Transaction amount          | Proportional thickness            |
| Edge color       | Risk context                | Risk-weighted coloring            |

### UI Components

**Upload Wizard (`wizard.ts`):**
Multi-step data upload interface. Supports JSON and CSV files with automatic format detection, column preview, and custom column mapping for non-standard CSV layouts.

**Entity Detail Panel (`panel.ts`):**
Displays selected entity information: ID, type, bank, jurisdiction, KYC level, risk score, risk reasons with detector details, evidence data, and AI-generated summaries rendered as markdown.

**Executive Dashboard (`dashboard.ts`):**
Overlay showing KPIs: high-risk entity count, new anomalies, cluster count, cross-border risk ratio. Includes risk trend visualization and jurisdiction heatmap.

**Time Slider (`slider.ts`):**
Controls the active time bucket. Scrubbing through buckets updates the entire visualization in real time.

**SAR Panel (`sarPanel.ts`):**
Displays AI-generated Suspicious Activity Report narratives for selected entities.

**Camera Presets (`camera.ts`):**
Quick-switch buttons for predefined camera positions and angles.

**Stats Overlay (`stats.ts`):**
Real-time FPS and performance metrics.

### Camera and Autopilot

**`Autopilot.ts`** provides automated camera tours through investigation targets. When activated, the camera smoothly transitions between high-risk entities and clusters, providing a guided overview of the most suspicious activity in the current time bucket.

Autopilot targets are fetched from `GET /autopilot/targets` and include both individual entities and clusters, each with a risk score, label, and investigation reason.

### API Client and WebSocket Client

**`api/client.ts`** — REST client functions for all backend endpoints. All requests are proxied through Vite's dev server (`/api` → `localhost:8000`).

**`api/ws.ts`** — WebSocket client that connects to `WS /stream` and dispatches incoming events to registered handlers for real-time UI updates (risk changes, cluster detection, agent progress).

---

## Data Formats

### Entity Schema

```json
{
  "id": "E001",
  "type": "account",
  "bank": "Bank_A",
  "jurisdiction_bucket": 3,
  "kyc_level": "standard"
}
```

| Field                | Type   | Values                                |
|----------------------|--------|---------------------------------------|
| `id`                 | string | Unique entity identifier              |
| `type`               | string | `"account"`, `"merchant"`, `"bank"`   |
| `bank`               | string | Owning bank name                      |
| `jurisdiction_bucket`| int    | Jurisdiction group (0-7)              |
| `kyc_level`          | string | `"standard"` or `"enhanced"`         |

### Transaction Schema

```json
{
  "tx_id": "TX_00001",
  "from_id": "E001",
  "to_id": "E042",
  "amount": 9500.00,
  "currency": "USD",
  "timestamp": 1700000000,
  "payment_format": "Wire",
  "is_laundering": 0,
  "bucket_index": 0
}
```

| Field           | Type   | Description                          |
|-----------------|--------|--------------------------------------|
| `tx_id`         | string | Unique transaction identifier        |
| `from_id`       | string | Sender entity ID                     |
| `to_id`         | string | Receiver entity ID                   |
| `amount`        | float  | Transaction amount                   |
| `currency`      | string | Currency code                        |
| `timestamp`     | int    | Unix timestamp                       |
| `payment_format`| string | Payment type (e.g., "Wire")          |
| `is_laundering` | int    | Ground truth label (0 or 1)          |
| `bucket_index`  | int    | Assigned time bucket                 |

### Snapshot JSON Format

The JSON upload format expects an object with `entities` and `transactions` arrays:

```json
{
  "entities": [ ... ],
  "transactions": [ ... ],
  "metadata": {
    "bucket_size_seconds": 86400,
    "sample_type": "ibm_aml"
  }
}
```

### CSV Upload Format

ANGELA supports two CSV ingestion modes:

1. **Auto-detection:** Recognizes the IBM AML dataset format with standard column headers
2. **Mapped upload:** Upload any CSV via `POST /upload/preview` (to see columns) followed by `POST /upload/mapped` with a JSON column mapping

---

## Testing

Backend tests are located in `backend/tests/test_api.py`:

```bash
cd backend
.venv/bin/python -m pytest tests/ -v
```
