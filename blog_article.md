# I Built a Real-Time Process Monitor From Scratch — Here's What I Learned About OS Internals and System Design

I was studying operating system internals — processes, threads, CPU scheduling, virtual memory — and I hit a wall. Reading textbooks about "context switches" and "page tables" felt abstract. I'd open Activity Monitor on my Mac, stare at the numbers, and think: *I have no idea what half of these mean, and I definitely can't see how they change over time.*

So I did what any developer would do when they're frustrated with existing tools. I built my own.

This is the story of **Process Visualizer** — a real-time process monitoring tool I built from scratch. Not because the world needs another htop clone, but because building one taught me more about operating systems than any textbook ever could.

This article is mostly about the backend, the OS-level challenges, and the system design decisions. The frontend is just a React app consuming the data — the real complexity lives in figuring out *how to collect, diff, and stream 40+ metrics per process every second without melting your machine.*

---

## The Problem With Existing Tools

Let me be honest about what bothered me.

**Activity Monitor** gives you a table of processes with CPU and memory percentages. That's it. No historical trends. No per-core breakdown. No way to see how a process's memory footprint evolves over time. You can't see thread-level details without digging through terminal commands. And it certainly doesn't teach you what any of the numbers mean.

**htop** is better — it's the power user's choice. But it's still a terminal UI. There's no easy way to stream the data elsewhere, build charts on top of it, or extend it with your own views.

**The `/proc` filesystem (Linux) and `sysctl` (macOS)** give you raw access to everything, but the data is scattered across dozens of files and syscalls. Reading `/proc/{pid}/stat`, `/proc/{pid}/status`, `/proc/{pid}/io`, `/proc/{pid}/fd/` for *every* running process, parsing each one, computing deltas — it's a lot of plumbing before you get anything useful.

What I wanted was a system that could:
- Collect deep OS metrics (not just CPU % and memory, but I/O counters, context switches, file descriptors, threads, memory breakdowns)
- Stream them efficiently in real time
- Handle hundreds of processes without becoming a bottleneck itself

That's a system design problem, not a UI problem. So that's what I focused on.

---

## Understanding What the OS Actually Exposes

Before writing any code, I needed to understand what data the operating system actually gives you — and how expensive it is to read.

### Where Process Data Lives

On Linux, every running process gets a directory under `/proc/{pid}/`. Inside it:

- `/proc/{pid}/stat` — CPU times, state, priority, threads, start time (single line, space-delimited, annoyingly dense)
- `/proc/{pid}/status` — Human-readable version of stat, plus memory details (VmRSS, VmSize, etc.)
- `/proc/{pid}/io` — Read/write bytes, read/write syscall counts
- `/proc/{pid}/fd/` — Directory of symlinks, one per open file descriptor
- `/proc/{pid}/task/` — One subdirectory per thread

On macOS, there's no `/proc`. Instead, you use `sysctl` calls, `proc_info` syscalls, and Mach APIs. The data is similar but the access patterns are completely different.

This is where **psutil** saves you. It abstracts over both platforms and gives you clean Python objects. But understanding what's underneath matters, because it tells you *what's cheap and what's expensive*.

### The Cost Model

Not all data is equally cheap to collect:

| Data | How it's read | Cost |
|------|--------------|------|
| CPU % (per process) | `/proc/{pid}/stat` | Cheap — one file read |
| Memory (RSS, VMS) | `/proc/{pid}/status` | Cheap — one file read |
| I/O counters | `/proc/{pid}/io` | Cheap — one file read |
| Open file descriptors | `readdir` on `/proc/{pid}/fd/` | Medium — scales with FD count |
| Network connections | `/proc/net/tcp` + per-process matching | Expensive — full table scan |
| Thread details | `readdir` + read each `/proc/{pid}/task/{tid}/stat` | Expensive — scales with thread count |
| Open files (paths) | `readlink` each `/proc/{pid}/fd/{n}` | Expensive — one syscall per FD |
| Environment variables | `/proc/{pid}/environ` | Medium — can be large |

This cost model drove most of my architecture decisions. Cheap data gets streamed every second. Expensive data gets fetched on demand.

---

## The Architecture

Here's the system I ended up with:

