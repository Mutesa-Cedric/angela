#!/bin/bash
set -e

PROJECT_DIR=$1
DATA_DIR=$2
LOGS_DIR=$3
HOST_PORT=$4
ENV_FILE=$5
BACKEND_IMAGE="angela-backend"
FRONTEND_IMAGE="angela-frontend"

cd "$PROJECT_DIR"
git pull origin backend

mkdir -p "$DATA_DIR"
mkdir -p "$LOGS_DIR"

# Build backend
echo "Building backend..."
cd backend
docker build -t "$BACKEND_IMAGE" .
cd ..

# Build frontend
echo "Building frontend..."
cd frontend
docker build -t "$FRONTEND_IMAGE" .
cd ..

# Stop and remove old containers
docker stop "$BACKEND_IMAGE" "$FRONTEND_IMAGE" 2>/dev/null || true
docker rm "$BACKEND_IMAGE" "$FRONTEND_IMAGE" 2>/dev/null || true

# Run backend
echo "Starting backend..."
docker run -d \
  --name "$BACKEND_IMAGE" \
  -p 8000:8000 \
  -v "$DATA_DIR":/data:ro \
  -v "$LOGS_DIR":/app/logs \
  --env-file "$ENV_FILE" \
  -e ANGELA_DATA_DIR=/data/processed \
  --restart unless-stopped \
  "$BACKEND_IMAGE"

# Run frontend
echo "Starting frontend..."
docker run -d \
  --name "$FRONTEND_IMAGE" \
  -p "${HOST_PORT:-3000}":80 \
  --restart unless-stopped \
  "$FRONTEND_IMAGE"

# Cleanup old images
docker image prune -f

echo "Deploy complete!"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:${HOST_PORT:-3000}"
