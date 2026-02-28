import os
from pathlib import Path

# Project root is one level up from backend/
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

DATA_DIR = Path(os.getenv("ANGELA_DATA_DIR", str(PROJECT_ROOT / "data" / "processed")))
DATA_FILE = os.getenv("ANGELA_DATA_FILE", "sample_small.json")

DATA_PATH = DATA_DIR / DATA_FILE

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://angela:angela_dev@localhost:5432/angela",
)

# --- AWS Bedrock AgentCore ---
# Set ANGELA_AI_PROVIDER=bedrock_agentcore to route /agent/investigate through
# the in-process Strands Agent backed by Bedrock (Claude/Nova).
# When unset or set to "local", the existing in-process supervisor is used.
ANGELA_AI_PROVIDER = os.getenv("ANGELA_AI_PROVIDER", "local")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
