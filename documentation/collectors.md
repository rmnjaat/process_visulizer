# Collectors Package -- In-Depth Documentation

This document provides an exhaustive explanation of the `backend/collectors/` package in the Process Visualizer application. It is written for beginners who are learning operating system internals. Every technical term is defined where it first appears, and a full glossary is provided at the end.

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Key OS Concepts](#2-key-os-concepts)
3. [File-by-File Deep Dive](#3-file-by-file-deep-dive)
   - [\_\_init\_\_.py](#31-__init__py)
   - [process\_collector.py](#32-process_collectorpy)
   - [system\_collector.py](#33-system_collectorpy)
   - [thread\_collector.py](#34-thread_collectorpy)
   - [diff\_engine.py](#35-diff_enginepy)
4. [DiffEngine -- The Diffing Algorithm](#4-diffengine----the-diffing-algorithm)
5. [How Data Flows -- Tracing a Single Tick](#5-how-data-flows----tracing-a-single-tick)
6. [Glossary](#6-glossary)

---

## 1. Module Overview

### What This Package Does

The `backend/collectors/` package is the **data acquisition layer** of the Process Visualizer. Its sole job is to reach into the operating system's kernel, read real-time metrics about processes, threads, CPU, and memory, and package those raw numbers into well-defined Python data structures (Pydantic models) that the rest of the application can consume.

Think of it as a translator: the OS kernel speaks in system calls, memory addresses, and `/proc` filesystem entries (on Linux) or Mach kernel traps (on macOS). The collectors translate all of that into clean Python objects.

### Why It Exists in the Architecture

The application follows a layered architecture:

```
OS Kernel
   |
   v
[collectors]  <--- You are here. Reads raw data from the OS.
   |
   v
[server/routes]   Exposes data over WebSocket / HTTP.
   |
   v
[frontend]        Renders data in the browser.
```

By isolating all OS interaction into the `collectors` package, the rest of the codebase never has to deal with `psutil` exceptions, platform differences, or missing fields. The collectors handle all of that mess and hand off clean snapshots.

### The Four Components

| File | Responsibility |
|---|---|
| `process_collector.py` | Collects metrics for every running process |
| `system_collector.py` | Collects system-wide CPU, memory, and host info |
| `thread_collector.py` | Collects per-thread metrics for a specific process |
| `diff_engine.py` | Compares successive process snapshots to compute minimal diffs |

---

## 2. Key OS Concepts

Before diving into the code, let us define every OS concept you will encounter.

### Process

A **process** is an instance of a running program. When you double-click an application or type a command in a terminal, the OS creates a process. Each process gets its own:
- Virtual address space (its own "view" of memory)
- One or more threads of execution
- Open file handles
- Security credentials (which user owns it)

### Thread

A **thread** is the smallest unit of execution that the OS scheduler can manage. A process always has at least one thread (the "main thread"). Multiple threads within the same process share the same memory space, which makes communication between them fast but also means a bug in one thread can crash all of them.

### PID (Process Identifier)

Every process gets a unique integer called a **PID** when it is created. The OS uses this number to track the process. PIDs are typically recycled after a process exits, but at any given moment, no two living processes share the same PID.

### PPID (Parent Process Identifier)

Every process (except the very first one, PID 1) is created by another process. The **PPID** is the PID of the process that spawned it. This creates a tree structure: `init` (or `launchd` on macOS) sits at the root, and every other process is a descendant.

### TID (Thread Identifier)

Each thread within a process has a unique **TID**. On Linux, TIDs are system-wide unique (they come from the same numbering space as PIDs). On macOS, thread IDs are per-process identifiers assigned by the Mach kernel.

### RSS (Resident Set Size)

**RSS** is the amount of physical RAM (actual hardware memory) currently occupied by a process. If a process has allocated 100 MB of virtual memory but only touched 30 MB of it, the RSS is approximately 30 MB. RSS is the single most important metric for understanding how much real memory a process is consuming right now.

### VMS (Virtual Memory Size)

**VMS** is the total amount of virtual memory that a process has mapped into its address space. This includes:
- Code (text segment)
- Data (heap, stack)
- Memory-mapped files
- Shared libraries

VMS is almost always larger than RSS because much of the mapped memory may never be accessed (and therefore never loaded into physical RAM).

### USS (Unique Set Size)

**USS** is the amount of physical memory that is unique to a process -- memory that would be freed if this process alone were killed. It excludes any memory shared with other processes (like shared libraries). USS gives the truest picture of a process's private memory cost, but it is more expensive to compute than RSS.

### PSS (Proportional Set Size)

**PSS** divides shared memory proportionally among the processes sharing it. If a shared library occupies 10 MB of RAM and three processes map it, each process's PSS includes 10/3 = 3.33 MB for that library, plus all of its private (unique) memory. PSS is only available on Linux.

### CPU Time (User and System)

When a process runs, the OS tracks two categories of CPU time:
- **User time**: Time spent executing the process's own code (your application logic).
- **System time**: Time spent inside kernel code on behalf of the process (e.g., reading a file, sending network data).

The sum of user + system time tells you how much CPU work a process has done since it started.

### CPU Percent

**CPU percent** is the percentage of CPU time a process consumed during a measurement interval. A value of 100% means the process used one full core for the entire interval. On a machine with 8 cores, the maximum possible value is 800% (or 100% per core depending on the tool's convention). In this codebase, thread-level CPU percent is calculated manually using the delta of CPU times between two consecutive collection ticks.

### Context Switches

A **context switch** happens when the OS stops one thread from running on a CPU core and starts another. There are two types:
- **Voluntary**: The thread gave up the CPU on its own, typically because it is waiting for I/O (e.g., reading from disk or network).
- **Involuntary**: The OS forcibly preempted the thread because its time slice expired or a higher-priority thread needed the core.

High involuntary context switches suggest CPU contention. High voluntary switches suggest heavy I/O.

### File Descriptors (FDs)

A **file descriptor** is an integer handle that the OS assigns to every open file, socket, pipe, or device. When a process opens `/var/log/syslog`, the kernel returns a small integer (like 3, 4, 5...) that the process uses in subsequent `read()` and `write()` calls. The number of open file descriptors (`num_fds`) tells you how many I/O resources a process is holding open.

### I/O Counters

**I/O counters** track how much data a process has read from or written to storage devices:
- `read_count` / `write_count`: Number of read/write *operations* (syscalls).
- `read_bytes` / `write_bytes`: Total bytes transferred.

These counters are cumulative since the process started. Note: on macOS, per-process I/O counters are not available through `psutil`, so the code gracefully falls back to zeros.

### Nice Value

The **nice value** is a scheduling hint that tells the OS how "polite" a process should be about CPU usage. It ranges from -20 (highest priority, least "nice" to other processes) to +19 (lowest priority, most "nice"). A process with a high nice value yields CPU time more readily to other processes.

### Load Average

The **load average** is a set of three numbers representing the average number of processes waiting for CPU time over the last 1, 5, and 15 minutes. On a single-core machine, a load average of 1.0 means the CPU is exactly fully utilized. On a 4-core machine, a load average of 4.0 means all four cores are fully utilized. Load averages above the core count indicate processes are queuing up and waiting.

### Swap Memory

**Swap** is disk space that the OS uses as an overflow area for RAM. When physical memory is full, the OS can move ("swap out") inactive pages of memory to disk to make room. Swap is much slower than RAM (by orders of magnitude), so heavy swap usage indicates memory pressure.

### Wired Memory (macOS)

**Wired memory** is RAM that the kernel has locked and cannot be paged out to disk under any circumstances. It contains critical kernel data structures, device driver buffers, and other resources that must always be in physical RAM. You cannot reclaim wired memory without stopping the process or kernel subsystem that owns it.

### Compressed Memory (macOS)

macOS uses an in-memory **compression** system. Instead of immediately swapping inactive pages to disk, macOS compresses them in RAM. This is much faster than disk I/O. The "compressed" metric tells you how much RAM is being used to store these compressed pages.

### Active, Inactive, Purgeable, and Free Memory (macOS)

macOS categorizes physical memory pages into several states:
- **Active**: Pages currently being used or recently accessed.
- **Inactive**: Pages that were recently used but are no longer actively needed. They remain in RAM as a cache and can be quickly reclaimed.
- **Purgeable**: A subset of active memory that the app has marked as "I don't need this anymore, you can reclaim it." The OS can free purgeable pages without writing them to disk.
- **Free**: Pages not currently used by anything. On a healthy system, free memory is often low because the OS aggressively caches things in inactive pages.

### vm_stat (macOS)

`vm_stat` is a macOS command-line utility that prints Mach virtual memory statistics. It reports page counts (not byte counts) for categories like wired, active, inactive, free, and compressed. The output looks like:

```
Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12345.
Pages active:                             67890.
Pages inactive:                           11111.
Pages wired down:                         22222.
Pages occupied by compressor:             33333.
```

Each number must be multiplied by the page size (usually 16384 bytes on Apple Silicon, 4096 on older Intel Macs) to get a byte count. The `system_collector.py` file parses this output directly.

### App Memory (macOS)

**App memory** is a metric shown by macOS Activity Monitor. It is calculated as:

```
App Memory = Used Memory - Wired Memory - Compressed Memory
```

where `Used Memory = Total - Available`. It represents the memory directly attributable to user-space applications (your apps), excluding kernel overhead (wired) and compression overhead.

### Physical Cores vs. Logical Cores

- **Physical cores**: The actual hardware CPU cores on the chip.
- **Logical cores**: The number of independent execution contexts the OS sees. With Hyper-Threading (Intel) or SMT, each physical core appears as 2 logical cores. An 8-core chip with Hyper-Threading shows 16 logical cores.

### CPU Frequency

The speed at which the CPU executes instructions, measured in MHz (megahertz) or GHz (gigahertz). Modern CPUs dynamically adjust their frequency:
- **Current**: What the CPU is running at right now.
- **Min**: The lowest frequency the CPU can drop to (power saving).
- **Max**: The highest frequency the CPU can reach (boost/turbo mode).

---

## 3. File-by-File Deep Dive

### 3.1 `__init__.py`

**File**: `backend/collectors/__init__.py`

```python
from backend.collectors.system_collector import SystemCollector
from backend.collectors.process_collector import ProcessCollector
from backend.collectors.thread_collector import ThreadCollector
from backend.collectors.diff_engine import DiffEngine

__all__ = [
    "SystemCollector",
    "ProcessCollector",
    "ThreadCollector",
    "DiffEngine",
]
```

**Purpose**: This file makes `backend/collectors/` a Python package and defines its public API. The `__all__` list explicitly declares which names are exported when someone writes `from backend.collectors import *`.

**Why it matters**: Without this file, Python would not recognize the `collectors` directory as a package. The imports here also mean that other parts of the application can write:

```python
from backend.collectors import ProcessCollector, SystemCollector
```

instead of reaching into individual submodules.

---

### 3.2 `process_collector.py`

**File**: `backend/collectors/process_collector.py`

**Purpose**: Collects a comprehensive snapshot of every accessible process on the system. This is the workhorse of the collectors package -- it gathers 30+ metrics per process.

**Output data structure**: `ProcessSnapshot` (Pydantic model with fields for identity, CPU, memory, I/O, context switches, file descriptors, and network connections).

#### Class: `ProcessCollector`

This class has no `__init__` method, meaning it is stateless. Every call to `collect_all()` or `collect_one()` is independent. This is an intentional design choice: process collection does not need to remember previous state (that job belongs to `DiffEngine`).

#### Method: `collect_all()`

```python
def collect_all(self) -> list[ProcessSnapshot]:
    results: list[ProcessSnapshot] = []
    for proc in psutil.process_iter():
        snap = self._collect_one(proc)
        if snap is not None:
            results.append(snap)
    return results
```

**What it does**: Iterates over every process on the system and collects a snapshot for each one.

**The psutil call -- `psutil.process_iter()`**: This function returns an iterator of `psutil.Process` objects, one per running process. Under the hood:
- **Linux**: Reads the `/proc` filesystem. Each directory `/proc/<pid>/` represents a process. `process_iter()` calls `os.listdir('/proc')` and filters for numeric directory names.
- **macOS**: Uses the `sysctl` system call with `KERN_PROC` to enumerate all processes, or calls `proc_listpids()` from `libproc`.

**Why `None` filtering**: Some processes may vanish between the time they are enumerated and the time their details are read (race condition). Others may be owned by root and deny access to unprivileged users. The `if snap is not None` check silently skips these.

#### Method: `collect_one(pid)`

```python
def collect_one(self, pid: int) -> ProcessSnapshot | None:
    try:
        proc = psutil.Process(pid)
        return self._collect_one(proc)
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return None
```

**What it does**: Collects a snapshot for a single process by PID. Used when the frontend requests details about one specific process rather than the full list.

**The psutil call -- `psutil.Process(pid)`**: Creates a `Process` object bound to the given PID. Under the hood:
- **Linux**: Checks that `/proc/<pid>` exists.
- **macOS**: Calls `kill(pid, 0)` (signal 0 checks existence without actually sending a signal) or `proc_pidinfo()`.

#### Method: `_safe(method, default)`

```python
@staticmethod
def _safe(method: Any, default: Any = None) -> Any:
    try:
        return method()
    except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess,
            AttributeError, OSError):
        return default
```

**What it does**: A safety wrapper that calls any psutil method and catches all the ways it can fail, returning a fallback value instead of crashing.

**Why this exists**: In a system with hundreds of processes, any individual process can:
- **Exit** between the time you enumerate it and the time you read it (`NoSuchProcess`)
- **Deny access** because you are not root (`AccessDenied`)
- **Be a zombie** -- a process that has exited but whose parent has not yet called `wait()` to read its exit status (`ZombieProcess`)
- **Lack an attribute** on the current platform (`AttributeError` -- e.g., `io_counters` does not exist on macOS)
- **Fail at the OS level** for transient reasons (`OSError`)

Rather than wrapping every single line in a try/except, the `_safe` helper centralizes this logic.

**Why it is a `@staticmethod`**: It does not access any instance state (`self`). Making it static signals this clearly and avoids passing `self` unnecessarily.

#### Method: `_collect_one(proc)`

This is the core method. Let us walk through every section.

##### The `oneshot()` Context Manager

```python
with proc.oneshot():
```

**What it does**: Tells psutil to fetch all process information in a single batch rather than making separate system calls for each attribute. Under the hood:
- **Linux**: Reads `/proc/<pid>/stat`, `/proc/<pid>/status`, `/proc/<pid>/io`, and `/proc/<pid>/smaps` once, then caches the results. Subsequent calls like `proc.name()`, `proc.cpu_times()`, `proc.memory_info()` all read from this cache.
- **macOS**: Calls `proc_pidinfo()` with `PROC_PIDTASKALLINFO` to fetch everything in one Mach kernel call.

**Why it matters**: Without `oneshot()`, collecting 30 fields would make 30 separate system calls per process. With 500 processes, that is 15,000 system calls per tick. `oneshot()` reduces this to roughly 500-2,000 calls -- a 10x improvement.

##### Identity Fields

```python
pid = proc.pid
ppid = self._safe(proc.ppid, 0)
name = self._safe(proc.name, "") or ""
exe = self._safe(proc.exe, "") or ""
cmdline_parts = self._safe(proc.cmdline, []) or []
cmdline = " ".join(cmdline_parts)
status = self._safe(proc.status, "unknown") or "unknown"
username = self._safe(proc.username, "") or ""
create_time = self._safe(proc.create_time, 0.0) or 0.0
```

| Field | psutil Method | OS Mechanism (Linux) | OS Mechanism (macOS) |
|---|---|---|---|
| `pid` | `proc.pid` | Read from `/proc/<pid>` directory name | From `proc_listpids()` |
| `ppid` | `proc.ppid()` | Parse `/proc/<pid>/stat` field 4 | `proc_pidinfo(PROC_PIDTASKALLINFO)` |
| `name` | `proc.name()` | Read `/proc/<pid>/comm` | `proc_pidinfo()` or `proc_name()` |
| `exe` | `proc.exe()` | `readlink('/proc/<pid>/exe')` | `proc_pidpath()` |
| `cmdline` | `proc.cmdline()` | Read `/proc/<pid>/cmdline` (null-separated) | `sysctl(KERN_PROCARGS2)` |
| `status` | `proc.status()` | Parse `/proc/<pid>/stat` field 3 (R, S, D, Z, T) | `proc_pidinfo()` task info |
| `username` | `proc.username()` | Look up UID from `/proc/<pid>/status` in `/etc/passwd` | Same UID lookup |
| `create_time` | `proc.create_time()` | Parse start time from `/proc/<pid>/stat` field 22 | `proc_pidinfo()` |

**The `or ""` pattern**: `self._safe(proc.name, "")` could return `None` if the `_safe` wrapper catches an exception AND the default is somehow bypassed (e.g., `proc.name()` returns `None` on some edge cases). The trailing `or ""` ensures the value is never `None`.

##### CPU Fields

```python
cpu_percent = self._safe(proc.cpu_percent, 0.0) or 0.0
cpu_times = self._safe(proc.cpu_times)
if cpu_times is not None:
    cpu_time_user = cpu_times.user
    cpu_time_system = cpu_times.system
    cpu_time_children_user = getattr(cpu_times, "children_user", 0.0)
    cpu_time_children_system = getattr(cpu_times, "children_system", 0.0)
    cpu_time_iowait = getattr(cpu_times, "iowait", 0.0)
```

**`proc.cpu_percent()`**: Returns the CPU utilization as a percentage since the last call. Under the hood, it compares the process's cumulative CPU time against wall-clock time.
- **Linux**: Reads `/proc/<pid>/stat` fields 14 (utime) and 15 (stime).
- **macOS**: `proc_pidinfo(PROC_PIDTASKINFO)` to read task CPU times.

**`proc.cpu_times()`**: Returns a named tuple with cumulative CPU time broken down by category.
- `user`: Time in user mode.
- `system`: Time in kernel mode.
- `children_user` / `children_system` (Linux only): CPU time accumulated by child processes that have been waited on.
- `iowait` (Linux only): Time waiting for I/O.

**The `getattr(..., 0.0)` pattern**: `children_user`, `children_system`, and `iowait` are Linux-only fields. On macOS, the named tuple from `proc.cpu_times()` does not have these attributes. Using `getattr` with a default of `0.0` handles this gracefully without checking the platform.

##### Memory Fields

```python
mem_info = self._safe(proc.memory_info)
if mem_info is not None:
    memory_rss_bytes = mem_info.rss
    memory_vms_bytes = mem_info.vms
    memory_shared_bytes = getattr(mem_info, "shared", 0)
    memory_text_bytes = getattr(mem_info, "text", 0)
    memory_data_bytes = getattr(mem_info, "data", 0)
    memory_lib_bytes = getattr(mem_info, "lib", 0)
    memory_dirty_bytes = getattr(mem_info, "dirty", 0)
```

**`proc.memory_info()`**: Returns basic memory usage metrics.
- **Linux**: Reads `/proc/<pid>/statm` and `/proc/<pid>/status`. Returns `rss`, `vms`, `shared`, `text`, `data`, `lib`, `dirty`.
- **macOS**: Calls `proc_pidinfo(PROC_PIDTASKINFO)` for `rss` and `vms` only. The fields `shared`, `text`, `data`, `lib`, and `dirty` are Linux-specific, hence the `getattr` fallback.

**`proc.memory_full_info()`** (the extended memory section):

```python
mem_full = self._safe(proc.memory_full_info)
if mem_full is not None:
    memory_uss_bytes = getattr(mem_full, "uss", 0)
    memory_pss_bytes = getattr(mem_full, "pss", 0)
```

This is the expensive call. It computes USS and PSS.
- **Linux**: Reads `/proc/<pid>/smaps` or `/proc/<pid>/smaps_rollup` and sums per-mapping `Private_Clean + Private_Dirty` for USS and `Pss` for PSS.
- **macOS**: Uses `mach_vm_region_recurse()` Mach calls. Requires root for other users' processes.

**Why it may require root on macOS**: The comment in the code says `# Extended memory (USS / PSS) -- may require root on macOS`. On macOS, reading another process's detailed memory map requires the `task_for_pid()` Mach trap, which is restricted to processes running as root or with special entitlements.

##### Thread Count

```python
num_threads = self._safe(proc.num_threads, 0) or 0
```

- **Linux**: Reads the `Threads:` line from `/proc/<pid>/status`.
- **macOS**: `proc_pidinfo(PROC_PIDTASKINFO)` returns thread count.

##### Nice Value

```python
nice = self._safe(proc.nice, 0) or 0
```

- **Linux**: Reads from `/proc/<pid>/stat` field 19.
- **macOS**: Uses `getpriority(PRIO_PROCESS, pid)` system call.

##### I/O Counters

```python
io_method = getattr(proc, 'io_counters', None)
io = self._safe(io_method) if io_method else None
```

**Critical platform difference**: macOS does not support per-process I/O counters through `psutil`. The `io_counters` method simply does not exist on the `psutil.Process` object on macOS. The code handles this by using `getattr` to check whether the method exists at all before attempting to call it.

- **Linux**: Reads `/proc/<pid>/io` which contains `read_bytes`, `write_bytes`, `rchar`, `wchar`, `syscr`, `syscw`.
- **macOS**: Not available. Falls through to the `else` branch, setting all I/O counters to 0.

##### Context Switches

```python
ctx = self._safe(proc.num_ctx_switches)
if ctx is not None:
    ctx_vol = ctx.voluntary
    ctx_invol = ctx.involuntary
```

- **Linux**: Reads `voluntary_ctxt_switches` and `nonvoluntary_ctxt_switches` from `/proc/<pid>/status`.
- **macOS**: Uses `proc_pidinfo(PROC_PIDTASKINFO)` which includes context switch counts.

##### File Descriptors, Connections, Open Files

```python
num_fds = self._safe(proc.num_fds, 0) or 0
connections = self._safe(proc.net_connections, []) or []
num_connections = len(connections)
open_files = self._safe(proc.open_files, []) or []
num_open_files = len(open_files)
```

| Metric | Linux | macOS |
|---|---|---|
| `num_fds` | `len(os.listdir('/proc/<pid>/fd'))` | `proc_pidinfo(PROC_PIDLISTFDS)` |
| `net_connections` | Parses `/proc/<pid>/net/tcp`, `/proc/<pid>/net/udp`, etc. | `proc_pidinfo(PROC_PIDFDSOCKETINFO)` per FD |
| `open_files` | Reads `/proc/<pid>/fd` and resolves symlinks | `proc_pidinfo(PROC_PIDLISTFDS)` filtered to vnodes |

**Why we store counts, not lists**: The full list of connections or open files can be large (a web server might have thousands). Sending all of that over WebSocket every second would be expensive. Instead, the collector stores just the count. If the user clicks into a specific process, the frontend can request the full details via a separate API call.

#### Error Handling Strategy

The outer try/except in `_collect_one`:

```python
except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess,
        AttributeError, OSError):
    return None
```

This is the **last line of defense**. Even though every individual field is wrapped in `_safe()`, the method still wraps the entire body. Why? Because:
1. `proc.oneshot()` itself can raise if the process exits at just the wrong moment.
2. An unexpected combination of exceptions could slip through `_safe()`.
3. Returning `None` allows `collect_all()` to simply skip this process without crashing the entire collection cycle.

The philosophy is: **it is always better to skip one process than to crash the entire collector.**

---

### 3.3 `system_collector.py`

**File**: `backend/collectors/system_collector.py`

**Purpose**: Collects system-wide metrics -- CPU usage per core, total memory breakdown, swap status, hostname, OS version, uptime, and load averages. This gives the "big picture" view of the machine.

**Output data structure**: `SystemSnapshot`, which contains nested `CpuSnapshot` and `MemorySnapshot` models.

#### Helper Function: `_macos_vm_stat()`

```python
def _macos_vm_stat() -> dict[str, int]:
    result: dict[str, int] = {}
    try:
        raw = subprocess.check_output(["vm_stat"], text=True)
        page_match = re.search(r"page size of (\d+) bytes", raw)
        page_size = int(page_match.group(1)) if page_match else 16384
        ...
```

**What it does**: Runs the macOS `vm_stat` command and parses its output to extract memory categories that `psutil` does not provide.

**Why this exists**: `psutil.virtual_memory()` on macOS returns `total`, `available`, `used`, `free`, and `percent`, but it does NOT return wired, compressed, active, inactive, or purgeable breakdowns. macOS Activity Monitor shows these categories prominently, and users expect to see them. The only way to get this data is to shell out to `vm_stat` and parse the text.

**Step-by-step parsing**:

1. **Extract page size**: The first line of `vm_stat` output contains the page size. On Apple Silicon Macs, this is 16384 bytes (16 KB). On older Intel Macs, it is 4096 bytes (4 KB). The code parses this with a regex and falls back to 16384 if parsing fails.

2. **Map line prefixes to names**: The `mapping` dictionary maps `vm_stat` output lines to internal names:

```python
mapping = {
    "Pages wired down": "wired",
    "Pages occupied by compressor": "compressed",
    "Pages active": "active",
    "Pages inactive": "inactive",
    "Pages free": "free",
    "Pages purgeable": "purgeable",
}
```

3. **Parse values and convert to bytes**: For each line, extract the numeric page count, then multiply by page size.

```python
val = int(line.split(":")[1].strip().rstrip("."))
result[name] = val * page_size
```

The `.rstrip(".")` is necessary because `vm_stat` appends a period to each number (e.g., `12345.`).

**Error handling**: The entire function is wrapped in a bare `except Exception: pass`. If `vm_stat` is not available (e.g., on Linux), or the output format changes, the function silently returns an empty dictionary. This is acceptable because the caller checks for each key with `.get()` and defaults to 0.

#### Class: `SystemCollector`

##### `__init__(self)`

```python
def __init__(self) -> None:
    psutil.cpu_percent(percpu=True)
```

**Why this call exists**: `psutil.cpu_percent()` calculates CPU usage by comparing the current CPU times against the *previous* call's CPU times. The very first call has no previous baseline, so it always returns 0.0. By calling it once in `__init__`, we "prime the pump" so that the first real call to `collect()` returns meaningful values.

This is a common pattern when working with psutil's CPU percentage functions.

##### `collect(self) -> SystemSnapshot`

###### CPU Section

```python
usage_per_core = psutil.cpu_percent(percpu=True)
total_usage = psutil.cpu_percent(percpu=False)
freq = psutil.cpu_freq()
```

**`psutil.cpu_percent(percpu=True)`**: Returns a list of floats, one per logical core, representing CPU usage since the last call.
- **Linux**: Reads `/proc/stat` and calculates deltas for each CPU line (cpu0, cpu1, ...).
- **macOS**: Uses `host_processor_info()` Mach call to get per-CPU tick counts, then calculates deltas.

**`psutil.cpu_percent(percpu=False)`**: Returns a single float for overall CPU usage. It is called separately (not derived from per-core values) because psutil computes them from different internal caches.

**`psutil.cpu_freq()`**: Returns current, min, and max CPU frequency.
- **Linux**: Reads `/sys/devices/system/cpu/cpufreq/` or `/proc/cpuinfo`.
- **macOS**: Uses `sysctl("hw.cpufrequency")`. Note: on Apple Silicon, min/max may not be available, returning 0.

```python
cpu = CpuSnapshot(
    model_=platform.processor() or "unknown",
    physical_cores=psutil.cpu_count(logical=False) or 1,
    logical_cores=psutil.cpu_count(logical=True) or 1,
    ...
)
```

**`psutil.cpu_count(logical=False)`**: Returns the number of physical cores.
- **Linux**: Parses `/proc/cpuinfo` for unique `core id` values.
- **macOS**: `sysctl("hw.physicalcpu")`.

**`psutil.cpu_count(logical=True)`**: Returns the number of logical cores (including hyper-threads).
- **Linux**: Counts `processor` lines in `/proc/cpuinfo`.
- **macOS**: `sysctl("hw.logicalcpu")`.

The `or 1` fallback ensures we never get 0 cores (which could cause division-by-zero elsewhere).

###### Memory Section

```python
vm = psutil.virtual_memory()
swap = psutil.swap_memory()
```

**`psutil.virtual_memory()`**: Returns system-wide RAM metrics.
- **Linux**: Parses `/proc/meminfo`. Returns `total`, `available`, `used`, `free`, `buffers`, `cached`, `shared`, `percent`.
- **macOS**: Uses `vm_stat` internally (similar to the helper above) plus `sysctl("hw.memsize")` for total. Returns `total`, `available`, `used`, `free`, `active`, `inactive`, `wired`, `percent`.

**`psutil.swap_memory()`**: Returns swap space metrics.
- **Linux**: Parses `/proc/meminfo` (`SwapTotal`, `SwapFree`) or reads `/proc/swaps`.
- **macOS**: Calls `sysctl("vm.swapusage")`.

**macOS-specific memory calculation**:

```python
is_macos = platform.system() == "Darwin"
if is_macos:
    vms = _macos_vm_stat()
    wired = vms.get("wired", 0)
    compressed = vms.get("compressed", 0)
    active = vms.get("active", 0)
    inactive = vms.get("inactive", 0)
    purgeable = vms.get("purgeable", 0)
    used_bytes = vm.total - vm.available
    app_memory = max(0, used_bytes - wired - compressed)
else:
    used_bytes = vm.used
```

**Why `total - available` instead of `vm.used`**: The comment in the code explains this:

```python
# On macOS, psutil's vm.used = active + wired (excludes compressed),
# so total != used + available + free.  Use total - available instead,
# which matches Activity Monitor's "Memory Used".
```

This is a well-known quirk. macOS Activity Monitor defines "Memory Used" as `total - available`. psutil's `vm.used` uses a different formula that excludes compressed memory, leading to confusing numbers where `used + available + free != total`. The code corrects this to match what users see in Activity Monitor.

**App Memory calculation**: `max(0, used_bytes - wired - compressed)` subtracts the kernel overhead from total used memory. The `max(0, ...)` guard prevents negative values that could occur due to timing differences between the `psutil` call and the `vm_stat` call (they are not atomic).

###### System Info Section

```python
uptime_seconds = int(time.time() - psutil.boot_time())
load_avg = list(os.getloadavg())
```

**`psutil.boot_time()`**: Returns the system boot time as a Unix timestamp.
- **Linux**: Reads `/proc/stat` (`btime` line) or `/proc/uptime`.
- **macOS**: `sysctl("kern.boottime")`.

**`os.getloadavg()`**: Returns the 1-, 5-, and 15-minute load averages as a tuple of three floats. This is a POSIX function available on both Linux and macOS. Under the hood, it calls the `getloadavg()` C library function. Note: this function is not available on Windows.

---

### 3.4 `thread_collector.py`

**File**: `backend/collectors/thread_collector.py`

**Purpose**: Collects per-thread CPU metrics for a specific process. Unlike `ProcessCollector` (which is stateless), `ThreadCollector` is **stateful** -- it remembers previous CPU times so it can calculate per-thread CPU percentages.

**Output data structure**: `list[ThreadSnapshot]`

#### Class: `ThreadCollector`

##### `__init__(self)`

```python
def __init__(self):
    self._prev: dict[tuple[int, int], tuple[float, float, float]] = {}
```

**What `_prev` stores**: A dictionary keyed by `(pid, tid)` tuples. Each value is a tuple of `(user_time, system_time, timestamp)` from the previous collection tick.

**Why it is stateful**: psutil's `proc.threads()` returns cumulative CPU times (total since the thread started), not instantaneous CPU percentages. To calculate "how much CPU is this thread using right now?", you need to take two measurements and compute the delta:

```
cpu_percent = (cpu_time_now - cpu_time_previous) / (wall_time_now - wall_time_previous) * 100
```

This is the same principle behind how `top` and `htop` work.

##### `collect_threads(self, pid: int) -> list[ThreadSnapshot]`

```python
now = time.monotonic()
try:
    proc = psutil.Process(pid)
    raw_threads = proc.threads()
except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
    return []
```

**`time.monotonic()`**: A clock that always moves forward and is never adjusted (unlike `time.time()` which can jump due to NTP adjustments or daylight saving time). This is important because we divide by the elapsed time -- if the clock jumped backward, we would get a negative elapsed time and a nonsensical CPU percentage.

**`proc.threads()`**: Returns a list of named tuples, each with `(id, user_time, system_time)`.
- **Linux**: Reads `/proc/<pid>/task/` directory. Each subdirectory is a thread. Reads `/proc/<pid>/task/<tid>/stat` for CPU times.
- **macOS**: Uses `proc_pidinfo(PROC_PIDTASKALLINFO)` followed by `thread_info()` Mach calls.

**Nice value retrieval**:

```python
try:
    proc_nice = proc.nice()
except (psutil.NoSuchProcess, psutil.AccessDenied):
    proc_nice = 0
```

Threads inherit their parent process's nice value. There is no per-thread nice value exposed by psutil, so the code reads the process-level nice value and applies it to all threads. The fallback to 0 handles the case where the process exits between the `proc.threads()` call and the `proc.nice()` call.

**CPU percent calculation**:

```python
for t in raw_threads:
    key = (pid, t.id)
    seen_keys.add(key)

    total_now = t.user_time + t.system_time
    cpu_pct = 0.0

    prev = self._prev.get(key)
    if prev is not None:
        prev_user, prev_sys, prev_ts = prev
        elapsed = now - prev_ts
        if elapsed > 0:
            total_prev = prev_user + prev_sys
            cpu_pct = ((total_now - total_prev) / elapsed) * 100.0
            cpu_pct = max(0.0, min(cpu_pct, 100.0))

    self._prev[key] = (t.user_time, t.system_time, now)
```

**Step by step**:

1. Calculate the thread's total CPU time right now (`total_now`).
2. Look up the previous measurement for this `(pid, tid)`.
3. If a previous measurement exists, calculate elapsed wall-clock time.
4. CPU percent = `(delta_cpu_time / delta_wall_time) * 100`.
5. Clamp the result to `[0.0, 100.0]` to prevent nonsensical values (which can happen due to floating-point imprecision or clock skew).
6. Store the current measurement for next time.

**First tick behavior**: On the very first call for a given thread, `prev` is `None`, so `cpu_pct` stays at `0.0`. This is the "priming" behavior -- the first call establishes the baseline, and meaningful percentages appear from the second call onward.

**Stale entry cleanup**:

```python
stale = [k for k in self._prev if k[0] == pid and k not in seen_keys]
for k in stale:
    del self._prev[k]
```

**Why this is necessary**: Threads can exit between ticks. Without cleanup, the `_prev` dictionary would grow indefinitely with entries for dead threads, creating a memory leak. The code finds all entries for this PID whose TID was not seen in the current tick (meaning that thread has exited) and removes them.

**Note**: This only cleans up threads for the specific PID being collected. If the caller stops requesting a particular PID, that PID's entries will remain in `_prev` forever. In practice, this is not a significant issue because thread entries are small and PIDs are typically monitored continuously while the user is viewing them.

#### Platform Limitations

The thread collector's docstring says `(macOS only)`. However, the code itself uses only `psutil.Process.threads()`, which works on both Linux and macOS. The "macOS only" note likely refers to the fact that on macOS, psutil provides less thread-level detail (no per-thread state, no per-thread context switches, no per-thread core affinity), so many fields in `ThreadSnapshot` are filled with defaults:

```python
ThreadSnapshot(
    ...
    name=f"Thread-{t.id}",    # Generic name (macOS does not expose thread names via psutil)
    state="unknown",            # Not available on macOS
    core_id=None,               # Not available on macOS
    voluntary_ctx_switches=0,   # Not available per-thread on macOS
    involuntary_ctx_switches=0, # Not available per-thread on macOS
    stack_size_bytes=0,         # Not available on macOS
)
```

On Linux, some of these could be populated by reading `/proc/<pid>/task/<tid>/status` and `/proc/<pid>/task/<tid>/sched`, but the current implementation does not do this.

---

### 3.5 `diff_engine.py`

**File**: `backend/collectors/diff_engine.py`

**Purpose**: Computes the minimal difference between two consecutive snapshots of all processes. Instead of sending the full list of 500+ processes over WebSocket every second, the `DiffEngine` figures out what actually changed and sends only that.

**Output data structure**: `ProcessDiff` (with `new`, `updated`, and `exited` lists).

This component is critical for WebSocket performance and is explained in full detail in [Section 4](#4-diffengine----the-diffing-algorithm).

---

## 4. DiffEngine -- The Diffing Algorithm

### Why We Diff

Consider a typical system with 400 processes. Each `ProcessSnapshot` has 30+ fields. Serializing 400 snapshots to JSON produces roughly 200-400 KB. If we send this over WebSocket once per second, that is 200-400 KB/s of bandwidth -- just for process data.

But between any two ticks (seconds), most processes have not changed at all. Maybe 50 processes updated their CPU percent, 2 new processes started, and 1 exited. Sending only these changes might be 5-10 KB -- a 20-40x reduction.

This is the same principle behind video compression: instead of sending every full frame, you send the differences between frames.

### Volatile Fields

Not all fields in a `ProcessSnapshot` change frequently. For example, `name`, `exe`, `cmdline`, `username`, and `ppid` are essentially static for the lifetime of a process. It would be wasteful to compare them every tick.

The `DiffEngine` defines a list of **volatile fields** -- fields that are expected to change between ticks:

```python
_VOLATILE_FIELDS: list[str] = [
    "cpu_percent",
    "memory_rss_bytes",
    "memory_vms_bytes",
    "memory_percent",
    "num_threads",
    "status",
    "cpu_time_user",
    "cpu_time_system",
    "io_read_bytes",
    "io_write_bytes",
    "io_read_count",
    "io_write_count",
    "ctx_switches_voluntary",
    "ctx_switches_involuntary",
    "num_connections",
    "num_open_files",
    "num_fds",
]
```

These are all metrics that represent dynamic system activity: CPU usage, memory consumption, I/O activity, context switches, and resource counts.

Only these fields are compared between ticks. If a process's `name` changed (which almost never happens), the diff engine would not notice -- but this is an acceptable trade-off for the performance gain.

### The Diffing Algorithm

The `compute_diff()` method works in three phases:

#### Phase 1: Detect New Processes

```python
current_map: dict[int, ProcessSnapshot] = {p.pid: p for p in current}
prev_pids = set(self._previous.keys())
curr_pids = set(current_map.keys())

new_pids = curr_pids - prev_pids
new: list[ProcessSnapshot] = [current_map[pid] for pid in new_pids]
```

**Set difference**: `curr_pids - prev_pids` gives all PIDs present now but absent before. These are new processes. For new processes, the full `ProcessSnapshot` is included in the diff because the frontend has no prior knowledge of them.

#### Phase 2: Detect Exited Processes

```python
exited_pids = prev_pids - curr_pids
exited: list[dict] = [
    {"pid": pid, "name": self._previous[pid].name} for pid in exited_pids
]
```

**Set difference in the other direction**: `prev_pids - curr_pids` gives PIDs that were present last tick but are gone now. These processes have exited. Only the `pid` and `name` are sent (the frontend needs the PID to remove it from its list, and the name for user notifications like "Process 'python' exited").

#### Phase 3: Detect Updated Processes

```python
common_pids = curr_pids & prev_pids
for pid in common_pids:
    cur = current_map[pid]
    prev = self._previous[pid]
    changes: dict = {}
    for field in _VOLATILE_FIELDS:
        cur_val = getattr(cur, field)
        prev_val = getattr(prev, field)
        if cur_val != prev_val:
            changes[field] = cur_val
    if changes:
        changes["pid"] = pid
        updated.append(changes)
```

**Set intersection**: `curr_pids & prev_pids` gives PIDs present in both ticks -- processes that were alive before and are still alive now.

For each of these, the code compares every volatile field. Only fields whose values differ are included in the `changes` dictionary. If at least one field changed, the dictionary (plus the `pid` for identification) is appended to the `updated` list.

**Example**: If process 1234 had `cpu_percent=5.0` last tick and `cpu_percent=12.3` this tick, but all other volatile fields are unchanged, the update entry would be:

```python
{"pid": 1234, "cpu_percent": 12.3}
```

This is dramatically smaller than the full 30-field snapshot.

#### Phase 4: Store Baseline

```python
self._previous = current_map
```

The current snapshot becomes the baseline for the next tick. Note that this replaces the entire dictionary (not updating in place), which cleanly handles exited processes (they are simply not in the new dictionary).

#### The `reset()` Method

```python
def reset(self) -> None:
    self._previous.clear()
```

Clears the stored baseline. After a reset, the next call to `compute_diff()` behaves like the very first tick: all processes appear as "new" and nothing appears as "updated" or "exited". This is useful when a WebSocket client reconnects and needs a full refresh.

### Why This Matters for WebSocket Performance

The data flow is:

```
ProcessCollector.collect_all() --> full list of ProcessSnapshots
                                      |
                                      v
                              DiffEngine.compute_diff()
                                      |
                                      v
                              ProcessDiff (new, updated, exited)
                                      |
                                      v
                              Serialized to JSON
                                      |
                                      v
                              Sent over WebSocket to frontend
```

The frontend maintains its own local store of processes. When it receives a diff:
- **New** processes are added to the store.
- **Updated** processes have their changed fields merged into existing entries.
- **Exited** processes are removed from the store.

This client-side merging is fast and keeps the UI responsive, even on systems with hundreds of processes updating every second.

---

## 5. How Data Flows -- Tracing a Single Tick

Let us trace what happens during a single collection "tick" -- one iteration of the main loop that gathers data and pushes it to connected clients.

### Step 1: System Collection

The server calls `SystemCollector.collect()`:

1. `psutil.cpu_percent(percpu=True)` reads CPU time deltas since the last call and returns per-core percentages like `[12.3, 5.1, 8.7, 2.0]`.
2. `psutil.cpu_freq()` returns the current/min/max CPU frequency.
3. `psutil.virtual_memory()` returns total/available/used/free RAM.
4. On macOS, `_macos_vm_stat()` shells out to `vm_stat` and parses wired/compressed/active/inactive/purgeable page counts.
5. `psutil.swap_memory()` returns swap total/used/free.
6. `psutil.boot_time()` and `time.time()` compute uptime.
7. `os.getloadavg()` returns the 1/5/15-minute load averages.
8. All of this is packaged into a `SystemSnapshot` and returned.

### Step 2: Process Collection

The server calls `ProcessCollector.collect_all()`:

1. `psutil.process_iter()` enumerates all PIDs on the system.
2. For each PID, `_collect_one()` is called:
   a. `proc.oneshot()` batches all subsequent queries into a single OS call.
   b. 30+ fields are read from the OS via `psutil` methods wrapped in `_safe()`.
   c. A `ProcessSnapshot` Pydantic model is constructed and returned.
3. Processes that cannot be read (exited, access denied, zombie) return `None` and are silently skipped.
4. The result is a list of 300-600+ `ProcessSnapshot` objects (depending on the system).

### Step 3: Diffing

The server calls `DiffEngine.compute_diff(process_list)`:

1. The current list is indexed by PID into a dictionary.
2. PIDs in the current set but not in the previous set are identified as **new** (full snapshots included).
3. PIDs in the previous set but not in the current set are identified as **exited** (only PID and name included).
4. PIDs in both sets have their volatile fields compared. Only changed fields are included as **updates**.
5. The current dictionary becomes the new baseline.
6. A `ProcessDiff` object is returned.

### Step 4: Serialization and Transmission

The server serializes the `SystemSnapshot` and `ProcessDiff` to JSON and sends them over the WebSocket connection to each connected frontend client.

### Step 5: Thread Collection (On Demand)

If a user has a specific process's detail view open, the frontend may request thread-level data. The server calls `ThreadCollector.collect_threads(pid)`:

1. `psutil.Process(pid).threads()` returns raw thread CPU times.
2. For each thread, the delta against the previous tick is computed to derive CPU percent.
3. Stale thread entries are cleaned up.
4. A list of `ThreadSnapshot` objects is returned and sent to the requesting client.

### Timing

A typical tick takes 50-200ms depending on the number of processes and the speed of the system. The `oneshot()` optimization in `ProcessCollector` is critical to keeping this fast.

---

## 6. Glossary

| Term | Definition |
|---|---|
| **Active Memory** | RAM pages currently in use or recently accessed by processes (macOS concept). |
| **App Memory** | macOS metric: total used memory minus wired and compressed memory. Represents memory directly used by applications. |
| **Baseline** | The stored previous state that the DiffEngine compares against to compute changes. |
| **Boot Time** | The Unix timestamp of when the system was last started. |
| **Buffers** | (Linux) Memory used by the kernel for block device I/O buffers. Shown in `/proc/meminfo`. |
| **Cached Memory** | (Linux) Memory used by the kernel's page cache to store recently read file data in RAM for faster access. |
| **Clamping** | Restricting a value to stay within a defined range (e.g., `max(0.0, min(cpu_pct, 100.0))` clamps to [0, 100]). |
| **Compressed Memory** | macOS feature where inactive RAM pages are compressed in memory rather than swapped to disk, improving performance. |
| **Context Switch** | The act of saving one thread's CPU state and loading another thread's state so it can run. |
| **CPU Frequency** | The speed at which the CPU executes instructions, measured in MHz or GHz. |
| **CPU Percent** | The percentage of CPU time consumed by a process or thread during a measurement interval. |
| **CPU Time (System)** | Cumulative time a process has spent executing in kernel mode (system calls, I/O, etc.). |
| **CPU Time (User)** | Cumulative time a process has spent executing its own application code. |
| **Diff** | The set of differences between two consecutive snapshots, consisting of new, updated, and exited entries. |
| **File Descriptor (FD)** | An integer handle the OS assigns to every open file, socket, pipe, or device for a process. |
| **Free Memory** | RAM pages not currently used by any process or the kernel cache. Often low on healthy systems. |
| **Hyper-Threading** | Intel technology that allows one physical CPU core to appear as two logical cores to the OS. |
| **I/O Counters** | Cumulative counts of read/write operations and bytes transferred by a process since it started. |
| **I/O Wait** | (Linux) CPU time spent waiting for I/O operations to complete. |
| **Inactive Memory** | RAM pages that were recently used but are no longer actively needed; kept as a cache (macOS concept). |
| **Involuntary Context Switch** | A context switch caused by the OS preempting a running thread (its time slice expired). |
| **Kernel** | The core of the operating system that manages hardware, memory, processes, and system calls. |
| **Load Average** | Three numbers representing the average number of runnable processes over the last 1, 5, and 15 minutes. |
| **Logical Cores** | The number of independent execution contexts visible to the OS (includes hyper-threads). |
| **Mach Kernel** | The microkernel at the heart of macOS, derived from Carnegie Mellon's Mach project. |
| **Memory Leak** | A bug where a program allocates memory but never frees it, causing memory usage to grow over time. |
| **Nice Value** | A scheduling hint from -20 (highest priority) to +19 (lowest priority) that influences CPU allocation. |
| **NoSuchProcess** | A psutil exception raised when attempting to access a process that no longer exists. |
| **Oneshot** | A psutil optimization that batches multiple queries about a process into a single OS call. |
| **Page** | A fixed-size block of memory (typically 4 KB or 16 KB) that the OS uses as the unit of memory management. |
| **Page Size** | The size of one memory page. 4096 bytes on Intel systems, 16384 bytes on Apple Silicon. |
| **Physical Cores** | The actual hardware CPU cores on the processor chip. |
| **PID (Process Identifier)** | A unique integer assigned by the OS to each running process. |
| **PPID (Parent Process Identifier)** | The PID of the process that created (spawned) a given process. |
| **/proc Filesystem** | (Linux) A virtual filesystem at `/proc/` that exposes kernel data structures as readable files. |
| **Process** | An instance of a running program, with its own memory space, threads, and OS resources. |
| **PSS (Proportional Set Size)** | Physical memory used by a process, with shared memory divided proportionally among sharers (Linux only). |
| **psutil** | A cross-platform Python library for retrieving information on running processes and system utilization. |
| **Purgeable Memory** | Memory that an application has marked as reclaimable by the OS without needing to write to disk (macOS concept). |
| **Race Condition** | A bug that occurs when the behavior of code depends on the timing of events (e.g., a process exiting between enumeration and reading). |
| **RSS (Resident Set Size)** | The amount of physical RAM currently occupied by a process. |
| **Shared Memory** | RAM regions accessible by multiple processes simultaneously (e.g., shared libraries). |
| **Snapshot** | A point-in-time capture of all relevant metrics for a process, thread, or the system. |
| **Swap** | Disk space used as overflow for RAM. Pages moved to swap can be retrieved but at much slower speeds. |
| **sysctl** | A system call and command-line tool for reading and writing kernel parameters on BSD/macOS systems. |
| **System Call (Syscall)** | The mechanism by which a user-space program requests a service from the kernel (e.g., open, read, write). |
| **Thread** | The smallest unit of execution managed by the OS scheduler. Threads within a process share memory. |
| **TID (Thread Identifier)** | A unique integer assigned to each thread. |
| **Tick** | One iteration of the main collection loop; the time between two consecutive data snapshots. |
| **Unix Timestamp** | The number of seconds elapsed since January 1, 1970 00:00:00 UTC. |
| **Uptime** | The duration since the system was last booted, in seconds. |
| **USS (Unique Set Size)** | Physical memory unique to a process; would be freed if only this process were killed. |
| **Virtual Memory (VMS)** | The total address space mapped by a process, including both RAM-resident and non-resident pages. |
| **vm_stat** | A macOS command-line utility that prints Mach virtual memory statistics in page counts. |
| **Volatile Fields** | Fields in a ProcessSnapshot that change frequently (CPU percent, memory, I/O) and are worth comparing in diffs. |
| **Voluntary Context Switch** | A context switch caused by a thread voluntarily yielding the CPU (usually waiting for I/O). |
| **WebSocket** | A protocol providing full-duplex communication over a single TCP connection, used for real-time data streaming. |
| **Wired Memory** | RAM locked by the kernel that cannot be paged out to disk under any circumstances (macOS concept). |
| **Zombie Process** | A process that has finished execution but whose parent has not yet called `wait()` to read its exit status. Its entry remains in the process table. |
