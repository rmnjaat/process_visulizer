# Backend Module Index

**Total modules (packages):** 5
**Total Python files:** 17 (excluding `__init__.py`)
**Total REST API endpoints:** 7
**Total WebSocket endpoints:** 1

---

## Module Breakdown

### 1. `backend/` (root) — 2 files
| File | Purpose |
|------|---------|
| `main.py` | Entry point. Starts the Uvicorn server with settings. |
| `config.py` | `Settings` class (via pydantic-settings). Reads `PV_*` env vars for poll interval, host, port, etc. |

### 2. `backend/collectors/` — 4 files
Data collection layer. Reads live OS metrics via `psutil`.

| File | Purpose |
|------|---------|
| `process_collector.py` | Collects per-process snapshots (CPU%, RSS, VMS, I/O, FDs, etc.) for all or a single process. |
| `system_collector.py` | Collects system-wide metrics — CPU cores/freq, memory breakdown (incl. macOS `vm_stat`), swap, load avg. |
| `thread_collector.py` | Collects per-thread metrics for a given PID (macOS). Tracks CPU deltas between ticks. |
| `diff_engine.py` | Computes diffs between two ticks — new processes, exited processes, and changed fields on existing ones. |

### 3. `backend/models/` — 4 files
Pydantic data models (schemas).

| File | Purpose |
|------|---------|
| `process.py` | `ProcessSnapshot` — identity, CPU, memory, I/O, context switches, FDs, connections. |
| `system.py` | `CpuSnapshot`, `MemorySnapshot`, `SystemSnapshot` — system-wide CPU, RAM, swap, load. |
| `thread.py` | `ThreadSnapshot` — per-thread TID, CPU times, state, core affinity, stack size. |
| `messages.py` | `ProcessDiff` — the wire format for incremental tick updates (new/updated/exited). |

### 4. `backend/server/` — 3 files
FastAPI application and networking.

| File | Purpose |
|------|---------|
| `app.py` | App factory (`create_app`), CORS middleware, lifespan (startup/shutdown), broadcast loop. |
| `routes.py` | REST API router — all `/api/*` endpoints (see API table below). |
| `websocket.py` | `ConnectionManager` + WebSocket endpoint. Handles connect/disconnect, subscribe/unsubscribe, broadcast. |

### 5. `backend/services/` — 3 files
Business logic / orchestration.

| File | Purpose |
|------|---------|
| `snapshot_service.py` | Orchestrates per-tick collection — calls collectors, runs diff engine, manages subscriptions. |
| `history_service.py` | Rolling deque buffer of `SystemSnapshot` objects (default 300) for time-series charts. |
| `tree_service.py` | Builds hierarchical parent-child process tree (with optional thread leaves) from flat snapshot lists. |

---

## API Endpoints (8 total)

### REST — 7 endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check — returns `{ status, pid }`. |
| `GET` | `/api/system` | Full system snapshot (CPU, memory, swap, load). |
| `GET` | `/api/processes` | List all processes with metrics. |
| `GET` | `/api/processes/{pid}` | Single process detail (+ open files, connections, env vars, USS/PSS). |
| `GET` | `/api/processes/{pid}/threads` | List threads for a given process. |
| `POST` | `/api/processes/{pid}/signal` | Send a signal (SIGTERM/SIGKILL/SIGSTOP/SIGCONT) to a process. |
| `GET` | `/api/tree` | Full process tree (hierarchical). |
| `GET` | `/api/tree/{pid}` | Subtree rooted at a specific PID (with threads). |

### WebSocket — 1 endpoint

| Path | Description |
|------|-------------|
| `/ws` | Real-time streaming. Sends full snapshot on connect, then incremental diffs every tick. Supports client commands: `subscribe_process`, `unsubscribe_process`, `set_interval`. |