```
  Clients (browser, CLI, anything)
     │
     ├── REST  ──→  /api/processes/{pid}    (expensive, on-demand queries)
     │
     └── WebSocket ──→  /ws                 (real-time streaming, 1 tick/sec)
                         │
                FastAPI + Uvicorn (async)
                         │
                ┌────────┴─────────┐
                │  Service Layer   │
                │  SnapshotService │──→ orchestrates each tick
                │  HistoryService  │──→ rolling buffer (last 300 snapshots)
                │  TreeService     │──→ builds pid → ppid tree
                └────────┬─────────┘
                         │
                ┌────────┴─────────┐
                │  Collector Layer │
                │  ProcessCollector│──→ 30+ fields per process
                │  SystemCollector │──→ CPU cores, memory, load avg
                │  ThreadCollector │──→ per-thread stats (on demand)
                │  DiffEngine      │──→ computes deltas between ticks
                └────────┬─────────┘
                         │
                      psutil
                    (OS syscalls)
```

Three layers, each with a clear job:

**Collectors** talk to the OS. They call psutil, parse the raw data, and return typed Pydantic models. They know nothing about WebSocket, REST, or clients.

**Services** orchestrate the collectors. The `SnapshotService` runs the main tick loop — every second, it calls the collectors, feeds the results through the diff engine, and hands the output to the server layer. The `HistoryService` keeps a ring buffer of the last 300 system snapshots for time-series charts. The `TreeService` builds the process tree by mapping each PID to its parent PID.

**Server** handles communication. REST routes for on-demand queries. A WebSocket endpoint that broadcasts diffs to all connected clients. A connection manager that tracks active clients and cleans up dead ones.

This separation matters. When I needed to optimize collection performance, I only touched the collector layer. When I changed the WebSocket protocol, nothing in the collectors changed. When I added history tracking, I added a new service without modifying anything else.

---

## The Diff Engine — The Core Design Decision

This is the heart of the system, and the part I'm most proud of.

### The Problem

A typical macOS or Linux machine runs 500-1000 processes. Each process has 30+ fields. Serializing all of that to JSON every second produces a payload around 500KB. At one tick per second, that's 500KB/s per connected client. If three people have the dashboard open, that's 1.5MB/s of WebSocket traffic. For a monitoring tool. That's absurd.

### The Insight

Here's the thing — most processes barely change between ticks. A sleeping `sshd` process has the same memory, the same thread count, the same I/O counters it had a second ago. Maybe its CPU percentage flipped from 0.0 to 0.1, or maybe nothing changed at all. Why send the entire object?

### The Solution

I built a diff engine that compares each tick against the previous one and categorizes every process into one of three buckets:

```python
current_pids = set(current_snapshot.keys())
previous_pids = set(previous_snapshot.keys())

new = current_pids - previous_pids           # appeared this tick → send full snapshot
exited = previous_pids - current_pids         # gone this tick → send just PID + name
still_running = current_pids & previous_pids  # existed before → send only changed fields
```

For processes in the `still_running` set, I don't compare every field. I only check 17 "volatile fields" — the ones that actually change between ticks:

```
cpu_percent, cpu_time_user, cpu_time_system,
memory_rss, memory_vms, memory_percent,
num_threads, status,
io_read_count, io_write_count, io_read_bytes, io_write_bytes,
ctx_switches_voluntary, ctx_switches_involuntary,
num_connections, num_fds, num_open_files
```

If a process's volatile fields haven't changed, it's excluded from the message entirely. If only `cpu_percent` and `memory_rss` changed, I send just those two fields plus the PID — not the full 30-field object.

### The Result

After the initial full snapshot, subsequent messages are **80-95% smaller**. A typical tick sends 10-50KB instead of 500KB. The system feels instant, and the bandwidth overhead is negligible.

This is a pattern I've seen in game networking (delta compression) and database replication (change data capture), but I'd never implemented it myself. Building it from scratch made the tradeoffs concrete: you're trading CPU time (for comparison) against bandwidth (for transmission). For this use case, the CPU cost is trivial and the bandwidth savings are enormous.

---

## Hybrid Protocol: When to Stream, When to Query

Not everything belongs on the WebSocket.

The streaming channel carries **high-frequency, low-detail** data: CPU percentages, memory usage, process state changes. This is the data that changes every second and that every client cares about.

But when you want to inspect a specific process — its open files, network connections, environment variables, command-line arguments — that's **low-frequency, high-detail** data. Only one client cares about it, and they only care right now.

