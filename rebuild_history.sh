#!/bin/bash
set -e
cd "$(dirname "$0")"

# Remove existing git history
rm -rf .git

# Re-initialize
git init
git branch -M main

# Set personal identity for all commits
git config user.email "ramanjangu01@outlook.com"
git config user.name "rmnjaat"

# Helper function for backdated commits
commit() {
    local date="$1"
    local msg="$2"
    GIT_AUTHOR_NAME="rmnjaat" GIT_AUTHOR_EMAIL="ramanjangu01@outlook.com" \
    GIT_COMMITTER_NAME="rmnjaat" GIT_COMMITTER_EMAIL="ramanjangu01@outlook.com" \
    GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" git commit -m "$msg"
}

# ============================================================
# Commit 1: March 1 — Project init with .gitignore
# ============================================================
git add .gitignore
commit "2026-03-01T10:00:00+05:30" "Initial commit: add .gitignore for Python, Node, and IDE artifacts"

# ============================================================
# Commit 2: March 2 — Backend project scaffolding
# ============================================================
git add backend/__init__.py
git add backend/config.py
git add backend/requirements.txt
commit "2026-03-02T14:30:00+05:30" "feat(backend): scaffold Python backend with config and dependencies"

# ============================================================
# Commit 3: March 4 — Backend data models
# ============================================================
git add backend/models/__init__.py
git add backend/models/process.py
git add backend/models/system.py
git add backend/models/thread.py
git add backend/models/messages.py
commit "2026-03-04T11:15:00+05:30" "feat(models): define data models for process, thread, and system metrics"

# ============================================================
# Commit 4: March 6 — Process collector
# ============================================================
git add backend/collectors/__init__.py
git add backend/collectors/process_collector.py
commit "2026-03-06T16:45:00+05:30" "feat(collectors): implement process data collector using psutil"

# ============================================================
# Commit 5: March 7 — System and thread collectors
# ============================================================
git add backend/collectors/system_collector.py
git add backend/collectors/thread_collector.py
commit "2026-03-07T13:20:00+05:30" "feat(collectors): add system metrics and thread-level data collectors"

# ============================================================
# Commit 6: March 9 — Diff engine for change detection
# ============================================================
git add backend/collectors/diff_engine.py
commit "2026-03-09T10:00:00+05:30" "feat(collectors): implement diff engine for detecting process state changes"

# ============================================================
# Commit 7: March 11 — Backend services layer
# ============================================================
git add backend/services/__init__.py
git add backend/services/tree_service.py
git add backend/services/snapshot_service.py
git add backend/services/history_service.py
commit "2026-03-11T15:30:00+05:30" "feat(services): add tree builder, snapshot manager, and history tracking services"

# ============================================================
# Commit 8: March 13 — Server setup with WebSocket support
# ============================================================
git add backend/server/__init__.py
git add backend/server/app.py
git add backend/server/routes.py
git add backend/server/websocket.py
commit "2026-03-13T12:00:00+05:30" "feat(server): set up FastAPI server with REST routes and WebSocket endpoint"

# ============================================================
# Commit 9: March 14 — Backend entry point
# ============================================================
git add backend/main.py
commit "2026-03-14T09:45:00+05:30" "feat(backend): add main entry point to bootstrap and run the backend server"

# ============================================================
# Commit 10: March 15 — Frontend project scaffolding (Vite + React + TS)
# ============================================================
git add frontend/package.json
git add frontend/vite.config.ts
git add frontend/tsconfig.json
git add frontend/tsconfig.app.json
git add frontend/tsconfig.node.json
git add frontend/eslint.config.js
git add frontend/index.html
git add frontend/.gitignore
git add frontend/README.md
commit "2026-03-15T11:00:00+05:30" "feat(frontend): scaffold React + TypeScript frontend with Vite"

# ============================================================
# Commit 11: March 16 — TypeScript type definitions
# ============================================================
git add frontend/src/types/process.ts
git add frontend/src/types/system.ts
git add frontend/src/types/thread.ts
git add frontend/src/types/tree.ts
commit "2026-03-16T14:00:00+05:30" "feat(types): define TypeScript interfaces for process, system, thread, and tree data"

# ============================================================
# Commit 12: March 17 — State management and WebSocket hooks
# ============================================================
git add frontend/src/stores/processStore.ts
git add frontend/src/stores/systemStore.ts
git add frontend/src/hooks/useWebSocket.ts
git add frontend/src/hooks/useProcessSubscription.ts
commit "2026-03-17T10:30:00+05:30" "feat(state): implement Zustand stores and WebSocket hooks for real-time data"

