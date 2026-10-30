#!/bin/bash
# Process Visualizer — Start Script
# Starts both backend and frontend, opens browser

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Process Visualizer ==="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 not found. Install Python 3.10+."
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "Error: node not found. Install Node.js 18+."
    exit 1
fi

# Setup backend venv if needed
if [ ! -d "$SCRIPT_DIR/backend/venv" ]; then
    echo "Setting up Python virtual environment..."
    python3 -m venv "$SCRIPT_DIR/backend/venv"
    source "$SCRIPT_DIR/backend/venv/bin/activate"
    pip install -r "$SCRIPT_DIR/backend/requirements.txt"
else
    source "$SCRIPT_DIR/backend/venv/bin/activate"
fi

# Install frontend deps if needed
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd "$SCRIPT_DIR/frontend" && npm install
fi

echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│  The backend needs sudo to access all processes  │"
echo "│  (memory details, signals, file descriptors)     │"
echo "└─────────────────────────────────────────────────┘"
echo ""

# Ask for sudo upfront so the password prompt is visible
sudo -v || { echo "Error: sudo access is required to run the backend."; exit 1; }

echo ""
echo "Starting backend on http://127.0.0.1:8765..."
cd "$SCRIPT_DIR" && sudo bash -c "exec -a 'PV-Backend' '$SCRIPT_DIR/backend/venv/bin/python' -m backend.main" &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:5173..."
cd "$SCRIPT_DIR/frontend" && exec -a 'PV-Frontend' npx vite &
FRONTEND_PID=$!

# Wait for servers to start
sleep 3

# Open browser (macOS)
if command -v open &> /dev/null; then
    open "http://localhost:5173"
fi

echo ""
echo "Process Visualizer is running!"
echo "  Dashboard: http://localhost:5173"
echo "  Backend:   http://127.0.0.1:8765"
echo ""
echo "Press Ctrl+C to stop."

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    wait
    echo "Done."
}
trap cleanup EXIT INT TERM

wait
