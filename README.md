<div align="center">

# ANGELA

### Anomaly Network Graph for Explainable Laundering Analysis

Agentic AI platform for anti-money laundering. 3D visualizations, multi-agent orchestra, automated SAR generation, and counterfactual explainability — all with a single natural language query.

[![Demo Video](https://img.shields.io/badge/Demo-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/oFBlPlm931c)
[![Live](https://img.shields.io/badge/Live-angela.mcedric.dev-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)](https://angela.mcedric.dev)

---

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-0.182-000000?style=for-the-badge&logo=threedotjs&logoColor=white)
![AWS Bedrock](https://img.shields.io/badge/AWS_Bedrock-Native-FF9900?style=for-the-badge&logo=amazonwebservices&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-Compatible-412991?style=for-the-badge&logo=openai&logoColor=white)
![NumPy](https://img.shields.io/badge/NumPy-1.26+-013243?style=for-the-badge&logo=numpy&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-Typed-E92063?style=for-the-badge&logo=pydantic&logoColor=white)
![Trimesh](https://img.shields.io/badge/Trimesh-4.0+-4B8BBE?style=for-the-badge)
![Marked](https://img.shields.io/badge/Marked-17.0-1a1a1a?style=for-the-badge)
![DOMPurify](https://img.shields.io/badge/DOMPurify-3.3-blue?style=for-the-badge)
![boto3](https://img.shields.io/badge/boto3-AWS_SDK-FF9900?style=for-the-badge&logo=amazonwebservices&logoColor=white)

</div>

---

## The Problem

Financial institutions process millions of transactions daily. Compliance teams manually sift through alerts, trace entity relationships, and write Suspicious Activity Reports — a process that is slow, error-prone, and doesn't scale. Existing tools are flat dashboards that lack spatial context, offer no explainability for risk scores, and require weeks of analyst training.

## The Solution

ANGELA automates the end-to-end AML investigation workflow. Upload transaction data, and a multi-agent AI pipeline identifies high-risk entities, explains *why* they're suspicious via counterfactual analysis, generates SAR narratives, and presents everything in an interactive 3D graph where risk is literally visible — height, glow, and color encode risk, jurisdiction, and volume at a glance.

## Target Users

- **AML/Compliance Analysts** — Investigate flagged entities faster with AI-assisted research and one-click SAR generation.
- **Compliance Officers & Managers** — Monitor portfolio risk via the executive dashboard with KPIs, jurisdiction heatmaps, and risk trends.
- **Financial Institutions & Fintechs** — Reduce investigation time and false positives with explainable, auditable AI decisions.
- **Regulators & Auditors** — Trace exactly which transaction patterns triggered an alert through counterfactual explainability.

---

## Team

| Name | GitHub | Role |
|------|--------|------|
| Cedric Mutesa | [@Mutesa-Cedric](https://github.com/Mutesa-Cedric) | Full-Stack, CI/CD & Deployment |
| Shah Dhairya Pankaj | [@wylited](https://github.com/wylited) | Backend, Infrastructure & DevOps |
| Huang Jack Xian Chao | [@Jack-the-Pro101](https://github.com/Jack-the-Pro101) | Backend — Agents, Risk Engine & Real-time |
| Chan Ho Yin | [@DanielChan0305](https://github.com/DanielChan0305) | UI/UX, Documentation & Pitch |

---

## Demo

[![Watch the demo](https://img.youtube.com/vi/oFBlPlm931c/maxresdefault.jpg)](https://youtu.be/oFBlPlm931c)

---

## Prerequisites

| Tool   | Version | Install                                |
|--------|---------|----------------------------------------|
| Python | 3.11+   | `pyenv install 3.11` or system install |
| Node   | 20+     | `nvm install 20` or system install     |
| pnpm   | 9+      | `npm install -g pnpm`                  |

---

## Environment Variables

Create a `.env` file in the project root. The backend loads it automatically via `python-dotenv`.

```bash
# ── Required ──────────────────────────────────────────────
OPENAI_API_KEY=your-api-key-here          # API key for your AI provider

# ── AI Provider ───────────────────────────────────────────
ANGELA_AI_API_KEY=                         # Explicit override (falls back to OPENAI_API_KEY)
ANGELA_AI_BASE_URL=https://api.openai.com/v1   # Base URL for the AI provider
ANGELA_AI_MODEL=gpt-5-mini                # Model identifier
ANGELA_AI_PROVIDER=openai_compat          # "openai_compat" or "bedrock_native"
ANGELA_AI_TIMEOUT=45.0                    # LLM request timeout (seconds)
ANGELA_AI_SAR_MAX_TOKENS=1200            # Max tokens for SAR narrative generation

# ── AWS (only needed for bedrock_native provider) ─────────
AWS_REGION=us-east-1                      # AWS region for Bedrock

# ── Data ──────────────────────────────────────────────────
ANGELA_DATA_DIR=                          # Defaults to <project_root>/data/processed
ANGELA_DATA_FILE=sample_small.json        # Default sample data filename
```

> **AWS Bedrock:** Set `ANGELA_AI_PROVIDER=bedrock_native` and ensure valid AWS credentials are available in your environment (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or an IAM role).
>
> **OpenAI-Compatible (default):** Works with any endpoint that implements the OpenAI chat completions API. Point `ANGELA_AI_BASE_URL` at your provider.

---

## Quick Start

### 1. Backend

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

### 2. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The frontend starts at **http://localhost:5173** and proxies `/api` requests to the backend at `localhost:8000`.

---

## Docker Deployment

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

The frontend image uses a multi-stage build: Node 20 for building, nginx-alpine for serving.

---

## Project Structure

```
angela/
├── backend/
│   ├── app/
│   │   ├── agents/            Multi-agent investigation system
│   │   ├── ai/                AI service layer (OpenAI / Bedrock)
│   │   ├── risk/              Risk detection engine
│   │   ├── assets/            3D GLB asset generation
│   │   ├── main.py            FastAPI entry point
│   │   ├── routes.py          API endpoints
│   │   ├── nlq.py             Natural language query engine
│   │   ├── counterfactual.py  Counterfactual risk explainer
│   │   ├── dashboard.py       Executive KPI computation
│   │   ├── clusters.py        Connected-component cluster detection
│   │   └── ws.py              WebSocket connection manager
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.ts            Application entry point
│   │   ├── scene.ts           Three.js scene and post-processing
│   │   ├── graph/             Node, edge, cluster, asset layers
│   │   ├── camera/            Autopilot investigation tours
│   │   ├── ui/                Wizard, panels, dashboard, slider
│   │   └── api/               REST + WebSocket clients
│   ├── package.json
│   └── Dockerfile
├── scripts/                   Preprocessing and utilities
├── data/
│   ├── raw/                   Raw datasets (gitignored)
│   └── processed/             Processed JSON snapshots
├── .env                       Environment variables
└── README.md
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                      Frontend                         │
│              Vite + TypeScript + Three.js              │
│    ┌──────────┐ ┌───────────┐ ┌───────────────────┐   │
│    │ 3D Graph │ │ UI Panels │ │ Camera / Autopilot│   │
│    │ Layers   │ │ Dashboard │ │ System            │   │
│    └────┬─────┘ └─────┬─────┘ └────────┬──────────┘   │
│         └─────────────┼────────────────┘              │
│                 ┌─────┴──────┐                        │
│                 │ API Client │                        │
│                 │ WS Client  │                        │
│                 └─────┬──────┘                        │
└───────────────────────┼───────────────────────────────┘
                        │ REST + WebSocket
┌───────────────────────┼───────────────────────────────┐
│                 ┌─────┴──────┐       Backend          │
│                 │  FastAPI   │                         │
│                 │  Routes    │                         │
│                 └─────┬──────┘                         │
│   ┌──────────┬────────┼────────┬──────────┐           │
│   ▼          ▼        ▼        ▼          ▼           │
│  Risk     Multi-    NLQ     Dashboard  Counter-       │
│  Engine   Agent     Engine   KPIs      factual        │
│           System                       Explainer      │
│   │          │        │                               │
│   ▼          ▼        ▼                               │
│  ┌───────────────────────┐                            │
│  │  In-Memory DataStore  │                            │
│  └───────────────────────┘                            │
│   │                                                   │
│   ▼                                                   │
│  ┌───────────────────────┐                            │
│  │  AI Service Layer     │                            │
│  │  (OpenAI / Bedrock)   │                            │
│  └───────────────────────┘                            │
└───────────────────────────────────────────────────────┘
```

---

## Key Features

**Multi-Agent Investigation** — Four specialist agents (Intake → Research → Analysis → Reporting) orchestrated by a supervisor. Type one question, get a full investigator briefing with ranked entities, AI summaries, and optional SAR narratives.

**3D Spatial Visualization** — Entities in 3D space: Y = risk score, X = jurisdiction lane, Z = KYC level. Node size = volume, glow = risk. GPU-instanced rendering handles thousands of nodes at 60fps.

**Three Risk Detectors** — Velocity anomaly (statistical), structuring detection ($9K–$10K threshold), circular flow (DFS cycle detection). Fused with explicit weights (0.4 / 0.3 / 0.3).

**Counterfactual Explainability** — "What if this entity behaved normally?" Removes suspicious edges, reruns the risk pipeline, shows the delta.

**SAR Generation** — One-click Suspicious Activity Report narratives. Hours of analyst work in seconds.

**Natural Language Queries** — Six supported intents in plain English. Ask → LLM parses → deterministic execution → 3D highlights.

**Real-Time Streaming** — WebSocket events for risk updates, cluster detection, agent progress, and asset generation.

---

## License

All rights reserved.
