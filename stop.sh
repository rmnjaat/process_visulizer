#!/bin/bash
# Process Visualizer — Stop Script
# Kills any running backend/frontend processes

echo "Stopping Process Visualizer..."

# Kill uvicorn (backend)
pkill -f "python -m backend.main" 2>/dev/null && echo "  Backend stopped." || echo "  Backend not running."

# Kill vite dev server (frontend)
pkill -f "vite" 2>/dev/null && echo "  Frontend stopped." || echo "  Frontend not running."

echo "Done."