So that goes through REST:

```
GET /api/processes/{pid}        → full process detail + open files, connections, env
GET /api/processes/{pid}/threads → thread-level breakdown
GET /api/tree                    → full process tree (parent-child hierarchy)
GET /api/system                  → complete system snapshot
```

This split keeps the WebSocket payload lean. It also means the backend doesn't waste cycles collecting expensive data (open files, network connections) for processes nobody is looking at.

---

## The Thread Subscription Problem

Threads were the most expensive thing to collect, and they forced me to rethink how the backend decides *what* to collect.

### Why Threads Are Expensive

A single Chrome process can have 30+ threads. A Java application server might have 200+. If I collected thread info for all 500 running processes, I'd be walking 5,000-10,000 thread entries per tick. Each thread requires reading `/proc/{pid}/task/{tid}/stat` — that's a separate file read per thread.

At one tick per second, this would dominate the collection cycle. The monitoring tool would itself become a significant CPU consumer. A process monitor that hogs your CPU is a bad process monitor.

### The Solution: Demand-Driven Collection

Threads are collected **only for processes a client has explicitly subscribed to**. When a user opens the detail view for a specific process, the client sends a WebSocket command:

```json
{ "type": "subscribe_process", "pid": 1234 }
```

The backend adds PID 1234 to its thread collection set. On the next tick, `ThreadCollector` gathers thread data for that PID and includes it in the WebSocket message. When the user closes the detail view:

```json
{ "type": "unsubscribe_process", "pid": 1234 }
```

The PID is removed from the collection set. Thread collection overhead drops back to zero.

This is essentially a **pub/sub model scoped to individual processes**. The backend does zero thread work by default and scales linearly with the number of processes being actively inspected — which is almost always just one or two.

---

## Squeezing Performance Out of psutil

Here's something that surprised me. Each psutil method call — `cpu_percent()`, `memory_info()`, `io_counters()` — triggers a separate read of `/proc/{pid}/stat` (on Linux) or the equivalent syscall on macOS.

For a single process, calling all the methods I needed would trigger 40+ syscalls. Multiply by 500 processes. That's 20,000 syscalls per tick. At one tick per second, that's… a lot of kernel transitions.

### Batching with `oneshot()`

psutil has an elegant solution: the `oneshot()` context manager.

```python
with process.oneshot():
    cpu = process.cpu_percent()
    mem = process.memory_info()
    io = process.io_counters()
    threads = process.num_threads()
    status = process.status()
    # All of this from ~3 syscalls instead of 40+
```

Inside a `oneshot()` block, psutil reads the underlying file (e.g., `/proc/{pid}/stat`) once on the first method call and caches the parsed result. Subsequent calls within the same block are served from cache.

This single optimization cut my per-process collection time by roughly **10x**. For 500 processes, that's the difference between a collection cycle taking 50ms vs 500ms — the difference between "imperceptible" and "visible lag."

### Safe Error Handling for Processes That Vanish

Processes can exit at any moment. Between the time you call `psutil.process_iter()` and the time you read a specific process's memory info, that process might be gone. Or it might be owned by root, and you don't have permission.

psutil throws three exceptions you need to handle:
- `NoSuchProcess` — the process exited between calls
- `AccessDenied` — you don't have permission (common without sudo)
- `ZombieProcess` — the process is in zombie state (exited but not yet reaped by parent)

I wrapped every metric collection call in a `_safe()` helper that catches all three and returns a sensible default (0 for numbers, empty string for text). This means a single rogue process can't crash the entire collection cycle. The collector keeps going and just reports zeros for the fields it couldn't read.

---

## The macOS Memory Puzzle

This one taught me more about how operating systems manage memory than anything else in the project.

I wanted the memory breakdown to match Activity Monitor exactly — showing **wired memory**, **compressed memory**, **app memory**, and **cached files**. But psutil doesn't expose these categories on macOS.

### Why macOS Memory Is Different

On Linux, memory is broken down into categories like `used`, `free`, `buffers`, `cached`, and `available`. These map cleanly to fields in `/proc/meminfo`.

macOS uses a fundamentally different memory model based on Mach virtual memory:

