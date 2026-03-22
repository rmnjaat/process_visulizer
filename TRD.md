# Technical Reference Document (TRD)

A beginner-friendly guide that explains **what every page, metric, and data point means** in the Process Visualizer, plus a roadmap of future work.

---

## Table of Contents

- [OS Concepts You Need First](#os-concepts-you-need-first)
- [Pages & What They Show](#pages--what-they-show)
  - [Dashboard](#1-dashboard)
  - [Process List](#2-process-list)
  - [Process Detail (Drawer)](#3-process-detail-drawer)
  - [Process Tree](#4-process-tree)
  - [CPU Cores](#5-cpu-cores)
  - [Memory View](#6-memory-view)
- [Glossary: Every Metric Explained](#glossary-every-metric-explained)
  - [Process Identity Fields](#process-identity-fields)
  - [CPU Metrics](#cpu-metrics)
  - [Memory Metrics](#memory-metrics)
  - [I/O Metrics](#io-metrics)
  - [Scheduling & Context Switches](#scheduling--context-switches)
  - [File & Network Metrics](#file--network-metrics)
  - [Thread Metrics](#thread-metrics)
  - [System-Level Metrics](#system-level-metrics)
- [Future Work & Roadmap](#future-work--roadmap)

---

## OS Concepts You Need First

Before diving into the metrics, here are the core concepts:

### What is a Process?
A **process** is a running instance of a program. When you open Chrome, the OS creates a process for it. Each process gets:
- Its own **PID** (Process ID) — a unique number
- Its own **memory space** — so it can't accidentally corrupt other programs
- One or more **threads** — the actual units that execute code

### What is a Thread?
A **thread** is a single sequence of instructions within a process. A process can have many threads running in parallel. For example, Chrome might have one thread rendering the page, another handling network requests, and another playing audio.

### What is CPU Usage?
The CPU executes instructions. **CPU usage** (shown as a percentage) tells you how much of the CPU's time a process is consuming. 100% on a single core means that core is fully busy with that process. On a machine with 8 cores, a single process could theoretically use up to 800%.

### What is Memory (RAM)?
**RAM** (Random Access Memory) is fast, temporary storage. When a program runs, its code and data live in RAM. When RAM fills up, the OS starts using **swap** (a slower section of your disk) as overflow, which makes everything slower.

### What is a File Descriptor?
A **file descriptor (FD)** is a number the OS assigns when a process opens something — a file, a network socket, a pipe. It's like a ticket number. The process uses the FD to read/write to that resource.

### What is a Context Switch?
The CPU can only run one thread at a time per core. A **context switch** happens when the OS pauses one thread and starts running another. There are two kinds:
- **Voluntary**: the thread said "I'm done for now" (e.g., waiting for data from disk)
- **Involuntary**: the OS said "your time is up" and forced the switch to let other threads run

---

## Pages & What They Show

### 1. Dashboard

The landing page — a quick health check of your entire system at a glance.

| Section | What It Shows | Why It Matters |
|---------|--------------|----------------|
| **CPU Gauge** | Total CPU usage across all cores as a percentage | If this stays near 100%, your machine is overloaded |
| **Memory Gauge** | How much physical RAM is in use vs total | High usage means programs might start swapping to disk |
| **Swap Card** | How much swap space (disk-as-RAM) is being used | Any significant swap usage means your system is low on real memory |
| **Load Average (1m / 5m / 15m)** | Average number of processes *wanting* to use the CPU over the last 1, 5, and 15 minutes | Compare to your core count: load 8.0 on an 8-core machine = fully loaded. Above that = processes are queuing |
| **CPU Per Core** | Bar chart showing each individual core's usage | Helps spot unbalanced workloads (one core at 100% while others idle means the app is single-threaded) |
| **CPU & Memory Over Time** | Rolling time-series chart of CPU and memory % | Spot trends — is usage climbing? Did something spike 2 minutes ago? |
| **System Info** | Hostname, OS, CPU model, physical/logical core count | Context: what machine are you looking at |

### 2. Process List

A sortable table of every running process, similar to Activity Monitor or Task Manager.

| Column | What It Means |
|--------|--------------|
| **Type** | Badge showing this is a "process" (vs a thread) |
| **PID** | Process ID — the unique number the OS assigned |
| **Name** | The program name (e.g., "python", "chrome", "node") |
| **CPU %** | How much CPU this process is using *right now* |
| **Memory** | RSS (Resident Set Size) — how much physical RAM this process is using |
| **Threads** | How many threads are running inside this process |
| **State** | Current state: `running`, `sleeping`, `zombie`, `stopped`, etc. |
| **User** | Which user account owns this process |

**Tip**: Click any column header to sort. Click a row to open the detail drawer.

### 3. Process Detail (Drawer)

When you click a process in the Process List, a side panel slides in with deep details. Here's what every section means:

#### Identity Section
| Field | Meaning |
|-------|---------|
| **PID** | Process ID — unique number for this process |
| **PPID** | Parent PID — the process that *created* this one (e.g., your shell created the program you launched) |
| **Name** | Program name |
| **Executable** | Full path to the binary on disk (e.g., `/usr/bin/python3`) |
| **Command Line** | Exact command used to launch it, including all arguments |
| **User** | The OS user account running this process |
| **Status** | `running` = actively using CPU, `sleeping` = waiting for something (I/O, timer), `zombie` = finished but parent hasn't acknowledged it, `stopped` = paused (e.g., Ctrl+Z) |
| **Started** | When this process was created |

#### CPU Section
| Field | Meaning |
|-------|---------|
| **CPU %** | Percentage of CPU used in the last measurement interval |
| **User Time** | Total time spent running *your code* (not kernel code). This accumulates over the process lifetime |
| **System Time** | Total time the *kernel* spent working on behalf of this process (file operations, network calls, memory allocation) |
| **Children User** | User-mode CPU time consumed by all child processes that have been waited on |
| **Children System** | Kernel-mode CPU time consumed by all child processes that have been waited on |
| **I/O Wait** | Time the CPU was idle because this process was waiting for disk/network I/O |
| **Nice** | Priority hint from -20 (highest priority) to 19 (lowest). Default is 0. Lower = gets more CPU time |

#### Memory Section
| Field | Meaning | Analogy |
|-------|---------|---------|
| **RSS** (Resident Set Size) | Physical RAM actually in use *right now* | The actual desk space you're using |
| **Virtual** (VMS) | Total virtual address space mapped — includes code, data, shared libs, and memory-mapped files | All the desk space you *reserved*, even if most of it is empty |
| **Shared** | Memory that multiple processes can access (e.g., shared libraries like libc) | A reference book on a shared shelf that everyone reads |
| **Text** | Memory for the executable code (the instructions) | The printed recipe you're following |
| **Data** | Memory for variables — heap allocations, global variables, etc. | Your cutting board and ingredients |
| **Lib** | Memory used by shared libraries (.so / .dylib files) | Borrowed tools from a shared toolkit |
| **Dirty** | Pages modified in RAM but not yet written to disk | Notes you've scribbled but haven't saved |
| **Percent** | What fraction of total system RAM this process uses | — |
| **USS** (Unique Set Size) | Memory that is *exclusively* used by this process, not shared with anyone | Your personal notebook that nobody else reads |
| **PSS** (Proportional Set Size) | USS + your *fair share* of shared pages. If 3 processes share 90KB, each gets 30KB counted | A fairer measure than RSS because it divides shared memory proportionally |

**Which one should I look at?**
- For "how much RAM is this process actually costing me?" → look at **PSS** or **USS**
- For "how much physical memory is this process touching?" → look at **RSS**
- **Virtual** is usually enormous and misleading — it includes mapped but untouched memory

#### I/O Section
| Field | Meaning |
|-------|---------|
| **Read Ops** | Total number of read operations (syscalls) since the process started |
| **Write Ops** | Total number of write operations since the process started |
| **Read Bytes** | Total data read from disk |
| **Write Bytes** | Total data written to disk |

#### Context Switches Section
| Field | Meaning |
|-------|---------|
| **Voluntary** | The process willingly gave up the CPU (waiting for I/O, sleeping). High = lots of I/O or sleeping |
| **Involuntary** | The OS *forced* the process off the CPU because its time slice expired. High = CPU-hungry process competing with others |

#### File Handles Section
| Field | Meaning |
|-------|---------|
| **Open FDs** | Total file descriptors open (files + sockets + pipes). Every resource a process uses gets an FD |
| **Open Files** | Specifically how many files on disk are open |
| **Network Connections** | Active TCP/UDP socket connections |

#### Open Files Table
Shows every file this process has open, with the FD number and file path. Useful for debugging "which files is this process reading?"

#### Network Connections Table
Shows every network connection with local address, remote address, and state (ESTABLISHED, LISTEN, TIME_WAIT, etc.)

#### Threads Section
Lists all threads within this process with per-thread CPU times. See [Thread Metrics](#thread-metrics) below.

### 4. Process Tree

A hierarchical view showing parent-child relationships between processes.

- **Root processes** (PID 1 = `launchd` on macOS, `init`/`systemd` on Linux) are at the top
- **Child processes** are indented beneath their parent
- Click any process or thread to see its details in the drawer
- **Search bar** lets you filter by name or PID
- The tree refreshes every 5 seconds

**Why this matters**: It shows you *who launched what*. If a runaway process is spawning hundreds of children, the tree makes it obvious.

### 5. CPU Cores

A deep dive into CPU performance.

| Section | What It Shows |
|---------|--------------|
| **CPU Gauge** | Same total CPU % as Dashboard |
| **Processor** | Physical cores (P) / Logical cores (L). Logical > Physical means hyperthreading is enabled |
| **Frequency** | Current clock speed in MHz, plus the min-max range. Higher = faster but more power/heat |
| **Load Average** | 1m / 5m / 15m averages (same as Dashboard) |
| **Per-Core Usage** | Bar chart — one bar per logical core showing real-time usage |
| **CPU Usage Over Time** | Time-series line chart of total CPU % |
| **Per-Core Heatmap** | Grid where each cell is a core at a point in time. Color intensity = usage. Helps visualize which cores are busy over time |
| **Top CPU Consumers** | Table of the 10 processes using the most CPU, with clickable rows |

### 6. Memory View

A deep dive into RAM and swap usage.

| Section | What It Shows |
|---------|--------------|
| **Memory Gauge** | Visual gauge of RAM usage % |
| **Used** | How many GB of RAM are in use out of total |
| **Available** | How many GB the OS considers "available" (free + easily reclaimable cache) |
| **Swap** | Swap usage as a percentage |
| **Memory Breakdown** | Stacked bar showing how memory is divided into categories (see below) |
| **Memory Usage Over Time** | Time-series chart of RAM usage % |
| **Swap Usage Over Time** | Time-series chart of swap usage % |
| **Detailed Statistics** | All memory numbers in a grid |
| **Top Memory Consumers** | Table of the 10 processes using the most RAM, with clickable rows |

#### Memory Breakdown Categories

On **macOS**:
| Category | Meaning |
|----------|---------|
| **App Memory** | Memory actively used by applications |
| **Wired Memory** | Memory that *cannot* be swapped to disk — the kernel and critical system structures need it always in RAM |
| **Compressed** | Pages the OS compressed in RAM to save space (macOS feature). Still in RAM, just squished |

On **Linux**:
| Category | Meaning |
|----------|---------|
| **Used** | Memory actively in use by processes |
| **Cached** | File data cached in RAM for speed. The OS will reclaim this if a process needs it |
| **Buffers** | Temporary storage for raw disk block I/O. Usually small |
| **Shared** | Memory shared between processes (shared memory segments, tmpfs) |
| **Free** | Truly unused RAM. On a healthy system, free can be low because Linux aggressively caches — that's fine |

---

## Glossary: Every Metric Explained

### Process Identity Fields

| Metric | Full Name | What It Means |
|--------|-----------|---------------|
| `pid` | Process ID | Unique number the OS assigns when a process is created. No two running processes share a PID |
| `ppid` | Parent Process ID | PID of the process that created this one. Forms the process tree hierarchy |
| `name` | Process Name | Usually the executable name (e.g., "python3", "node") |
| `exe` | Executable Path | Full filesystem path to the binary (e.g., `/usr/local/bin/node`) |
| `cmdline` | Command Line | The full command including arguments (e.g., `python3 main.py --port 8765`) |
| `status` | Process State | `running` / `sleeping` / `zombie` / `stopped` / `idle` / `disk-sleep` |
| `username` | Owner | Which user account the process runs under |
| `create_time` | Creation Time | Unix timestamp of when the process was born |

### CPU Metrics

| Metric | What It Means |
|--------|---------------|
| `cpu_percent` | % of CPU used in the last sampling interval. On a 4-core machine, max per process is 400% |
| `cpu_time_user` | Cumulative seconds of CPU time spent in user mode (your code). Grows over process lifetime |
| `cpu_time_system` | Cumulative seconds spent in kernel mode (syscalls like reading files, sending packets) |
| `cpu_time_children_user` | User-mode CPU time of all child processes that have exited and been "reaped" |
| `cpu_time_children_system` | Kernel-mode CPU time of all reaped child processes |
| `cpu_time_iowait` | Time the CPU was idle waiting for I/O requested by this process (Linux-specific, 0 on macOS) |
| `nice` | Priority value from -20 (highest) to 19 (lowest). Default 0. A "nicer" process yields more to others |
| `total_usage` (system) | Aggregate CPU usage across all cores. 100% = every core maxed |
| `usage_per_core` | Array of per-core usage percentages (e.g., `[5.2, 80.1, 12.0, 3.5]` for a 4-core machine) |
| `frequency_mhz` | Current CPU clock speed. Higher = faster execution |
| `load_average` | [1min, 5min, 15min] — average runnable processes. If > core count, processes are waiting in line |

### Memory Metrics

| Metric | What It Means |
|--------|---------------|
| `memory_rss_bytes` | **RSS (Resident Set Size)** — physical RAM pages currently in memory. The most common "how much RAM" metric |
| `memory_vms_bytes` | **VMS (Virtual Memory Size)** — total virtual address space. Includes memory-mapped files, reserved-but-untouched pages. Usually much bigger than RSS |
| `memory_shared_bytes` | Memory pages shared with other processes (shared libraries, shared memory segments) |
| `memory_text_bytes` | Memory for executable code (the .text segment) |
| `memory_data_bytes` | Memory for data — heap, globals, BSS. Where `malloc()` allocations live |
| `memory_lib_bytes` | Memory consumed by shared libraries (.so / .dylib) |
| `memory_dirty_bytes` | Pages that have been modified in RAM but not written back to disk yet |
| `memory_percent` | RSS as a percentage of total system RAM |
| `memory_uss_bytes` | **USS (Unique Set Size)** — memory *exclusive* to this process. If you killed this process, this memory would be freed |
| `memory_pss_bytes` | **PSS (Proportional Set Size)** — USS + proportional share of shared pages. The fairest single metric |
| `total_bytes` (system) | Total physical RAM installed |
| `available_bytes` (system) | Memory the OS can give to apps without swapping — free + reclaimable cache |
| `used_bytes` (system) | RAM actively in use (total - available) |
| `cached_bytes` (system) | File data cached in RAM for performance (Linux). Reclaimable if needed |
| `buffers_bytes` (system) | Raw disk I/O buffer cache (Linux). Usually small |
| `wired_bytes` (system) | Memory locked in RAM that cannot be swapped out (macOS). Kernel & critical structures |
| `compressed_bytes` (system) | Pages the OS compressed to save RAM (macOS). Still in RAM, just smaller |
| `app_memory_bytes` (system) | Memory used by applications (macOS). Roughly: used - wired - compressed |
| `swap_total_bytes` | Total swap space configured |
| `swap_used_bytes` | How much swap is currently in use. High = system ran out of RAM |
| `swap_percent` | Swap usage as a percentage |

### I/O Metrics

| Metric | What It Means |
|--------|---------------|
| `io_read_count` | Number of read syscalls since process start |
| `io_write_count` | Number of write syscalls since process start |
| `io_read_bytes` | Total bytes read from disk |
| `io_write_bytes` | Total bytes written to disk |

### Scheduling & Context Switches

| Metric | What It Means |
|--------|---------------|
| `ctx_switches_voluntary` | Process gave up the CPU on its own (e.g., called `read()` and data wasn't ready). High count = I/O-heavy process |
| `ctx_switches_involuntary` | OS forced the process off the CPU (time slice expired). High count = CPU-bound process competing for time |
| `nice` | Priority hint. -20 = highest priority, 19 = lowest. Only root can set negative values |

### File & Network Metrics

| Metric | What It Means |
|--------|---------------|
| `num_fds` | Total open file descriptors — every open file, socket, pipe, or device gets one. Each process has a max FD limit (typically 1024-65535) |
| `num_open_files` | Specifically how many regular files are open |
| `num_connections` | Active TCP/UDP sockets (ESTABLISHED, LISTEN, TIME_WAIT, etc.) |

### Thread Metrics

| Metric | What It Means |
|--------|---------------|
| `tid` | Thread ID — unique number for this thread within the OS |
| `pid` | Which process this thread belongs to |
| `name` | Thread name (some platforms expose this, some synthesize it) |
| `state` | Thread state — similar to process state (running/sleeping/etc.) |
| `cpu_time_user` | CPU time this thread spent in user mode |
| `cpu_time_system` | CPU time this thread spent in kernel mode |
| `cpu_percent` | CPU % for this specific thread |
| `priority` | OS scheduling priority for this thread |
| `nice` | Nice value for this thread |
| `core_id` | Which physical CPU core this thread is currently running on (if available) |
| `voluntary_ctx_switches` | Thread gave up CPU willingly |
| `involuntary_ctx_switches` | OS preempted this thread |
| `stack_size_bytes` | Memory reserved for this thread's call stack (function calls, local variables) |

### System-Level Metrics

| Metric | What It Means |
|--------|---------------|
| `hostname` | Machine name |
| `os` | Operating system name |
| `uptime_seconds` | How long the machine has been running since last reboot |
| `load_average` | [1m, 5m, 15m] — average number of processes in the run queue. Compare to core count |
| `physical_cores` | Number of physical CPU cores (actual hardware) |
| `logical_cores` | Number of logical cores (physical x hyperthreading). e.g., 8P/16L means 8 cores with 2 threads each |

---

## Future Work & Roadmap

### Phase 1: Wire Up Existing Backend Features

These features already exist in the backend but have no UI:

- [ ] **Thread subscription via WebSocket** — The backend supports `subscribe_process` / `unsubscribe_process` WebSocket commands to stream real-time thread data for a specific process. Currently unused by the frontend. Wire this up so that opening a process detail drawer automatically subscribes and shows live thread updates.
- [ ] **Dynamic update interval** — The backend supports `set_interval` WebSocket command (min 100ms). Add a UI control (slider or dropdown) to let users adjust how frequently data refreshes.
- [ ] **Process detail endpoint data** — The `/api/processes/{pid}` endpoint returns open files, network connections, and environment variables. The drawer already shows files and connections but **environment variables** are fetched and never displayed. Add an expandable "Environment" section.

### Phase 2: Enhanced Visualizations

- [ ] **Per-process CPU/memory sparklines** — Tiny inline charts in the process list showing usage over the last N ticks, so you can spot trends without opening details.
- [ ] **Memory breakdown per process** — A stacked bar or pie chart inside the process detail showing RSS vs shared vs text vs data, making it visual instead of just numbers.
- [ ] **Network traffic visualization** — Show I/O bytes over time per process (not just cumulative totals). Requires tracking deltas between ticks.
- [ ] **Thread timeline view** — A Gantt-chart-style view showing which threads ran on which cores over time. Helps understand scheduling behavior.
- [ ] **Process lifecycle notifications** — Toast/banner when a process starts or exits, especially useful for monitoring specific services.

### Phase 3: Interactive Features

- [ ] **Process actions** — Send signals to processes (SIGTERM, SIGKILL, SIGSTOP, SIGCONT) from the UI. Requires a new backend endpoint with proper authorization.
- [ ] **Process search & filter** — Filter the process list by name, user, state, or resource thresholds (e.g., "show me everything using >10% CPU").
- [ ] **Bookmark/pin processes** — Let users pin specific PIDs to a "watchlist" that stays at the top.
- [ ] **Comparison mode** — Select two processes and view their metrics side by side.
- [ ] **Export data** — Export current snapshot or historical data as CSV/JSON for offline analysis.

### Phase 4: System Features

- [ ] **Alerting** — Set thresholds (CPU > 90%, memory > 85%) and get browser notifications.
- [ ] **Historical persistence** — Currently, history lives in a rolling in-memory buffer and is lost on restart. Add optional SQLite/file-based persistence so you can review past data.
- [ ] **Multi-machine support** — Connect to remote backends and switch between machines in the UI.
- [ ] **Dark/light theme toggle** — Currently only dark theme. Add a light theme option.
- [ ] **Authentication** — Add basic auth or token-based auth for the backend, especially if exposed on a network.
- [ ] **Docker-aware process grouping** — Detect containerized processes and group them by container.

### Phase 5: Educational Additions

- [ ] **"What is this?" tooltips everywhere** — Extend the existing tooltip system to cover every single metric on every page (some pages like CPU Cores and Memory View don't have tooltips yet).
- [ ] **Guided walkthrough** — An interactive tutorial that walks a new user through each page, explaining what to look for.
- [ ] **Anomaly highlighting** — Color-code or flag values that are unusual (zombie processes, extremely high FD counts, processes with 0 threads).
- [ ] **OS concept links** — Link metrics to educational resources explaining the underlying OS concepts (virtual memory, scheduling algorithms, etc.).
