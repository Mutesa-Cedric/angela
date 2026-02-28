# ANGELA

**Anomaly Network Graph for Explainable Laundering Analysis**

AI-powered 3D graph intelligence platform for AML investigation.

---

## Prerequisites

| Tool   | Version | Install                                      |
|--------|---------|----------------------------------------------|
| Python | 3.11+   | `pyenv install 3.11` or system install        |
| Node   | 20+     | `nvm install 20` or system install            |
| pnpm   | 9+      | `npm install -g pnpm`                         |

---

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Verify: http://localhost:8000/health returns `{"status": "ok"}`

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Opens: http://localhost:5173 — a 3D scene with a blue cube and orbit controls.

---

## Project Structure

```
angela/
  backend/          Python FastAPI backend
  frontend/         Vite + Three.js + TypeScript frontend
  blender_mcp/      Blender asset generation service (future)
  data/raw/         Raw datasets (gitignored)
  data/processed/   Processed JSON snapshots
  scripts/          Preprocessing and utility scripts
  docs/             Project documentation and phase specs
```