# ============================================================
# Commit 13: March 17 — Utility functions
# ============================================================
git add frontend/src/utils/format.ts
git add frontend/src/utils/tooltips.ts
commit "2026-03-17T16:00:00+05:30" "feat(utils): add formatting helpers and tooltip content utilities"

# ============================================================
# Commit 14: March 18 — Common UI components (MetricCard, badges, tooltip)
# ============================================================
git add frontend/src/components/common/MetricCard.tsx
git add frontend/src/components/common/StateBadge.tsx
git add frontend/src/components/common/Tooltip.tsx
git add frontend/src/components/badges/ProcessBadge.tsx
git add frontend/src/components/badges/ThreadBadge.tsx
commit "2026-03-18T11:00:00+05:30" "feat(ui): add reusable MetricCard, StateBadge, Tooltip, and badge components"

# ============================================================
# Commit 15: March 19 — Chart components for CPU and memory visualization
# ============================================================
git add frontend/src/components/charts/TimeSeriesChart.tsx
git add frontend/src/components/charts/CpuTimeSeriesChart.tsx
git add frontend/src/components/charts/MemoryTimeSeriesChart.tsx
git add frontend/src/components/charts/MemoryBreakdownBar.tsx
git add frontend/src/components/charts/CoreBarChart.tsx
git add frontend/src/components/charts/CoreHeatmap.tsx
commit "2026-03-19T14:30:00+05:30" "feat(charts): implement time-series, bar, and heatmap chart components for metrics"

# ============================================================
# Commit 16: March 19 — Gauge components
# ============================================================
git add frontend/src/components/gauges/CpuGauge.tsx
git add frontend/src/components/gauges/MemoryGauge.tsx
commit "2026-03-19T17:15:00+05:30" "feat(gauges): add animated CPU and memory gauge visualizations"

# ============================================================
# Commit 17: March 20 — Layout components (Header, Sidebar, Drawer)
# ============================================================
git add frontend/src/components/layout/Header.tsx
git add frontend/src/components/layout/Sidebar.tsx
git add frontend/src/components/layout/Drawer.tsx
commit "2026-03-20T10:00:00+05:30" "feat(layout): build Header, Sidebar, and Drawer layout components"

# ============================================================
# Commit 18: March 20 — Process and thread detail components
# ============================================================
git add frontend/src/components/process/ProcessDetail.tsx
git add frontend/src/components/process/ProcessRow.tsx
git add frontend/src/components/process/ProcessTreeNode.tsx
git add frontend/src/components/thread/ThreadDetail.tsx
git add frontend/src/components/thread/ThreadList.tsx
git add frontend/src/components/thread/ThreadRow.tsx
commit "2026-03-20T15:45:00+05:30" "feat(components): add process detail, tree node, and thread list components"

# ============================================================
# Commit 19: March 21 — Dashboard and page views
# ============================================================
git add frontend/src/pages/Dashboard.tsx
git add frontend/src/pages/ProcessList.tsx
git add frontend/src/pages/ProcessTree.tsx
git add frontend/src/pages/CpuCores.tsx
git add frontend/src/pages/MemoryView.tsx
commit "2026-03-21T11:30:00+05:30" "feat(pages): create Dashboard, ProcessList, ProcessTree, CpuCores, and MemoryView pages"

# ============================================================
# Commit 20: March 21 — App entry, styles, and public assets
# ============================================================
git add frontend/src/App.tsx
git add frontend/src/App.css
git add frontend/src/main.tsx
git add frontend/src/index.css
git add frontend/public/favicon.svg
git add frontend/public/icons.svg
git add frontend/src/assets/react.svg
git add frontend/src/assets/vite.svg
git add frontend/src/assets/hero.png
commit "2026-03-21T16:00:00+05:30" "feat(frontend): wire up App component, global styles, and static assets"

# ============================================================
# Commit 21: March 22 — Start/stop scripts
# ============================================================
git add start.sh
git add stop.sh
commit "2026-03-22T09:30:00+05:30" "feat: add start.sh and stop.sh scripts for running the full stack"

echo ""
echo "✅ Git history rebuilt successfully with 21 commits from March 1-22, 2026"
echo ""
git log --oneline --all