- **Wired** — Memory that cannot be paged out. Kernel structures, device drivers, critical data structures. This memory is always in physical RAM.
- **Active** — Memory recently used and currently in RAM.
- **Inactive** — Memory not recently used but still in RAM. Can be reclaimed quickly if needed.
- **Compressed** — macOS compresses inactive pages instead of immediately paging to disk. This is a huge performance win — decompression is faster than a disk read.
- **Purgeable** — Memory the app has marked as "nice to have but not essential." The OS can reclaim it instantly without paging.
- **App Memory** — Computed as: `internal - purgeable`. This is what Activity Monitor shows as the app's "real" memory footprint.

### The `vm_stat` Hack

psutil can't give you these breakdowns. But the `vm_stat` command-line tool can:

```
$ vm_stat
Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                              123456.
Pages active:                            234567.
Pages inactive:                          345678.
Pages speculative:                        12345.
Pages throttled:                              0.
Pages wired down:                        456789.
Pages purgeable:                          23456.
Pages occupied by compressor:            567890.
```

Each number is in pages. On Apple Silicon, a page is 16,384 bytes. So I shell out to `vm_stat`, parse the page counts with a regex, multiply by the page size, and get the exact same breakdown Activity Monitor shows.

```python
output = subprocess.check_output(["vm_stat"]).decode()
# Parse "Pages wired down: 456789." → 456789 * 16384 bytes
```

Is it a hack? Sure. Does it work perfectly and produce numbers that match Activity Monitor to the byte? Yes. And building this parser taught me exactly what "memory pressure" means on macOS — it's not about how much memory is "used," it's about the ratio of wired + compressed to total physical RAM.

---

## Process Sampling: You Can't Monitor Everything

A production Linux server can run 2,000+ processes. Collecting 30+ fields for every single one, diffing them, serializing to JSON, and broadcasting over WebSocket — at some point, you hit a wall.

My solution: **cap the process list and prioritize by CPU usage.**

```python
all_processes = list(psutil.process_iter())
all_processes.sort(key=lambda p: p.cpu_percent(), reverse=True)
tracked = all_processes[:MAX_PROCESSES]  # default: 1000
```

The processes consuming the most CPU are almost always the ones you care about. The 500 idle system daemons using 0.0% CPU? They're still running, but they're not in the monitored set.

This is configurable via environment variable (`PV_MAX_PROCESSES`), so you can crank it up if you need to see everything and have the CPU budget for it.

---

## The Broadcast Loop: Ticking Every Second

The core of the backend is an async loop that runs once per second:

1. **Collect** — `SnapshotService` calls all collectors. `SystemCollector` grabs CPU/memory/load. `ProcessCollector` grabs per-process metrics. `ThreadCollector` grabs threads for subscribed PIDs only.

2. **Diff** — `DiffEngine` compares against the previous tick. Produces three lists: new processes, updated processes (changed fields only), exited processes.

3. **Store** — `HistoryService` pushes the system snapshot into a ring buffer (last 300 entries). Old entries are dropped.

4. **Broadcast** — `ConnectionManager` serializes the diff message and sends it to every connected WebSocket client.

5. **Sleep** — Wait until the next tick boundary. The interval is configurable (`PV_POLL_INTERVAL_MS`, default 1000ms).

The entire cycle — collect, diff, store, broadcast — typically completes in 30-80ms on my machine with ~600 processes. That leaves 920ms of headroom before the next tick. Even under heavy load with 1000+ processes, I've never seen it exceed 200ms.

### Error Resilience in the Broadcast Loop

The broadcast loop cannot crash. If it does, all clients stop getting updates.

Each step is wrapped in exception handling:
- If a single process fails to collect, skip it and continue with the rest
- If a WebSocket send fails (client disconnected), remove the client from the connection list and continue
- If the diff engine encounters inconsistent state, fall back to sending a full snapshot

The loop has been running for hours during my stress tests without a single interruption.

---

## Configuration: Environment Variables, Not Config Files

Every tunable parameter is exposed as an environment variable with a `PV_` prefix:

```bash
PV_POLL_INTERVAL_MS=500      # collect every 500ms instead of 1000ms
PV_MAX_PROCESSES=2000         # track up to 2000 processes
PV_HISTORY_BUFFER_SIZE=600    # keep 10 minutes of history instead of 5
PV_HOST=0.0.0.0               # bind address
PV_PORT=8765                   # server port
PV_COLLECT_THREADS=true        # enable/disable thread collection entirely
```

