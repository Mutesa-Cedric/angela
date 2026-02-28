#!/bin/bash
set -e

# These are passed as arguments
PROJECT_DIR=$1
DATA_DIR=$2
LOGS_DIR=$3
HOST_PORT=$4
ENV_FILE=$5

# Backend branch uses docker-compose with PostgreSQL
cd "$PROJECT_DIR"
git pull origin backend

mkdir -p "$DATA_DIR"
mkdir -p "$LOGS_DIR"

# Export for docker-compose.yml substitution
export ANGELA_DATA_DIR="${DATA_DIR}"
export ANGELA_LOGS_DIR="${LOGS_DIR}"
export ANGELA_HOST_PORT="${HOST_PORT:-3000}"

# Copy env file if provided and it's not already .env
if [ -f "$ENV_FILE" ] && [ "$ENV_FILE" != ".env" ]; then
    cp "$ENV_FILE" .env
fi

# Build and deploy with docker-compose (includes postgres, backend, frontend)
docker-compose down || true
docker-compose build
docker-compose up -d

# Cleanup old images
docker image prune -f
