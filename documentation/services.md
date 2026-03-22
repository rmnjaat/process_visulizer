# Services Layer -- In-Depth Documentation

This document provides a comprehensive, beginner-friendly explanation of the
**services layer** in the Process Visualizer backend. Every technical term is
defined where it first appears and collected in the glossary at the end.

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [SnapshotService Deep Dive](#2-snapshotservice-deep-dive)
3. [HistoryService Deep Dive](#3-historyservice-deep-dive)
4. [TreeService Deep Dive](#4-treeservice-deep-dive)
5. [Data Flow -- Tracing a Complete Tick](#5-data-flow----tracing-a-complete-tick)
6. [Design Decisions](#6-design-decisions)
7. [Glossary](#7-glossary)

---

## 1. Module Overview

### What is a "service" in software architecture?

In software engineering, a **service** is a self-contained unit of code that
performs a specific business task. Services sit between the *raw data
collection* layer (which talks to the operating system) and the *presentation*
layer (which talks to clients over the network). This arrangement is called
the **service layer pattern**.

Think of it like a restaurant:

- **Collectors** are the kitchen staff who prepare individual ingredients (raw
  CPU numbers, raw process lists, raw thread data).
- **Services** are the chefs who combine those ingredients into finished
  dishes (a complete system snapshot, a process tree, a time-series history).
- **Routes / WebSocket handlers** are the waiters who deliver the dishes to
  tables (send JSON to the browser).

### Why separate services from collectors?

| Concern | Collector | Service |
|---------|-----------|---------|
| **Responsibility** | Talk to the OS via `psutil` and return a single model object | Combine multiple collector outputs into a higher-level result |
| **Knowledge** | Knows how to read CPU counters, memory stats, etc. | Knows *when* to call which collector, in what order, and how to package the results |
| **Reusability** | A collector can be reused by many services | A service can swap out one collector implementation for another |
| **Testing** | Easy to test in isolation with mocked OS calls | Easy to test by injecting fake collectors |

This separation follows the **Single Responsibility Principle** (SRP): each
class does one thing and does it well.

### The three services

The services package exposes exactly three classes:

```python
# backend/services/__init__.py
from backend.services.snapshot_service import SnapshotService
from backend.services.history_service  import HistoryService
from backend.services.tree_service     import TreeService

__all__ = [
    "SnapshotService",
    "HistoryService",
    "TreeService",
]
```

| Service | Purpose |
|---------|---------|
| `SnapshotService` | Orchestrates every "tick" -- collects system data, process data, computes diffs, collects threads for subscribed PIDs, and builds the WebSocket response message |
| `HistoryService` | Stores a rolling buffer of recent `SystemSnapshot` objects so the frontend can draw time-series charts |
| `TreeService` | Converts a flat list of processes (and optionally threads) into a nested parent-child tree structure |

---

## 2. SnapshotService Deep Dive

**Source file:** `backend/services/snapshot_service.py`

### 2.1 What orchestration means

**Orchestration** is the act of coordinating multiple independent components to
accomplish a larger task. An orchestrator does not do the low-level work
itself; it delegates to specialists and then combines their results.

`SnapshotService` is the orchestrator of the entire data-collection pipeline.
It owns instances of every collector and calls them in a precise sequence every
time the server needs fresh data.

### 2.2 Initialization

```python
class SnapshotService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._system_collector = SystemCollector()
        self._process_collector = ProcessCollector()
        self._thread_collector = ThreadCollector()
        self._diff_engine = DiffEngine()
        self._history = HistoryService(buffer_size=settings.history_buffer_size)

        self._subscribed_pids: set[int] = set()
        self._tick_count: int = 0
```

When the application starts, a single `SnapshotService` instance is created.
That constructor:

1. Stores a reference to the application `Settings` (loaded from environment
   variables with the `PV_` prefix).
2. Creates one instance of each collector:
   - `SystemCollector` -- gathers CPU, memory, hostname, uptime, and load
     average.
   - `ProcessCollector` -- iterates over every OS process and builds a
     `ProcessSnapshot` for each.
   - `ThreadCollector` -- for a given PID, lists its threads and computes
     per-thread CPU percent.
   - `DiffEngine` -- compares the current process list against the previous
     tick to produce a compact diff.
3. Creates an internal `HistoryService` to accumulate system snapshots over
   time.
4. Initializes `_subscribed_pids` as an empty `set` (explained in section
   2.5).
5. Sets `_tick_count` to zero. This counter tracks how many ticks have been
   collected since the service started.

### 2.3 The full tick lifecycle

A **tick** is one cycle of data collection. The server runs a tick at a
regular interval (default: every 1000 milliseconds, configured by
`Settings.poll_interval_ms`). Here is exactly what happens inside
`collect_tick()`:

```
Step 1:  Increment _tick_count
Step 2:  Collect system snapshot    (SystemCollector.collect)
Step 3:  Store snapshot in history  (HistoryService.add)
Step 4:  Collect all processes      (ProcessCollector.collect_all)
Step 5:  Cap process list           (if > max_processes, keep top CPU)
Step 6:  Collect threads            (ThreadCollector, only for subscribed PIDs)
Step 7:  Build and return message   (full snapshot on tick 1, diff thereafter)
```

#### Step 1 -- Increment tick count

```python
self._tick_count += 1
```

The very first thing is to bump the counter. Since `_tick_count` starts at 0,
after this line it equals 1 on the first tick, 2 on the second, and so on.

#### Step 2 -- Collect system snapshot

```python
system_snapshot = self._system_collector.collect()
```

This calls `SystemCollector.collect()`, which uses the `psutil` library to
read:

- **CPU** information: model name, core counts (physical and logical),
  frequency, per-core usage percentages, and total usage.
- **Memory** information: total, available, used, free, swap, and (on macOS)
  wired, compressed, app memory, inactive, and purgeable memory.
- **System** metadata: hostname, OS name and version, uptime in seconds, and
  the 1/5/15-minute load averages.

The return value is a `SystemSnapshot` Pydantic model, which is a structured
object that can be serialized to JSON.

#### Step 3 -- Store in history

```python
self._history.add(system_snapshot)
```

The system snapshot is appended to the `HistoryService`'s rolling buffer (see
section 3 for details). This allows the frontend to request historical data
for charts.

#### Step 4 -- Collect all processes

```python
all_processes = self._process_collector.collect_all()
```

This iterates over every process visible to the current user via
`psutil.process_iter()`. For each process, it reads dozens of fields (PID,
parent PID, name, executable path, command line, status, username, CPU times,
memory counters, I/O counters, context switches, file descriptors, network
connections, and open files). Processes that raise permission errors or no
longer exist are silently skipped.

The result is a Python `list` of `ProcessSnapshot` model objects.

#### Step 5 -- Cap the process list

```python
if len(all_processes) > self._settings.max_processes:
    all_processes.sort(key=lambda p: p.cpu_percent, reverse=True)
    all_processes = all_processes[: self._settings.max_processes]
```

A typical Linux or macOS system may have hundreds or thousands of processes.
Sending all of them over the WebSocket every second would consume too much
bandwidth and overwhelm the browser. The `max_processes` setting (default:
1000) puts an upper limit on the payload size.

When there are more processes than the cap, the list is **sorted by CPU
usage in descending order** and then truncated. This means the most
active (and therefore most interesting) processes are always included.

#### Step 6 -- Collect threads for subscribed PIDs

```python
threads_by_pid: dict[int, list] = {}
if self._settings.collect_threads and self._subscribed_pids:
    for pid in list(self._subscribed_pids):
        threads = self._thread_collector.collect_threads(pid)
        if threads:
            threads_by_pid[pid] = threads
```

Thread collection is **conditional**:

- The `collect_threads` setting must be `True` (it is by default).
- There must be at least one PID in the `_subscribed_pids` set.

If both conditions are met, the service iterates over each subscribed PID,
calls `ThreadCollector.collect_threads(pid)`, and stores the results in a
dictionary keyed by PID.

Note the defensive `list(self._subscribed_pids)` -- this creates a copy of the
set before iterating. This prevents a `RuntimeError` if another coroutine adds
or removes a PID while the loop is running (see section 2.6 on thread safety).

#### Step 7 -- Build the response message

The response format depends on whether this is the very first tick:

**First tick (tick_count == 1): Full snapshot**

```python
if self._tick_count == 1:
    self._diff_engine.compute_diff(all_processes)
    return {
        "type": "snapshot",
        "system": system_data,
        "processes": [p.model_dump() for p in all_processes],
        "threads": {
            str(pid): [t.model_dump() for t in threads]
            for pid, threads in threads_by_pid.items()
        },
    }
```

The message has `"type": "snapshot"` and contains the complete list of every
process. The `DiffEngine.compute_diff()` is still called, but its return value
is discarded -- the call is made solely to **prime the engine** so it has a
baseline for computing the diff on tick 2.

**Subsequent ticks (tick_count >= 2): Diff**

```python
diff = self._diff_engine.compute_diff(all_processes)
return {
    "type": "diff",
    "system": system_data,
    "diff": diff.model_dump(),
    "threads": {
        str(pid): [t.model_dump() for t in threads]
        for pid, threads in threads_by_pid.items()
    },
}
```

The message has `"type": "diff"` and, instead of the full process list,
contains only the changes since the last tick. The `ProcessDiff` model has
three fields:

- `new` -- processes that appeared since the last tick (full
  `ProcessSnapshot` objects).
- `updated` -- processes that still exist but whose volatile fields changed
  (only the changed fields plus the `pid` are included).
- `exited` -- processes that disappeared (`{"pid": ..., "name": ...}`).

The **volatile fields** tracked by the diff engine are:

```python
_VOLATILE_FIELDS = [
    "cpu_percent", "memory_rss_bytes", "memory_vms_bytes",
    "memory_percent", "num_threads", "status",
    "cpu_time_user", "cpu_time_system",
    "io_read_bytes", "io_write_bytes",
    "io_read_count", "io_write_count",
    "ctx_switches_voluntary", "ctx_switches_involuntary",
    "num_connections", "num_open_files", "num_fds",
]
```

These are fields that typically change between ticks. Static fields like
`name`, `exe`, `username`, and `create_time` are excluded because they
rarely (or never) change once a process is started.

**Why diffs instead of full snapshots?**

If 500 processes are running and only 20 of them changed since the last tick,
sending a diff is dramatically smaller than sending all 500 again. This
reduces:

- **Network bandwidth** between the backend and the browser.
- **JSON serialization cost** on the server.
- **JSON parsing and DOM update cost** on the client.

### 2.4 Full snapshot for late joiners

```python
async def collect_full_snapshot(self) -> dict:
    """Return a full snapshot (not a diff) for newly connected clients."""
    system_snapshot = self._system_collector.collect()
    all_processes = self._process_collector.collect_all()
    # ... (same capping and thread logic) ...
    return {
        "type": "snapshot",
        "system": system_snapshot.model_dump(),
        "processes": [p.model_dump() for p in all_processes],
        "threads": { ... },
    }
```

When a new WebSocket client connects *after* the server has already been
running and sending diffs, the client has no baseline -- it has never received
a full process list. `collect_full_snapshot()` provides a one-off full snapshot
so the client can initialize its local state. Subsequent messages will be diffs.

Note that this method does **not** increment `_tick_count` and does **not**
call `self._diff_engine.compute_diff()`. It is a read-only operation that does
not interfere with the ongoing tick cycle.

### 2.5 PID subscription mechanism

```python
def subscribe_pid(self, pid: int) -> None:
    """Start collecting threads for *pid*."""
    self._subscribed_pids.add(pid)

def unsubscribe_pid(self, pid: int) -> None:
    """Stop collecting threads for *pid*."""
    self._subscribed_pids.discard(pid)
```

**Why does PID subscription exist?**

Collecting thread information is expensive. Each call to
`ThreadCollector.collect_threads(pid)` makes a system call to list the threads
of that process and then computes CPU percentages. If the server did this for
every process on every tick, it would be far too slow.

Instead, the server collects threads **only for the processes the user is
currently looking at**. When a user clicks on a process in the frontend to see
its details, the frontend sends a WebSocket message asking the server to
"subscribe" to that PID. When the user navigates away, the frontend sends an
"unsubscribe" message.

- `subscribe_pid(pid)` adds the integer PID to an internal Python `set`.
- `unsubscribe_pid(pid)` removes it. The `discard()` method is used instead
  of `remove()` because `discard()` does not raise an error if the PID is
  not in the set (this avoids crashes if the frontend sends a redundant
  unsubscribe).

### 2.6 Thread safety considerations with asyncio

The `SnapshotService` runs inside an **asyncio** event loop. Asyncio is
Python's framework for **concurrency** (doing multiple things that overlap in
time). Unlike multithreading (which uses OS threads), asyncio uses a **single
thread** with **cooperative multitasking**: only one coroutine runs at a time,
and it voluntarily yields control (at `await` points) so others can run.

Key safety considerations:

1. **`_tick_count` and `_subscribed_pids` are accessed from a single thread.**
   Because asyncio is single-threaded, there are no race conditions when
   reading or writing these variables. Two coroutines cannot modify
   `_subscribed_pids` at the exact same instant.

2. **However, control can switch at any `await` point.** The `collect_tick()`
   method is `async`, which means some operation inside it could yield. While
   it is yielded, another coroutine (such as a WebSocket handler calling
   `subscribe_pid()`) could modify `_subscribed_pids`. That is why the code
   does `list(self._subscribed_pids)` to take a snapshot of the set *before*
   iterating.

3. **The collectors themselves are synchronous.** `SystemCollector.collect()`,
   `ProcessCollector.collect_all()`, and `ThreadCollector.collect_threads()`
   are plain (non-async) functions. They block the event loop while running.
   This is acceptable because they execute quickly (typically under 100ms),
   but it means no other coroutine can run during that time.

---

## 3. HistoryService Deep Dive

**Source file:** `backend/services/history_service.py`

### 3.1 What is a rolling buffer / circular buffer?

A **rolling buffer** (also called a **circular buffer** or **ring buffer**) is
a data structure with a fixed maximum size. When you add a new item and the
buffer is already full, the *oldest* item is automatically removed to make
room.

Imagine a conveyor belt with exactly 5 slots:

```
Slot:    [1]  [2]  [3]  [4]  [5]
State 0: [ ]  [ ]  [ ]  [ ]  [ ]    (empty)
Add A:   [A]  [ ]  [ ]  [ ]  [ ]
Add B:   [A]  [B]  [ ]  [ ]  [ ]
Add C:   [A]  [B]  [C]  [ ]  [ ]
Add D:   [A]  [B]  [C]  [D]  [ ]
Add E:   [A]  [B]  [C]  [D]  [E]    (full -- 5 items)
Add F:   [B]  [C]  [D]  [E]  [F]    (A dropped off the left)
Add G:   [C]  [D]  [E]  [F]  [G]    (B dropped off the left)
```

The buffer always holds the most recent items. Older items are silently
discarded. This is perfect for "last N minutes of data" use cases.

### 3.2 Python's `collections.deque` with `maxlen`

The `HistoryService` uses Python's built-in `collections.deque` (pronounced
"deck") with the `maxlen` parameter:

```python
from collections import deque

class HistoryService:
    def __init__(self, buffer_size: int = 300) -> None:
        self._buffer: deque[SystemSnapshot] = deque(maxlen=buffer_size)
```

A **deque** stands for **double-ended queue**. It is a list-like data
structure that supports efficient append and pop operations on both ends.
Under the hood, CPython implements `deque` as a **doubly-linked list of
fixed-size blocks** (each block holds 64 items). This gives it O(1)
time complexity for appending and popping from either end.

When you pass `maxlen=N` to the `deque` constructor, Python enforces a hard
cap:

- If the deque already contains `N` items and you call `.append(x)`, the
  item at the *left* (oldest) end is automatically removed, and `x` is added
  at the *right* (newest) end.
- No manual bookkeeping is needed. You never have to check the length or
  call `popleft()` yourself.
- This is implemented in C inside CPython, so it is extremely fast.

### 3.3 Why 300 as the default buffer size?

The default is configured in `backend/config.py`:

```python
class Settings(BaseSettings):
    history_buffer_size: int = 300
```

The tick interval is 1000 milliseconds (1 second) by default:

```python
    poll_interval_ms: int = 1000
```

Therefore:

```
300 snapshots * 1 second/snapshot = 300 seconds = 5 minutes
```

A 5-minute history window is a practical default because:

- It provides enough data to see trends (a CPU spike that lasted 30 seconds, a
  memory leak growing over 2 minutes).
- It does not consume excessive memory. Each `SystemSnapshot` is relatively
  small (a few hundred bytes of CPU and memory data), so 300 of them might
  total around 100-200 KB.
- It matches common monitoring conventions (many dashboards default to a
  5-minute view).

The buffer size can be overridden by setting the environment variable
`PV_HISTORY_BUFFER_SIZE` to a different integer.

### 3.4 The two methods

```python
def add(self, snapshot: SystemSnapshot) -> None:
    """Append a snapshot to the rolling buffer."""
    self._buffer.append(snapshot)

def get_history(self) -> list[SystemSnapshot]:
    """Return all stored snapshots as a plain list."""
    return list(self._buffer)
```

- `add()` is called once per tick by `SnapshotService.collect_tick()`. It
  appends the latest `SystemSnapshot` to the deque. If the deque is full,
  the oldest snapshot is silently discarded.

- `get_history()` converts the deque into a plain Python `list` and returns
  it. This is used when a client requests historical data (for example, to
  populate a chart when the page first loads). The conversion to `list` is
  necessary because `deque` is not directly JSON-serializable, and because
  returning a copy prevents external code from accidentally mutating the
  internal buffer.

### 3.5 How the frontend uses this for time-series charts

The frontend displays charts that show CPU usage, memory usage, and load
average over time. When the user opens the dashboard or navigates to the
memory/CPU page, the frontend requests the history endpoint. The server calls
`get_history()`, serializes each `SystemSnapshot` to JSON, and sends the
array to the client.

The client then:

1. Extracts the field it needs (e.g., `cpu.total_usage` from each snapshot).
2. Plots each value as a point on a time-series chart, with the x-axis
   representing time and the y-axis representing the metric.
3. On each subsequent tick, the new `SystemSnapshot` (delivered via
   WebSocket) is appended to the chart and the oldest point scrolls off the
   left edge.

---

## 4. TreeService Deep Dive

**Source file:** `backend/services/tree_service.py`

### 4.1 What is a process tree in the OS?

Every process in a Unix-like operating system (Linux, macOS) has a **parent
process**. When a process creates a new process, it uses a system call named
`fork()`. The original process becomes the **parent** and the newly created
process becomes the **child**. The child inherits a copy of the parent's
memory and then typically calls `exec()` to replace itself with a new program.

This parent-child relationship forms a **tree** (a hierarchical data
structure where each node has exactly one parent, except for the root which
has none):

```
PID 0: kernel_task
  |
  +-- PID 1: launchd (init system)
        |
        +-- PID 100: sshd
        |     |
        |     +-- PID 200: sshd (session)
        |           |
        |           +-- PID 201: bash
        |                 |
        |                 +-- PID 300: python3 server.py
        |
        +-- PID 150: WindowServer
```

Each process stores its parent's PID in a field called **ppid** (parent
process ID). PID 0 or PID 1 is typically the root of the tree. The
`TreeService` reconstructs this hierarchy from a flat list of
`ProcessSnapshot` objects.

### 4.2 Key terms

- **PID** (Process ID): A unique integer assigned by the OS kernel to each
  running process.
- **PPID** (Parent Process ID): The PID of the process that created this one.
- **Root process**: A process whose parent is PID 0 or whose parent PID does
  not appear in the current list (i.e., the parent has already exited or is
  not visible).
- **Orphan process**: A process whose parent has exited. The OS re-parents it
  (usually to PID 1), but in our snapshot it may simply have a PPID that does
  not match any living process.

### 4.3 The tree-building algorithm step by step

Here is the complete `build_tree` method with annotations:

```python
def build_tree(
    self,
    processes: list[ProcessSnapshot],
    threads_by_pid: dict[int, list[ThreadSnapshot]] | None = None,
) -> list[dict]:
```

**Inputs:**
- `processes`: A flat list of `ProcessSnapshot` objects (one per process).
- `threads_by_pid`: An optional dictionary mapping PID to a list of
  `ThreadSnapshot` objects for that PID.

**Output:**
- A list of root-level tree nodes. Each node is a dictionary with three keys:
  `entity_type`, `data`, and `children`.

#### Step 1 -- Build lookup structures

```python
if threads_by_pid is None:
    threads_by_pid = {}

pid_set = {p.pid for p in processes}
proc_map: dict[int, ProcessSnapshot] = {p.pid: p for p in processes}
```

- `pid_set`: A Python `set` of all PIDs in the current snapshot. Used for
  fast O(1) membership testing ("is this PPID in our list?").
- `proc_map`: A dictionary mapping PID to its `ProcessSnapshot`. Used to
  look up a process by PID without scanning the entire list.

#### Step 2 -- Group processes by parent PID

```python
children_map: dict[int, list[ProcessSnapshot]] = defaultdict(list)
for proc in processes:
    children_map[proc.ppid].append(proc)
```

A `defaultdict(list)` is a dictionary that automatically creates an empty
list for any key that does not yet exist. After this loop, `children_map[100]`
contains a list of every process whose `ppid` is 100 -- i.e., all children of
PID 100.

#### Step 3 -- Identify root processes

```python
roots = [p for p in processes if p.ppid == 0 or p.ppid not in pid_set]
```

A process is a root if:

- Its PPID is 0 (the kernel or init process), **or**
- Its PPID does not appear in `pid_set` (its parent is not in our snapshot).

The second condition handles **orphan processes** -- processes whose parent
has already exited or is not visible (perhaps filtered out by
`max_processes`). Rather than losing these processes, the tree treats them as
additional roots.

#### Step 4 -- Recursive node building

```python
visited: set[int] = set()

def build_node(proc: ProcessSnapshot) -> dict:
    visited.add(proc.pid)
    child_nodes: list[dict] = []

    # Recurse into child processes (skip already-visited to prevent cycles).
    for child_proc in children_map.get(proc.pid, []):
        if child_proc.pid not in visited:
            child_nodes.append(build_node(child_proc))

    # Attach threads for this PID.
    for thread in threads_by_pid.get(proc.pid, []):
        child_nodes.append(
            {
                "entity_type": "thread",
                "data": thread.model_dump(),
                "children": [],
            }
        )

    return {
        "entity_type": "process",
        "data": proc.model_dump(),
        "children": child_nodes,
    }
```

This is a **recursive** function (a function that calls itself). For each
process:

1. Mark the PID as visited to prevent infinite loops. (A cycle could occur if
   process A lists B as its parent and B lists A as its parent. This should
   not happen in a healthy OS, but the `visited` set protects against it.)
2. Look up all child processes in `children_map` and recursively build a node
   for each unvisited child.
3. Look up any threads for this PID in `threads_by_pid` and add them as leaf
   nodes. A **leaf node** is a node with no children (threads cannot have
   children, so their `children` array is always empty).
4. Return a dictionary representing this node.

#### Step 5 -- Build the result from roots

```python
result: list[dict] = []
for root in roots:
    if root.pid not in visited:
        result.append(build_node(root))
return result
```

Iterate over all identified roots and build a tree starting from each one.
The `if root.pid not in visited` check prevents a root from being processed
twice (which could happen if a process appeared in both the roots list and
as a child of another root due to edge cases in the PPID data).

### 4.4 How orphan processes are handled

As described in step 3 above, any process whose PPID is not in the current
snapshot is treated as a root. This means orphans float to the top level of
the tree rather than being lost. For example:

```
Process list:
  PID=500, PPID=999, name="my_worker"    (PID 999 is not in our list)
  PID=1,   PPID=0,   name="launchd"

Result tree:
  launchd (PID 1)
    +-- ... (children of launchd)
  my_worker (PID 500)               <-- appears as a separate root
```

### 4.5 How threads are attached as leaves

Threads appear as the last children of their parent process node. They are
appended *after* all child processes:

```
Process PID=300 "python3"
  +-- Process PID=301 "worker_child"     (child process, added first)
  +-- Thread TID=1001 "MainThread"       (thread, added second)
  +-- Thread TID=1002 "WorkerThread-1"   (thread, added second)
```

Each thread node has:

- `"entity_type": "thread"` -- so the frontend can render it differently from
  a process node.
- `"data"`: the serialized `ThreadSnapshot` (tid, pid, name, cpu_time_user,
  cpu_time_system, cpu_percent, etc.).
- `"children": []` -- always an empty list because threads do not have
  children.

### 4.6 The output data structure

The final output is a JSON-serializable list of nested dictionaries. Here is
an example showing the shape:

```json
[
  {
    "entity_type": "process",
    "data": {
      "pid": 1,
      "ppid": 0,
      "name": "launchd",
      "cpu_percent": 0.1,
      "memory_rss_bytes": 12345678,
      ...all other ProcessSnapshot fields...
    },
    "children": [
      {
        "entity_type": "process",
        "data": {
          "pid": 100,
          "ppid": 1,
          "name": "sshd",
          ...
        },
        "children": [
          {
            "entity_type": "thread",
            "data": {
              "tid": 5001,
              "pid": 100,
              "name": "Thread-5001",
              "cpu_percent": 0.3,
              ...
            },
            "children": []
          }
        ]
      }
    ]
  }
]
```

This structure is **recursive**: every node has the same three-key shape, and
the `children` array contains more nodes of the same shape. This makes it
easy for the frontend to render using a recursive React component.

---

## 5. Data Flow -- Tracing a Complete Tick

Below is an end-to-end trace of what happens during a single tick, starting
from the timer firing and ending with data reaching the frontend.

```
    Timer fires (every poll_interval_ms)
         |
         v
    SnapshotService.collect_tick()
         |
         +----> _tick_count += 1
         |
         +----> SystemCollector.collect()
         |          |
         |          +----> psutil.cpu_percent()
         |          +----> psutil.cpu_freq()
         |          +----> psutil.virtual_memory()
         |          +----> psutil.swap_memory()
         |          +----> platform.node(), os.getloadavg(), etc.
         |          |
         |          +----> Returns: SystemSnapshot
         |                     { hostname, os, uptime_seconds,
         |                       cpu: CpuSnapshot, memory: MemorySnapshot,
         |                       load_average: [1m, 5m, 15m] }
         |
         +----> HistoryService.add(system_snapshot)
         |          |
         |          +----> deque.append(snapshot)
         |                 (oldest dropped if buffer full)
         |
         +----> ProcessCollector.collect_all()
         |          |
         |          +----> psutil.process_iter()
         |          +----> For each process:
         |          |         proc.oneshot() context
         |          |         Read: pid, ppid, name, exe, cmdline,
         |          |               status, username, create_time,
         |          |               cpu_percent, cpu_times,
         |          |               memory_info, memory_full_info,
         |          |               num_threads, nice, io_counters,
         |          |               num_ctx_switches, num_fds,
         |          |               net_connections, open_files
         |          |
         |          +----> Returns: list[ProcessSnapshot]
         |                         (one per visible process)
         |
         +----> Cap to max_processes (sort by CPU, truncate)
         |
         +----> For each subscribed PID:
         |          |
         |          +----> ThreadCollector.collect_threads(pid)
         |                     |
         |                     +----> psutil.Process(pid).threads()
         |                     +----> Compute CPU% delta from previous call
         |                     +----> Clean up stale thread entries
         |                     |
         |                     +----> Returns: list[ThreadSnapshot]
         |
         +----> DiffEngine.compute_diff(all_processes)
         |          |
         |          +----> Compare current PIDs vs previous PIDs
         |          +----> Identify new PIDs    (current - previous)
         |          +----> Identify exited PIDs  (previous - current)
         |          +----> For common PIDs: compare volatile fields
         |          +----> Store current as next tick's baseline
         |          |
         |          +----> Returns: ProcessDiff { new, updated, exited }
         |
         +----> Build response dict:
                   {
                     "type": "snapshot" or "diff",
                     "system": { ... },
                     "processes" or "diff": { ... },
                     "threads": { "pid": [...], ... }
                   }
                       |
                       v
              WebSocket handler serializes to JSON
                       |
                       v
              Sent to all connected browser clients
                       |
                       v
              Frontend process store applies snapshot or diff
                       |
                       v
              React components re-render with new data
```

### Data sizes at each stage

| Stage | Typical size | Format |
|-------|-------------|--------|
| SystemSnapshot | ~500 bytes | Pydantic model |
| All ProcessSnapshots | ~200-500 KB (for 500 processes) | List of Pydantic models |
| ProcessDiff (typical) | ~5-50 KB | Only changed fields |
| Thread list (1 PID) | ~1-5 KB | List of Pydantic models |
| Final JSON message | ~10-60 KB (diff) or ~200-500 KB (snapshot) | JSON string |

---

## 6. Design Decisions

### 6.1 Why a singleton ThreadCollector?

The `ThreadCollector` maintains internal state: a dictionary called `_prev`
that maps `(pid, tid)` tuples to their last-known CPU times and timestamps.
This state is necessary to compute the CPU percentage for each thread (you
need two data points to calculate a rate of change).

If a new `ThreadCollector` were created on every tick, it would have no
previous data and would always report 0% CPU for every thread. By keeping a
single instance alive for the entire lifetime of the `SnapshotService`, the
collector can compare "this tick's CPU time" against "last tick's CPU time"
and produce meaningful percentages.

The collector also cleans up stale entries:

```python
stale = [k for k in self._prev if k[0] == pid and k not in seen_keys]
for k in stale:
    del self._prev[k]
```

When a thread exits, its `(pid, tid)` key is removed from `_prev` so the
dictionary does not grow without bound.

### 6.2 Why history is separate from snapshot

The `HistoryService` and `SnapshotService` have different responsibilities:

- **SnapshotService** answers the question: "What does the system look like
  *right now*?" It produces a single point-in-time snapshot or diff.
- **HistoryService** answers the question: "What did the system look like
  *over the last 5 minutes*?" It stores a time series of past snapshots.

Separating them follows the Single Responsibility Principle. It also makes
each service easier to test: you can test `HistoryService` by adding fake
snapshots and verifying the buffer behavior, without needing to involve real
OS data collection.

Additionally, the `HistoryService` is owned by `SnapshotService` (created
in its constructor), so its lifecycle is tied to the snapshot service. This
ensures there is exactly one history buffer and it always stays in sync with
the tick cycle.

### 6.3 Why the DiffEngine stores state internally

The `DiffEngine` keeps the previous tick's process map inside
`self._previous`. An alternative design would be for the caller to pass both
the previous and current lists, but that would force the caller to manage the
state. By encapsulating the state inside the engine:

- The caller (SnapshotService) only needs to call `compute_diff(current)`
  and does not need to worry about storing the previous list.
- The diff engine can be `reset()` independently if needed (e.g., if the
  server needs to force a full re-sync).

### 6.4 Why system data is always included (not diffed)

Unlike process data, system data (CPU usage, memory usage, load average) is:

- **Small**: a single `SystemSnapshot` is roughly 500 bytes of JSON.
- **Always changing**: CPU percentages and memory usage shift every second.
- **Needed in full**: the frontend needs all CPU cores, total usage, and
  memory breakdown on every tick to update its charts.

Diffing system data would add code complexity for negligible bandwidth
savings, so the design sends the full system snapshot on every tick.

### 6.5 Why the `model_dump()` pattern

Throughout the services, data is converted from Pydantic models to plain
dictionaries using `.model_dump()` before being placed into the response
dictionary. This is because:

- The WebSocket handler will serialize the response to JSON. Plain dicts
  serialize directly with Python's `json.dumps()`.
- Pydantic's `.model_dump()` ensures that all field aliases and default
  values are applied consistently.
- It creates a clear boundary: inside the services layer, data is typed
  Pydantic models (with validation and IDE autocompletion); outside, it is
  plain dicts ready for the wire.

### 6.6 Why `collect_tick` is async

Although the current collectors are all synchronous (blocking), the
`collect_tick()` method is declared `async`. This is a forward-looking design
decision:

- The WebSocket server framework (likely using `asyncio`) expects coroutines.
- If a collector is later rewritten to use asynchronous I/O (e.g., reading
  `/proc` files with `aiofiles`), no changes to the method signature or
  calling code are needed.
- It allows the server to `await` the tick and interleave other work (like
  handling new WebSocket connections) between ticks.

---

## 7. Glossary

An alphabetical list of every technical term used in this document.

| Term | Definition |
|------|-----------|
| **async / await** | Python keywords for asynchronous programming. An `async def` function is a coroutine. `await` pauses it and lets other coroutines run. |
| **asyncio** | Python's built-in library for writing concurrent code using coroutines and an event loop, all within a single OS thread. |
| **circular buffer** | See *rolling buffer*. |
| **collector** | A class that reads raw data from the operating system (via `psutil` or system commands) and returns structured model objects. |
| **concurrency** | The ability to handle multiple tasks that overlap in time. Does not necessarily mean they execute simultaneously (that is parallelism). |
| **cooperative multitasking** | A concurrency model where each task voluntarily yields control at defined points (`await`), rather than being preempted by the OS. |
| **coroutine** | A function defined with `async def` that can be suspended and resumed. Coroutines are the building blocks of asyncio programs. |
| **CPU percent** | The fraction of CPU time a process or thread consumed during a measurement interval, expressed as a percentage (0-100 per core). |
| **defaultdict** | A Python dictionary subclass (`collections.defaultdict`) that automatically creates a default value (e.g., an empty list) for missing keys. |
| **deque** | A double-ended queue from Python's `collections` module. Supports O(1) append and pop from both ends. With `maxlen`, acts as a rolling buffer. |
| **diff** | A compact representation of what changed between two snapshots. Contains only new, updated, and exited items rather than the full dataset. |
| **DiffEngine** | A class that compares the current tick's process list against the previous tick's and produces a `ProcessDiff` object. |
| **entity_type** | A string field (`"process"` or `"thread"`) used in tree nodes to tell the frontend what kind of item it is rendering. |
| **event loop** | The core of asyncio. It runs coroutines, handles I/O events, and schedules callbacks. Only one coroutine executes at a time within the loop. |
| **exec** | A Unix system call that replaces the current process's program with a new one. Often used immediately after `fork()`. |
| **fork** | A Unix system call that creates a new process (child) by duplicating the calling process (parent). The child gets a new PID. |
| **JSON** | JavaScript Object Notation. A text-based data format (`{"key": "value"}`) used to send data between the backend and the browser. |
| **leaf node** | A node in a tree that has no children. In our process tree, threads are always leaf nodes. |
| **load average** | Three numbers (1-minute, 5-minute, 15-minute) representing the average number of processes waiting to run on the CPU. |
| **maxlen** | A parameter on Python's `deque` that sets a maximum size. When exceeded, the oldest item is automatically discarded. |
| **model_dump()** | A Pydantic method that converts a model instance into a plain Python dictionary. |
| **O(1)** | Big-O notation meaning "constant time" -- the operation takes the same amount of time regardless of how much data there is. |
| **orchestration** | The act of coordinating multiple independent components to accomplish a larger task in a defined sequence. |
| **orphan process** | A process whose parent has exited. The OS typically re-parents it to PID 1 (init/launchd). |
| **PID** | Process ID. A unique integer assigned by the kernel to identify a running process. |
| **PPID** | Parent Process ID. The PID of the process that created (forked) this one. |
| **prime** | To initialize a system with baseline data so that subsequent measurements are meaningful. Example: calling `cpu_percent()` once to establish a baseline. |
| **psutil** | A cross-platform Python library for retrieving information on running processes and system utilization (CPU, memory, disks, network). |
| **Pydantic** | A Python library for data validation using type annotations. Models defined with Pydantic enforce types and provide serialization methods. |
| **race condition** | A bug where the behavior of code depends on the timing of events (e.g., two threads modifying the same variable). Avoided in asyncio by single-threaded execution. |
| **recursive function** | A function that calls itself. Used here to walk the process tree from parent to child to grandchild, and so on. |
| **ring buffer** | See *rolling buffer*. |
| **rolling buffer** | A fixed-size data structure where new items push out the oldest items. Implemented here using `deque(maxlen=N)`. |
| **RSS** | Resident Set Size. The amount of physical RAM a process is currently using (not including swap). |
| **service** | A class that implements business logic by coordinating collectors, engines, and other services. Sits between raw data and the API layer. |
| **service layer pattern** | An architectural pattern that places business logic in dedicated service classes, separate from data access and presentation. |
| **Single Responsibility Principle (SRP)** | A design principle stating that each class or module should have one reason to change -- i.e., it should do one thing well. |
| **snapshot** | A complete picture of the system or a process at a single point in time. Contrasted with a *diff*, which only captures changes. |
| **subscription** | A mechanism where a client registers interest in a resource (here, a PID) and the server collects extra data (threads) for it. |
| **TID** | Thread ID. A unique integer assigned by the kernel to identify a thread within a process. |
| **tick** | One cycle of data collection. The server runs one tick every `poll_interval_ms` milliseconds (default: 1000ms = 1 second). |
| **time-series** | A sequence of data points indexed in time order. Used for charts that show how a metric changes over time. |
| **VMS** | Virtual Memory Size. The total amount of virtual address space allocated to a process (may be much larger than physical RAM used). |
| **volatile fields** | Process fields that change frequently between ticks (CPU%, memory, I/O counters). Only these are tracked by the diff engine. |
| **WebSocket** | A protocol that provides full-duplex (two-way) communication between a browser and a server over a single, long-lived TCP connection. |
