#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🔴 Starting StreamClip..."

echo "📦 Starting FastAPI backend on :8000..."
cd "$ROOT/backend"
source venv/bin/activate
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "🌐 Starting Next.js frontend on :3000..."
cd "$ROOT"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ StreamClip is live!"
echo "   App     → http://localhost:3000"
echo "   API     → http://localhost:8000"
echo "   Docs    → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

cleanup() {
  echo "\n🛑 Stopping StreamClip..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM
wait
