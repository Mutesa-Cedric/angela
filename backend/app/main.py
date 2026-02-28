import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
from fastapi.middleware.cors import CORSMiddleware

from .routes import router
from .routes_cases import router as cases_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    from .database import close_db, init_db

    try:
        await init_db()
        log.info("Database initialized.")
    except Exception as exc:
        log.warning("Database not available — case persistence disabled: %s", exc)
    yield
    try:
        await close_db()
    except Exception:
        pass


app = FastAPI(
    title="ANGELA API",
    description="Anomaly Network Graph for Explainable Laundering Analysis",
    version="0.2.0",
    lifespan=lifespan,
)

origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://angela.mcedric.dev",
]

frontend_url = os.getenv("ANGELA_FRONTEND_URL")
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(cases_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# --- AgentCore Runtime contract endpoints ---
# These allow the same container to be deployed to Bedrock AgentCore Runtime.

@app.get("/ping")
async def ping() -> dict:
    return {"status": "healthy"}


@app.post("/invocations")
async def invocations(body: dict) -> dict:
    """AgentCore Runtime invocation endpoint.

    Expects: {"prompt": "...", "bucket": 0}
    """
    from .agents.strands_agent import invoke as strands_invoke

    prompt = body.get("prompt", "")
    bucket = body.get("bucket", 0)
    if not prompt:
        return {"error": "No prompt provided"}

    result = await strands_invoke(query=prompt, bucket=bucket)
    return {"output": result}
