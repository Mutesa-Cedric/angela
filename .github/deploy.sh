#!/bin/bash
set -e

PROJECT_DIR=$1
DATA_DIR=$2
LOGS_DIR=$3
HOST_PORT=$4
ENV_FILE=$5
BACKEND_IMAGE="angela-backend"
FRONTEND_IMAGE="angela-frontend"
BACKEND_CONTAINER="angela-backend"
FRONTEND_CONTAINER="angela-frontend"

# Use default ports if not provided or empty
HOST_PORT=${HOST_PORT:-3000}
BACKEND_PORT=${BACKEND_PORT:-8000}

echo "Using HOST_PORT=$HOST_PORT"
echo "Using BACKEND_PORT=$BACKEND_PORT"

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

# Stop and remove old containers (ignore errors if not running)
echo "Stopping old containers..."
docker stop "$BACKEND_CONTAINER" "$FRONTEND_CONTAINER" 2>/dev/null || true
docker rm "$BACKEND_CONTAINER" "$FRONTEND_CONTAINER" 2>/dev/null || true

# Small delay to ensure ports are freed
sleep 2

# Run backend
echo "Starting backend on port $BACKEND_PORT..."
docker run -d \
  --name "$BACKEND_CONTAINER" \
  -p "$BACKEND_PORT":8000 \
  -v "$DATA_DIR":/data:ro \
  -v "$LOGS_DIR":/app/logs \
  --env-file "$ENV_FILE" \
  -e ANGELA_DATA_DIR=/data/processed \
  --restart unless-stopped \
  "$BACKEND_IMAGE"

# Run frontend
echo "Starting frontend on port $HOST_PORT..."
docker run -d \
  --name "$FRONTEND_CONTAINER" \
  -p "$HOST_PORT":80 \
  --restart unless-stopped \
  "$FRONTEND_IMAGE"

# Cleanup old images
docker image prune -f

echo "Deploy complete!"
echo "Backend: http://localhost:$BACKEND_PORT"
echo "Frontend: http://localhost:$HOST_PORT"
