# Process Visualizer

A real-time process monitoring and visualization tool that provides deep insight into your operating system's running processes, threads, CPU, and memory — similar to Activity Monitor / htop but with a modern web UI.

**Tech Stack:** Python (FastAPI) backend + React (TypeScript) frontend, communicating via REST API and WebSocket.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Backend Deep Dive](#backend-deep-dive)
  - [Directory Structure](#directory-structure)
  - [Entry Point](#entry-point)
  - [Configuration](#configuration)
  - [Data Collection Layer (Collectors)](#data-collection-layer-collectors)
  - [Data Models (Pydantic Schemas)](#data-models-pydantic-schemas)
  - [Service Layer](#service-layer)
  - [Server Layer (API + WebSocket)](#server-layer-api--websocket)
  - [Diff Engine (Efficient Updates)](#diff-engine-efficient-updates)
- [API Reference](#api-reference)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket Protocol](#websocket-protocol)
- [Data Flow](#data-flow)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│                  http://localhost:5173                    │
└──────────┬──────────────────────────────┬───────────────┘
           │  REST (one-time queries)     │  WebSocket (real-time stream)
           │  GET /api/*                  │  WS /ws
           ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                 Backend (FastAPI + Uvicorn)              │
│                  http://localhost:8765                    │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   Routes     │  │  WebSocket   │  │  App Lifespan  │  │
│  │  (REST API)  │  │  (real-time) │  │ (broadcast loop│  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                   │           │
│         ▼                 ▼                   ▼           │
│  ┌──────────────────────────────────────────────────┐    │
│  │              Service Layer                        │    │
│  │  SnapshotService · HistoryService · TreeService   │    │
│  └──────────────────────┬───────────────────────────┘    │
│                         │                                 │
│                         ▼                                 │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Collector Layer + DiffEngine             │    │
│  │  SystemCollector · ProcessCollector · ThreadCollector│   │
│  └──────────────────────┬───────────────────────────┘    │
│                         │                                 │
│                         ▼                                 │
│                ┌─────────────────┐                        │
│                │     psutil      │                        │
│                │  (OS syscalls)  │                        │
│                └─────────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

The backend follows a **layered architecture**:

1. **Collectors** — gather raw data from the OS via `psutil`
2. **Services** — orchestrate collectors, compute diffs, maintain history
3. **Server** — expose data via REST endpoints and a WebSocket broadcast loop

---

## Backend Deep Dive

### Directory Structure

```
backend/
├── main.py                     # Entry point — starts Uvicorn server
├── config.py                   # Pydantic settings (env vars)
├── requirements.txt            # Python dependencies
│
├── collectors/                 # Raw data collection from the OS
│   ├── process_collector.py    # Per-process metrics (CPU, memory, I/O, etc.)
│   ├── system_collector.py     # System-wide metrics (CPU cores, RAM, swap)
│   ├── thread_collector.py     # Per-thread metrics for a given PID
│   └── diff_engine.py          # Computes deltas between consecutive snapshots
│
├── models/                     # Pydantic data models (schemas)
│   ├── process.py              # ProcessSnapshot
│   ├── system.py               # SystemSnapshot, CpuSnapshot, MemorySnapshot
│   ├── thread.py               # ThreadSnapshot
│   └── messages.py             # ProcessDiff (new/updated/exited processes)
│
├── server/                     # HTTP + WebSocket layer
│   ├── app.py                  # FastAPI app factory, lifespan, broadcast loop
│   ├── routes.py               # REST API endpoint definitions
│   └── websocket.py            # WebSocket endpoint + ConnectionManager
│
└── services/                   # Business logic orchestration
    ├── snapshot_service.py     # Collects a full tick of data + diff computation
    ├── history_service.py      # Rolling buffer of recent system snapshots
    └── tree_service.py         # Builds parent-child process trees
```

### Entry Point

[main.py](backend/main.py) is the entry point. It imports the FastAPI app from `server/app.py` and starts Uvicorn:

```python
uvicorn.run(app, host=settings.host, port=settings.port)
```

The server binds to `0.0.0.0:8765` by default (configurable via `PV_HOST` / `PV_PORT`).

### Configuration

[config.py](backend/config.py) uses Pydantic Settings to define all configurable parameters. Every setting can be overridden via environment variables prefixed with `PV_`:

| Environment Variable       | Default  | Description                                    |
|----------------------------|----------|------------------------------------------------|
| `PV_POLL_INTERVAL_MS`     | `1000`   | How often the server broadcasts updates (ms)   |
| `PV_HISTORY_BUFFER_SIZE`  | `300`    | Number of system snapshots kept in memory       |
| `PV_HOST`                 | `0.0.0.0`| Server bind address                            |
| `PV_PORT`                 | `8765`   | Server port                                     |
| `PV_COLLECT_THREADS`      | `true`   | Whether thread collection is enabled            |
| `PV_MAX_PROCESSES`        | `1000`   | Max processes to track (sorted by CPU usage)    |

---

### Data Collection Layer (Collectors)

The collectors are the heart of the backend. They interface with the OS through `psutil` to extract real-time metrics.

#### ProcessCollector — [process_collector.py](backend/collectors/process_collector.py)

Iterates over all running processes via `psutil.process_iter()` and extracts **40+ fields** per process:

- **Identity:** PID, PPID, name, executable path, command line, status, username, creation time
- **CPU:** per-core %, total %, user/system time, children times, I/O wait
- **Memory:** RSS, VMS, shared, text, data, lib, dirty bytes; USS (Unique Set Size), PSS (Proportional Set Size)
- **I/O:** read/write counts and bytes
- **Scheduling:** nice value, voluntary/involuntary context switches
- **Descriptors:** open file descriptor count, network connection count, open files count

**Key implementation details:**
- Uses `proc.oneshot()` context manager to batch all system calls for a single process into one read, significantly reducing overhead
- A `_safe()` helper wraps every attribute access, catching `AccessDenied`, `NoSuchProcess`, `ZombieProcess` and returning sensible defaults (0, empty string, etc.)
- Results are capped to `PV_MAX_PROCESSES` processes, sorted by CPU usage

#### SystemCollector — [system_collector.py](backend/collectors/system_collector.py)

Collects machine-wide metrics:

- **CPU:** per-core usage %, total usage %, frequency (current/min/max MHz), physical & logical core counts, processor model
- **Memory:** total, available, used, free, cached, buffered, shared bytes + swap stats
- **System:** hostname, OS name, uptime, load average

**macOS-specific handling:** On macOS, the collector shells out to `vm_stat` to obtain wired, compressed, active, inactive, and purgeable memory — data not available through psutil alone. Used memory is recalculated as `total - available` to match Activity Monitor's numbers.

#### ThreadCollector — [thread_collector.py](backend/collectors/thread_collector.py)

Collects per-thread metrics for a **specific PID** (on-demand only):

- Thread ID (TID), synthesized thread name, CPU user/system times
- Priority, nice value, core affinity (platform-dependent)
- Context switches (limited on macOS)

Threads are only collected for PIDs the client has **subscribed to** via WebSocket, avoiding unnecessary overhead.

---

### Data Models (Pydantic Schemas)

All data flowing through the backend is validated and serialized via Pydantic models.

#### ProcessSnapshot — [process.py](backend/models/process.py)

```
Fields: pid, ppid, name, exe, cmdline, status, username, create_time,
        cpu_percent, cpu_time_user, cpu_time_system, cpu_time_children_*,
        cpu_time_iowait, memory_rss_bytes, memory_vms_bytes, memory_shared_bytes,
        memory_text_bytes, memory_data_bytes, memory_percent, memory_uss_bytes,
        memory_pss_bytes, num_threads, nice, io_read_count, io_write_count,
        io_read_bytes, io_write_bytes, ctx_switches_voluntary,
        ctx_switches_involuntary, num_fds, num_connections, num_open_files
```

#### SystemSnapshot — [system.py](backend/models/system.py)

Contains nested `CpuSnapshot` and `MemorySnapshot` objects plus hostname, OS, uptime, and load average.

- **CpuSnapshot:** model, physical/logical cores, frequency, per-core usage array, total usage
- **MemorySnapshot:** all standard + macOS-specific memory fields + swap

#### ThreadSnapshot — [thread.py](backend/models/thread.py)

```
Fields: tid, pid, name, state, cpu_time_user, cpu_time_system, cpu_percent,
        priority, nice, core_id, voluntary_ctx_switches,
        involuntary_ctx_switches, stack_size_bytes
```

#### ProcessDiff — [messages.py](backend/models/messages.py)

```
Fields: new (list[ProcessSnapshot]), updated (list[dict]), exited (list[dict])
```

---

### Service Layer

Services sit between collectors and the server, orchestrating data flow.

#### SnapshotService — [snapshot_service.py](backend/services/snapshot_service.py)

The main orchestrator. On each tick:
1. Calls `SystemCollector.collect()` for system metrics
2. Calls `ProcessCollector.collect_all()` for process metrics
3. Calls `ThreadCollector.collect()` for each subscribed PID
4. Feeds process data into the `DiffEngine` to compute changes
5. Returns a complete tick payload (system + processes/diff + threads)

#### HistoryService — [history_service.py](backend/services/history_service.py)

Maintains a **rolling buffer** (default: 300 entries) of `SystemSnapshot` objects. This allows the frontend to render time-series charts for CPU and memory usage without needing a database.

#### TreeService — [tree_service.py](backend/services/tree_service.py)

Builds a **hierarchical process tree** from flat process lists using PPID (parent PID) relationships. Supports:
- Full tree (all processes)
- Subtree rooted at a specific PID
- Tree nodes enriched with thread data

---

### Server Layer (API + WebSocket)

#### App Factory — [app.py](backend/server/app.py)

- Creates the FastAPI application with CORS middleware (allows `localhost:5173` for the frontend dev server)
- Manages the **application lifespan**: starts a background broadcast loop on startup, cancels it on shutdown
- The **broadcast loop** runs continuously, calling `SnapshotService.tick()` at the configured interval and pushing results to all connected WebSocket clients
- Custom JSON serializer handles non-standard types (datetime, set, bytes)

#### Routes — [routes.py](backend/server/routes.py)

Defines all REST endpoints under the `/api` prefix. Each route calls into the service layer and returns Pydantic-validated JSON.

#### WebSocket Manager — [websocket.py](backend/server/websocket.py)

- `ConnectionManager` tracks all active WebSocket connections
- Handles client commands (subscribe, unsubscribe, set_interval)
- Broadcasts tick data to all clients, auto-removing dead connections
- First message to a new client is always a full snapshot; subsequent messages are diffs

---

### Diff Engine (Efficient Updates)

[diff_engine.py](backend/collectors/diff_engine.py) is key to performance. Instead of sending the full process list every tick, it compares consecutive snapshots and sends only what changed:

**How it works:**
1. Maintains a baseline (previous tick's process list)
2. On each new tick, compares every process to its baseline
3. Produces three categories:
   - **`new`** — processes that didn't exist in the previous tick (full snapshot sent)
   - **`updated`** — processes whose volatile fields changed (only changed fields + PID sent)
   - **`exited`** — processes that disappeared (PID + name sent)

**Volatile fields tracked:** `cpu_percent`, `memory_rss_bytes`, `memory_vms_bytes`, `memory_percent`, `num_threads`, `status`, `cpu_time_user`, `cpu_time_system`, `io_read_count`, `io_write_count`, `io_read_bytes`, `io_write_bytes`, `ctx_switches_voluntary`, `ctx_switches_involuntary`, `num_connections`, `num_open_files`, `num_fds`

This reduces WebSocket payload size by **80-95%** after the initial snapshot.

---

## API Reference

### REST Endpoints

All endpoints are prefixed with `/api`.

| Method | Path                        | Description                                    |
|--------|-----------------------------|------------------------------------------------|
| GET    | `/api/health`               | Health check — returns `{"status": "ok", "pid": <pid>}` |
| GET    | `/api/system`               | Full system snapshot (CPU, memory, load avg)   |
| GET    | `/api/processes`            | List all processes with metrics                 |
| GET    | `/api/processes/{pid}`      | Detailed info for one process (files, connections, env vars, extended memory) |
| GET    | `/api/processes/{pid}/threads` | Thread list for a process                   |
| GET    | `/api/tree`                 | Full hierarchical process tree                  |
| GET    | `/api/tree/{pid}`           | Subtree rooted at a specific PID (with threads) |

### WebSocket Protocol

**Endpoint:** `ws://localhost:8765/ws`

#### Server Messages

**Full Snapshot** (sent on first connection):
```json
{
  "type": "snapshot",
  "system": { "cpu": {...}, "memory": {...}, "hostname": "...", ... },
  "processes": [ { "pid": 1, "name": "init", "cpu_percent": 0.1, ... }, ... ],
  "threads": {}
}
```

**Differential Update** (sent on subsequent ticks):
```json
{
  "type": "diff",
  "system": { "cpu": {...}, "memory": {...}, ... },
  "diff": {
    "new": [ { "pid": 5678, "name": "node", ... } ],
    "updated": [ { "pid": 1234, "cpu_percent": 2.5, "memory_rss_bytes": 10485760 } ],
    "exited": [ { "pid": 9999, "name": "old_process" } ]
  },
  "threads": { "1234": [ { "tid": 100, "cpu_time_user": 0.5, ... } ] }
}
```

#### Client Commands

| Command | Payload | Description |
|---------|---------|-------------|
| Subscribe to process threads | `{"action": "subscribe_process", "pid": 1234}` | Start collecting thread data for PID |
| Unsubscribe from process | `{"action": "unsubscribe_process", "pid": 1234}` | Stop thread collection for PID |
| Change update interval | `{"action": "set_interval", "interval_ms": 500}` | Set broadcast interval (min 100ms) |

---

## Data Flow

Here's what happens on each tick of the broadcast loop:

```
1. Timer fires (every PV_POLL_INTERVAL_MS)
       │
       ▼
2. SnapshotService.tick()
       │
       ├──► SystemCollector.collect()        → SystemSnapshot
       ├──► ProcessCollector.collect_all()   → list[ProcessSnapshot]
       ├──► ThreadCollector.collect(pid)     → list[ThreadSnapshot]  (for each subscribed PID)
       │
       ▼
3. DiffEngine.compute(new_processes, old_processes)
       │
       ├──► new:     processes that just appeared
       ├──► updated: processes with changed volatile fields (only deltas)
       └──► exited:  processes that terminated
       │
       ▼
4. ConnectionManager.broadcast(payload)
       │
       └──► Send JSON to every connected WebSocket client
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+ (for the frontend)

### Quick Start

```bash
# Start both backend and frontend
./start.sh

# Or start them individually:

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py

# Frontend
cd frontend
npm install
npm run dev
```

The backend runs on `http://localhost:8765` and the frontend on `http://localhost:5173`.

### Stop

```bash
./stop.sh
```

---

## Environment Variables

All backend settings can be overridden via environment variables prefixed with `PV_`:

```bash
# Example: faster updates, more history, custom port
PV_POLL_INTERVAL_MS=500 PV_HISTORY_BUFFER_SIZE=600 PV_PORT=9000 python backend/main.py
```

See the [Configuration](#configuration) section for the full list.