I used Pydantic Settings for this, which gives you automatic type validation, default values, and environment variable parsing with zero boilerplate. If someone passes `PV_POLL_INTERVAL_MS=banana`, they get a clear error at startup instead of a mysterious crash later.

Why env vars instead of a config file? Because this thing should be easy to run in Docker, systemd, or any environment where you pass configuration through the environment. No YAML to maintain. No config file paths to get wrong.

---

## Stress Testing: Breaking My Own System

I wrote a stress test that deliberately hammers the system:

**Phase 1:** Spawn 10 processes, each with 4 CPU-bound threads and 200MB of allocated memory. That's 40 threads and 2GB of RAM appearing on the system at once.

**Phase 2:** Sequentially spawn 6 more processes with 3 threads each.

The goal was to verify:
- Does the diff engine correctly detect all new processes immediately?
- Does the WebSocket payload stay small even when 10 processes appear simultaneously?
- Does the history buffer correctly record the CPU/memory spike?
- Do the processes get correctly removed from the tracked set when they exit?

Everything worked, but the stress test exposed a subtle issue: when 10 processes appear in the same tick, the "new processes" list in the diff message is large (full snapshots for all 10). That single tick's payload spikes to ~100KB. Not a real problem, but it confirmed that the diff engine's worst case is "a lot of processes appearing simultaneously" — which in practice almost never happens outside of stress tests.

---

## What I Learned About OS Internals

Building this taught me things I couldn't have learned any other way:

**RSS vs VMS, intuitively.** VMS (Virtual Memory Size) is the total address space a process has mapped — including memory-mapped files, shared libraries, and allocated-but-untouched pages. RSS (Resident Set Size) is what's actually in physical RAM right now. A process can have 2GB VMS and 50MB RSS. That's normal. VMS is "what it asked for." RSS is "what it's using."

**Voluntary vs involuntary context switches.** A voluntary switch happens when a process says "I'm done for now" — it called `sleep()`, `read()`, or `wait()`. An involuntary switch happens when the OS preempts the process because its time slice expired. High involuntary switches mean CPU contention. I could see this spike in real time during my stress test.

**File descriptors are a finite resource.** Every open file, socket, and pipe consumes an FD. The default limit on macOS is 256 per process (though it can be raised). I watched my stress test processes' FD count and saw exactly when they opened sockets vs files.

**macOS memory compression is brilliant.** Instead of immediately swapping inactive pages to disk (slow), macOS compresses them in RAM (fast). Decompression is ~10x faster than a disk read. I could see compressed memory grow as I loaded more processes, while swap stayed at zero.

**Zombie processes are real.** A zombie is a process that has exited but whose parent hasn't called `wait()` to read its exit status. It has no memory or CPU, but its PID entry still exists in the process table. I could see them appear in my process list with status "zombie" — they're harmless but fascinating.

---

## Design Decisions I'd Reconsider

**In-memory history only.** All historical data lives in a Python list and vanishes on restart. For a learning project, this is fine. For a production tool, I'd add a time-series database (InfluxDB, TimescaleDB, or even just SQLite) to persist metrics.

**Single-threaded collection.** The collection loop runs in the main async event loop. Under extreme load (2000+ processes), collection can take long enough to delay the broadcast. A dedicated collector thread feeding an async queue would decouple collection latency from broadcast timing.

**No authentication.** The WebSocket and REST endpoints are wide open. Fine for local use. For remote access, you'd want at minimum a token-based auth layer.

**No aggregation.** Every client gets every diff message at full resolution. If you had 50 clients, you'd want server-side aggregation — maybe sending summary messages to most clients and detailed messages only to the ones with the dashboard open.

---

## Try It Yourself

The project is open source. Clone it, run `./start.sh`, and you'll have a real-time process monitor running locally in under a minute. Run the stress test (`python stress_test.py`) and watch your system spike in real time.

If you're learning OS internals, I genuinely believe building something like this is the fastest path from "I read about context switches" to "I understand context switches." When you can see the numbers change in response to things you do, the concepts stop being abstract.

And if you're designing any real-time system — not just process monitoring — the patterns here transfer directly: differential updates, demand-driven collection, hybrid REST/WebSocket protocols, ring buffers for history. These are general tools for building efficient streaming systems.

---

*If you found this interesting, drop a comment. I'd love to know what you'd do differently, or what other OS internals you'd want to visualize.*
