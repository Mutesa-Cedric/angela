#!/bin/bash
set -e

# These are passed as arguments
PROJECT_DIR=$1
DATA_DIR=$2
LOGS_DIR=$3
HOST_PORT=$4
ENV_FILE=$5
CONTAINER_NAME="angela-api"

cd "$PROJECT_DIR"
git pull origin main
cd backend

mkdir -p "$DATA_DIR"
mkdir -p "$LOGS_DIR"

docker build -t "$CONTAINER_NAME" .

docker stop "$CONTAINER_NAME" || true
docker rm "$CONTAINER_NAME" || true

docker run -d \
  -p "$HOST_PORT":8000 \
  -v "$DATA_DIR":/app/data \
  -v "$LOGS_DIR":/app/logs \
  --env-file "$ENV_FILE" \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  "$CONTAINER_NAME"
