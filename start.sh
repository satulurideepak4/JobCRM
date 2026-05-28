#!/bin/bash
set -e
echo "Starting JobCRM..."

if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker first."
  exit 1
fi

docker compose up -d postgres
echo "Waiting for PostgreSQL..."
until docker compose exec postgres pg_isready -U jobcrm > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL ready."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi
source venv/bin/activate

# Only install if requirements.txt changed
REQ_HASH_FILE=".req_hash"
CURRENT_HASH=$(md5 -q backend/requirements.txt 2>/dev/null || md5sum backend/requirements.txt | cut -d' ' -f1)
if [ ! -f "$REQ_HASH_FILE" ] || [ "$CURRENT_HASH" != "$(cat $REQ_HASH_FILE)" ]; then
  echo "Installing Python dependencies..."
  pip install --upgrade pip -q
  pip install -r backend/requirements.txt -q
  echo "$CURRENT_HASH" > "$REQ_HASH_FILE"
else
  echo "Python dependencies up to date."
fi

# Kill anything already on our ports so restarts don't fail with EADDRINUSE
lsof -ti:4444 | xargs kill -9 2>/dev/null || true
lsof -ti:4445 | xargs kill -9 2>/dev/null || true

cd backend
uvicorn main:app --reload --port 4445 &
BACKEND_PID=$!
cd ..

cd frontend
npm install -q --legacy-peer-deps
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "JobCRM is running."
echo "Frontend: http://localhost:4444"
echo "Backend:  http://localhost:4445"
echo "API docs: http://localhost:4445/docs"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID; docker compose stop" EXIT
wait
