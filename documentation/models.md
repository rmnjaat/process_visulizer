# Models Package -- In-Depth Documentation

This document provides a comprehensive, beginner-friendly explanation of every data model in the `backend/models/` package. Every technical term is defined when it first appears and collected in the glossary at the end. The goal is for someone who has never looked at operating-system internals to read this document start to finish and come away understanding exactly what each field means, why it exists, and how the operating system produces it.

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Pydantic Basics](#2-pydantic-basics)
3. [ProcessSnapshot Deep Dive](#3-processsnapshot-deep-dive)
4. [SystemSnapshot Deep Dive](#4-systemsnapshot-deep-dive)
5. [ThreadSnapshot Deep Dive](#5-threadsnapshot-deep-dive)
6. [ProcessDiff (messages.py)](#6-processdiff-messagepy)
7. [Glossary](#7-glossary)

---

## 1. Module Overview

### What this package does

The `backend/models/` package defines the **data shapes** (also called **schemas**) for every piece of information the application collects about the operating system. When the backend reads CPU usage, memory consumption, process lists, or thread details from the OS, it packs that raw data into instances of the classes defined here before sending it to the frontend over a WebSocket connection.

There are six public classes exposed through `__init__.py`:

| Class | File | Purpose |
|---|---|---|
| `CpuSnapshot` | `system.py` | One point-in-time reading of CPU hardware and usage |
| `MemorySnapshot` | `system.py` | One point-in-time reading of RAM and swap |
| `SystemSnapshot` | `system.py` | Combines `CpuSnapshot`, `MemorySnapshot`, hostname, OS name, uptime, and load average |
| `ProcessSnapshot` | `process.py` | Every measurable attribute of a single running process |
| `ThreadSnapshot` | `thread.py` | Every measurable attribute of a single thread inside a process |
| `ProcessDiff` | `messages.py` | A compact message describing what changed between two successive process-list snapshots |

### What "schema" means

A **schema** is a formal description of the structure of data: which fields exist, what type each field is, and what constraints apply. Think of it as a blueprint. If data arrives that does not match the blueprint, the schema rejects it. This protects the rest of the application from dealing with malformed or unexpected data.

### Why we use Pydantic models

Raw data from the OS comes in many formats -- integers, floats, strings, sometimes `None` when a value is unavailable. Without a schema layer, every consumer of that data would have to check types and handle edge cases on its own. Pydantic models centralize all of that:

- **Type validation** -- if a field is declared `int`, Pydantic will raise an error if you try to store a string there.
- **Default values** -- fields like `io_read_count` default to `0` because not every OS exposes I/O counters.
- **Serialization** -- a single `model_dump()` call converts the entire object to a plain Python dictionary (and from there to JSON), which is exactly what we need for the WebSocket wire format.
- **Self-documenting code** -- reading the model class tells you instantly what data is available and what type it is.

---

## 2. Pydantic Basics

### BaseModel

Every model in this package inherits from `pydantic.BaseModel`. `BaseModel` is the foundation class provided by the Pydantic library. When you create a subclass:

```python
class ProcessSnapshot(BaseModel):
    pid: int
    name: str
```

...Pydantic auto-generates an `__init__` method that accepts `pid` and `name` as arguments, validates their types, and stores them as attributes.

### Type annotations and validation

Python type annotations (the `: int`, `: float`, `: str` you see after each field name) are not just documentation -- Pydantic enforces them at runtime. If the collector hands Pydantic `pid="abc"`, Pydantic will raise a `ValidationError` because `"abc"` is not an integer. This catches bugs early.

### Default values

A field declared as:

```python
io_read_count: int = 0
```

means: "this field is an integer; if the caller does not provide a value, use `0`." Fields without a default value are **required** -- omitting them causes an error.

### model_dump()

`model_dump()` converts a model instance into a plain Python dictionary:

```python
snap = ProcessSnapshot(pid=1234, name="python", ...)
d = snap.model_dump()
# d is now {"pid": 1234, "name": "python", ...}
```

This dictionary is what gets serialized to JSON and sent over the WebSocket. The frontend receives the JSON, parses it, and uses the fields directly.

### Serialization

**Serialization** is the process of converting an in-memory object into a format that can be transmitted or stored -- in our case, JSON text. Pydantic handles the heavy lifting: it knows how to convert Python `int`, `float`, `str`, `list`, nested models, and `None` into their JSON equivalents.

### Why this matters

Without this layer, the backend would send raw, unvalidated dictionaries. A typo in a field name would silently produce `None` on the frontend. A missing field would crash the UI. Pydantic catches these problems at the source, in the backend, before data ever leaves the server.

---

## 3. ProcessSnapshot Deep Dive

**File:** `backend/models/process.py`

A `ProcessSnapshot` captures the complete observable state of one operating-system **process** at a single moment in time. A **process** is an instance of a running program. When you launch a web browser, the OS creates a process for it, assigns resources, and begins executing its code.

Below, every field is explained in detail, grouped by category.

---

### 3.1 Identity Fields

These fields answer the question: "What is this process, where did it come from, and who owns it?"

#### `entity_type: str = "process"`

A discriminator tag. Because the application also handles `ThreadSnapshot` objects (which carry `entity_type = "thread"`), this field lets any generic consumer inspect a record and know which kind of entity it represents without checking the Python class. The default value is the string `"process"`, so callers never need to supply it.

#### `pid: int`

**Process Identifier.** Every process on the system is assigned a unique integer by the **kernel** (the core of the operating system). On Linux and macOS, PIDs are positive integers, typically ranging from 1 to 32768 (Linux default) or higher (configurable up to 4194304 on modern Linux kernels; macOS uses a 99998 limit by convention). PID 1 is always the **init** process (called `launchd` on macOS, `systemd` on most Linux distributions) -- the very first userspace process started by the kernel at boot.

The OS tracks PIDs in an internal **process table**, which is a kernel data structure (often an array or hash table) that maps each PID to a **process control block** (PCB) -- a struct containing all bookkeeping information for that process.

- **Units:** Dimensionless integer.
- **Normal values:** Any positive integer. On a typical desktop system, you will see PIDs ranging from 1 to a few thousand. Servers running many containers may have PIDs in the hundreds of thousands.
- **Abnormal values:** Negative PIDs are invalid. A PID of 0 refers to the kernel's own scheduler process on some systems and should never appear as a regular user process.
- **When you would look at this:** Whenever you need to send a signal to a process (e.g., `kill 1234`), attach a debugger, or correlate log entries that include a PID.

#### `ppid: int`

**Parent Process Identifier.** The PID of the process that created this one. In Unix-like systems, every process (except PID 1) is created by another process via the `fork()` system call. The creating process is called the **parent**, and the created process is the **child**. The kernel stores the parent's PID in the child's process control block.

- **Units:** Dimensionless integer.
- **Normal values:** Any valid PID. Most user-launched applications will show a `ppid` pointing to a shell (like `bash` or `zsh`) or a desktop environment process.
- **Abnormal values:** If a parent process exits before its child, the child becomes an **orphan**. The kernel reassigns the orphan's `ppid` to PID 1 (the init process). Seeing many processes with `ppid = 1` that are not system daemons may indicate orphaned processes.
- **When you would look at this:** When building a **process tree** (a hierarchical view of parent-child relationships) or when trying to figure out which process spawned a runaway child.

#### `name: str`

The short name of the process, typically the filename of the executable without its full path. For example, a Python script might show `name = "python3"`, and a web browser might show `name = "firefox"`. The kernel derives this from the `comm` field in the task struct (Linux) or the process's Mach task info (macOS), which stores up to 15-16 characters on Linux.

- **Units:** String (no units).
- **Normal values:** Recognizable program names like `"python3"`, `"node"`, `"nginx"`.
- **Abnormal values:** An empty string may appear if the process has been created but has not yet called `exec()` to load a program image, or if the information is inaccessible due to permissions.
- **When you would look at this:** Quick identification. Sorting or filtering the process list by name is the fastest way to find the process you care about.

#### `exe: str`

The **absolute filesystem path** to the executable binary that this process is running. For example, `"/usr/bin/python3"` or `"/Applications/Firefox.app/Contents/MacOS/firefox"`. The kernel records this at the time of the `execve()` system call (the system call that replaces a process's memory image with a new program).

- **Units:** String (filesystem path).
- **Normal values:** A valid path to a file on disk.
- **Abnormal values:** An empty string if the binary has been deleted after the process was started (the process continues to run from the in-memory copy), or if the calling user lacks permission to read `/proc/<pid>/exe` (Linux) or the equivalent on macOS.
- **When you would look at this:** When `name` alone is ambiguous. Multiple versions of Python may be installed; `exe` tells you exactly which one is running.

#### `cmdline: str`

The full **command line** that was used to start this process, including all arguments. For example: `"python3 -m http.server 8080"`. On Linux, the kernel stores this in the process's address space and exposes it through `/proc/<pid>/cmdline`. On macOS, it is retrieved via the `sysctl` interface (`KERN_PROCARGS2`).

- **Units:** String.
- **Normal values:** The program name followed by any flags and arguments.
- **Abnormal values:** An empty string if the process has cleared its own command-line arguments (some programs do this for security, to hide passwords that were passed on the command line). Kernel threads on Linux often have an empty `cmdline`.
- **When you would look at this:** When you need the full context of how a process was invoked -- for example, to see which configuration file a server was pointed at, or which port it was told to listen on.

#### `status: str`

The current **scheduling state** of the process as a human-readable string. Common values:

| Value | Meaning |
|---|---|
| `"running"` | Currently executing instructions on a CPU core, or in the run queue ready to execute |
| `"sleeping"` | Waiting for an event (I/O completion, timer, signal). This is the most common state for most processes most of the time |
| `"disk-sleep"` | Uninterruptible sleep, usually waiting for disk I/O. Cannot be killed until the I/O completes |
| `"stopped"` | Paused by a signal (e.g., `SIGSTOP` or `Ctrl+Z`) |
| `"zombie"` | The process has exited, but its parent has not yet called `wait()` to collect its exit status. The process table entry remains so the parent can retrieve the exit code |
| `"idle"` | (macOS/BSD) A kernel thread that is idle |

The kernel maintains this state in the process control block. Every time the **scheduler** runs (typically thousands of times per second), it examines and potentially changes the state of each process.

- **Units:** String (enumerated value).
- **Normal values:** `"sleeping"` is by far the most common. A healthy system has most processes sleeping and a handful running.
- **Abnormal values:** A large number of `"zombie"` processes indicates a parent that is not reaping its children -- a programming bug. Processes stuck in `"disk-sleep"` for extended periods may indicate hardware problems (failing disk, hung NFS mount).
- **When you would look at this:** When diagnosing why a process appears to be "stuck" or when you see high counts of zombie processes.

#### `username: str`

The **login name** of the user who owns this process. On Unix-like systems, every process runs under a specific **user ID** (UID). The kernel stores the UID; `psutil` (the Python library used by the collectors) resolves it to a username by looking it up in `/etc/passwd` or via the name service.

- **Units:** String.
- **Normal values:** `"root"`, your own username, or system accounts like `"www-data"`, `"_windowserver"` (macOS).
- **Abnormal values:** An unrecognizable username running unexpected processes may indicate compromise.
- **When you would look at this:** Auditing which user is consuming resources, or verifying that a service is running under the correct (least-privilege) account.

#### `create_time: float`

The **Unix timestamp** (seconds since January 1, 1970, 00:00:00 UTC -- also called the **epoch**) at which this process was created. The kernel records this in the process control block at the time of the `fork()` call.

- **Units:** Seconds since epoch, as a floating-point number (the fractional part gives sub-second precision).
- **Normal values:** A number like `1711108800.0` (corresponding to a date in 2024). System daemons will have `create_time` values close to the system's boot time. Short-lived processes will have very recent timestamps.
- **Abnormal values:** A value of `0.0` typically means the information was unavailable.
- **When you would look at this:** To determine how long a process has been running (subtract `create_time` from the current time). A process that has been running for weeks might be a long-lived server; one that restarts every few seconds might be crash-looping.

---

### 3.2 CPU Fields

These fields measure how much **processor time** the process has consumed. The CPU executes instructions in discrete time slices. The kernel keeps a running tally of how many seconds of CPU time each process has used.

#### `cpu_percent: float`

The percentage of total CPU capacity this process has used over the measurement interval (typically the interval between two successive snapshots). A value of `100.0` means the process fully utilized one CPU core for the entire interval. On a machine with 8 logical cores, the theoretical maximum is `800.0` (if the process saturated all cores with multiple threads).

The calculation works by comparing the process's cumulative CPU time between two snapshots and dividing by the elapsed wall-clock time:

```
cpu_percent = ((cpu_time_at_T2 - cpu_time_at_T1) / (T2 - T1)) * 100
```

- **Units:** Percent (0.0 to `num_logical_cores * 100.0`).
- **Normal values:** Most processes sit at `0.0` because they are sleeping. A busy web server might use `5.0` to `50.0`. A build process (like `gcc` or `rustc`) might spike to `100.0` or more (multi-threaded).
- **Abnormal values:** Values consistently near the theoretical maximum for many cores may indicate a runaway process or infinite loop. Values greater than `100.0` are normal on multi-core systems if the process uses multiple threads.
- **When you would look at this:** This is the single most common metric for spotting processes that are consuming too much CPU. It is the first column most people look at in a task manager.

#### `cpu_time_user: float`

The cumulative number of seconds this process has spent executing in **user mode**. User mode is the processor privilege level at which normal application code runs. In user mode, the process cannot directly access hardware or kernel memory -- it must ask the kernel via **system calls**.

The CPU has hardware support for tracking time in user mode. On each timer interrupt (typically every 1-10 milliseconds), the kernel checks which mode the processor was in and credits the time to the appropriate counter.

- **Units:** Seconds (cumulative since process start).
- **Normal values:** Grows over the lifetime of the process. A CPU-intensive computation will accumulate user time rapidly. An I/O-bound process (mostly waiting for disk or network) will accumulate it slowly.
- **Abnormal values:** This counter should never decrease. If it does, it suggests a measurement error.
- **When you would look at this:** To determine whether a process spends its time doing computation (high `cpu_time_user`) versus making kernel calls (high `cpu_time_system`).

#### `cpu_time_system: float`

The cumulative number of seconds this process has spent executing in **kernel mode** (also called **system mode** or **supervisor mode**). Kernel mode is the highest privilege level, used when the process makes system calls -- reading files, sending network packets, allocating memory, etc. The kernel executes the system call on behalf of the process, and the time is charged to this counter.

- **Units:** Seconds (cumulative since process start).
- **Normal values:** Typically much lower than `cpu_time_user` for computation-heavy processes. For I/O-heavy processes (e.g., a file copy utility), it may be comparable to or higher than `cpu_time_user`.
- **Abnormal values:** A process with very high `cpu_time_system` relative to `cpu_time_user` may be making excessive system calls, which can be a performance problem (system calls are expensive because they require a **context switch** between user mode and kernel mode).
- **When you would look at this:** Profiling system call overhead. If a process is slow and its system time is disproportionately high, you might investigate with `strace` (Linux) or `dtruss`/`dtrace` (macOS) to see which system calls are being made.

#### `cpu_time_children_user: float`

The cumulative user-mode CPU time consumed by all **child processes** that have terminated and been waited for (via the `wait()` family of system calls) by this process. When a child exits and the parent calls `wait()`, the kernel adds the child's CPU times to the parent's `children` counters.

- **Units:** Seconds (cumulative).
- **Normal values:** Often `0.0` for processes that do not spawn children. A shell process that has launched and waited for many commands will accumulate their combined user time here.
- **Abnormal values:** This value can only increase. It does not include time from still-running children -- only those that have exited and been reaped.
- **When you would look at this:** When evaluating the total resource cost of a process and all the subprocesses it has spawned (for example, a build system like `make` that spawns many compiler invocations).

#### `cpu_time_children_system: float`

Same as `cpu_time_children_user`, but for kernel-mode time of terminated-and-reaped child processes.

- **Units:** Seconds (cumulative).
- **Normal values and use cases:** Same rationale as `cpu_time_children_user`, but measuring kernel-mode work.

#### `cpu_time_iowait: float = 0.0`

The cumulative time (in seconds) that this process was **runnable** but waiting for a disk I/O operation to complete. This metric is only available on Linux; on macOS, it defaults to `0.0`.

On Linux, when a process initiates a blocking disk read, it transitions to the "disk-sleep" (uninterruptible sleep) state. The time spent in this state is tracked by the kernel and exposed through `/proc/<pid>/stat`. Technically, `iowait` is a property of the CPU rather than the process in the global sense, but per-process I/O wait can be approximated.

- **Units:** Seconds (cumulative).
- **Normal values:** `0.0` for most processes. Processes that do heavy sequential disk I/O (databases, file indexers) may show non-zero values.
- **Abnormal values:** Very high values suggest the process is bottlenecked on disk I/O. This could mean the disk is slow, the filesystem is fragmented, or the working set does not fit in the OS page cache.
- **When you would look at this:** When a process feels slow but `cpu_percent` is low -- it may be waiting for disk rather than doing computation.

---

### 3.3 Memory Fields

These fields describe how much **RAM** (Random Access Memory) the process is using. Understanding memory in a modern OS requires knowing about **virtual memory** -- a system where each process believes it has its own private, contiguous address space, but the kernel (with hardware support from the **MMU**, the Memory Management Unit) maps that virtual space to physical RAM pages behind the scenes. A **page** is the smallest unit of memory the OS manages, typically 4096 bytes (4 KB) on x86 systems and 16384 bytes (16 KB) on Apple Silicon.

#### `memory_rss_bytes: int`

**Resident Set Size.** The number of bytes of physical RAM currently occupied by this process's pages. "Resident" means "present in physical memory right now" (as opposed to being swapped out to disk or not yet loaded). This is the most commonly cited measure of a process's actual memory consumption.

The kernel tracks this by counting the number of physical page frames mapped into the process's page table that are currently marked as present.

- **Units:** Bytes.
- **Normal values:** A simple command-line tool might use 5-20 MB (roughly 5,000,000 to 20,000,000 bytes). A web browser can easily use 500 MB to several GB. A database server may use tens of GB.
- **Abnormal values:** RSS growing without bound over time is a classic symptom of a **memory leak** -- the program allocates memory but never frees it.
- **When you would look at this:** This is the primary metric for "how much RAM is this process using right now?" It is the most useful single number for memory monitoring.

#### `memory_vms_bytes: int`

**Virtual Memory Size.** The total size of the process's virtual address space -- the sum of all mapped regions, whether they are currently in physical RAM, on disk (swapped out), or have never been accessed (lazy allocation). This number is almost always larger than RSS because it includes:

- Memory-mapped files that have not been read yet.
- Memory that was `malloc()`-ed but never touched (the kernel may not have assigned physical pages yet, thanks to **overcommit** and **demand paging**).
- Shared libraries that are mapped but not fully loaded.

- **Units:** Bytes.
- **Normal values:** Can be extremely large -- a 64-bit process might show VMS in the terabytes on some systems because the virtual address space is enormous and cheap to reserve. Do not panic at large VMS numbers; they do not mean the process is actually using that much physical RAM.
- **Abnormal values:** VMS is rarely a concern on 64-bit systems. On 32-bit systems (limited to ~3 GB of user-space virtual memory), a very high VMS can lead to address space exhaustion.
- **When you would look at this:** Mainly to understand the difference between reserved/mapped memory and actually-used memory. Compare it with RSS to see how much of the virtual space is actually resident.

#### `memory_shared_bytes: int = 0`

The number of bytes of RAM that this process shares with other processes. Shared memory can come from:

- **Shared libraries** (`.so` files on Linux, `.dylib` on macOS) -- the code pages of a library like `libc` are loaded into RAM once and mapped into every process that uses it.
- **Explicit shared memory segments** created via `mmap(MAP_SHARED)` or POSIX shared memory (`shm_open`).

The kernel tracks this using reference counts on physical page frames. If a page frame is mapped into more than one process's page table, it is shared.

- **Units:** Bytes.
- **Normal values:** Most processes will have some shared bytes due to shared libraries. A process using `libc`, `libpthread`, and a few other libraries might share 10-50 MB.
- **Abnormal values:** `0` on macOS is normal (this counter is Linux-specific; on macOS the information is not directly available and defaults to 0).
- **When you would look at this:** When analyzing total system memory usage. If you naively sum the RSS of all processes, you will double-count shared pages. Knowing the shared portion helps you calculate actual unique memory usage.

#### `memory_text_bytes: int = 0`

The amount of memory occupied by the **text segment** of the process. The text segment (also called the **code segment**) contains the executable machine instructions of the program. It is typically marked as read-only and executable by the kernel. On Linux, this is exposed through `/proc/<pid>/statm`.

- **Units:** Bytes.
- **Normal values:** Depends on the size of the compiled binary. A small C program might have a text segment of a few hundred KB. A large application like a browser can have a text segment of 100+ MB.
- **Abnormal values:** `0` on macOS (not available; defaults to 0).
- **When you would look at this:** When analyzing the memory footprint of compiled code versus data. If text bytes are very large, the binary itself is large.

#### `memory_data_bytes: int = 0`

The amount of memory used by the **data segment** and **heap** of the process. The data segment holds global and static variables. The **heap** is the region from which dynamic memory allocation (`malloc()`, `new`, etc.) draws. This value grows as the process allocates more dynamic memory.

- **Units:** Bytes.
- **Normal values:** Proportional to how much data the process has allocated. A program processing a large dataset in memory will show high data bytes.
- **Abnormal values:** `0` on macOS (not available; defaults to 0). On Linux, a constantly growing value with no corresponding free operations indicates a memory leak.
- **When you would look at this:** To distinguish between code memory and data memory when profiling.

#### `memory_lib_bytes: int = 0`

The amount of memory used by **shared library** mappings for this process. This is a Linux-specific metric from `/proc/<pid>/statm`. It is the sum of the sizes of all shared library regions in the process's virtual memory map.

- **Units:** Bytes.
- **Normal values:** Depends on how many shared libraries the process loads. A typical process might map 20-50 shared libraries.
- **Abnormal values:** `0` on macOS (defaults to 0).
- **When you would look at this:** Rarely examined directly. Useful for deep memory profiling to understand library overhead.

#### `memory_dirty_bytes: int = 0`

The amount of memory that has been modified (**dirtied**) but not yet written back to disk. In a virtual memory system, when a process writes to a memory-mapped file or a copy-on-write page, the kernel marks that page as "dirty." Dirty pages must be written to disk (flushed) before the physical page frame can be reclaimed.

- **Units:** Bytes.
- **Normal values:** Varies. A process actively writing to memory-mapped files will have more dirty pages. The kernel periodically flushes dirty pages in the background.
- **Abnormal values:** `0` on macOS (defaults to 0). On Linux, a very large dirty byte count might indicate the process is producing data faster than the disk can absorb it.
- **When you would look at this:** When investigating I/O write performance. Many dirty pages can cause latency spikes when the kernel decides to flush them.

#### `memory_percent: float`

The percentage of total system RAM consumed by this process. Calculated as:

```
memory_percent = (memory_rss_bytes / total_physical_ram) * 100
```

- **Units:** Percent (0.0 to 100.0).
- **Normal values:** Most processes use less than 1%. A database or browser might use 5-20%.
- **Abnormal values:** A single process approaching 90-100% is likely starving the rest of the system.
- **When you would look at this:** Quick at-a-glance assessment of which process is the biggest memory consumer.

#### `memory_uss_bytes: int = 0`

**Unique Set Size.** The number of bytes of physical memory that are private to this process -- memory that would be freed if this process, and only this process, were terminated. It excludes all shared pages. This is the most accurate measure of a process's "true" memory cost.

Computing USS requires walking the process's page table and checking the reference count of each physical page frame -- it is more expensive to compute than RSS.

- **Units:** Bytes.
- **Normal values:** Always less than or equal to RSS (since RSS includes shared pages). For a process that shares many libraries, USS may be significantly less than RSS.
- **Abnormal values:** `0` if the data is unavailable (the collection may be disabled for performance reasons).
- **When you would look at this:** When you need to answer "exactly how much memory would I save if I killed this process?" This is the gold-standard metric for per-process memory accounting.

#### `memory_pss_bytes: int = 0`

**Proportional Set Size.** A compromise between RSS and USS. For shared pages, instead of counting the full page size, PSS divides it by the number of processes sharing that page. If a 4 KB page is shared by 4 processes, each process is charged 1 KB toward its PSS.

```
PSS = USS + (each shared page's size / number of sharers)
```

This metric has the useful property that the sum of PSS across all processes approximates the total physical memory in use, without double-counting.

- **Units:** Bytes.
- **Normal values:** Between USS and RSS.
- **Abnormal values:** `0` if unavailable. Only reliably available on Linux (via `/proc/<pid>/smaps_rollup`).
- **When you would look at this:** When you need a fair, non-double-counting measure of each process's memory usage for system-wide accounting.

---

### 3.4 Thread Count

#### `num_threads: int`

The number of **threads** currently active inside this process. A thread is the smallest unit of execution scheduled by the kernel. A process always has at least one thread (the **main thread**). Multi-threaded programs create additional threads to perform work concurrently.

The kernel tracks threads in the same process table (on Linux, threads are implemented as lightweight processes sharing the same memory space, created with the `clone()` system call with the `CLONE_THREAD` flag).

- **Units:** Dimensionless count.
- **Normal values:** 1 for simple single-threaded programs. Web servers, browsers, and JVM-based applications routinely run 20-200 threads. Some applications (like databases) may run thousands.
- **Abnormal values:** A thread count that keeps increasing without bound suggests a **thread leak** -- the program creates threads but never joins or terminates them.
- **When you would look at this:** When diagnosing performance. Too many threads can cause excessive context switching, thrashing the CPU caches and reducing throughput.

---

### 3.5 Scheduling

#### `nice: int`

The **nice value** of the process, which influences its scheduling priority. The name comes from the idea of being "nice" to other processes by voluntarily reducing your own priority. The range is **-20 to +19** on Unix-like systems:

- `-20` = highest priority (least "nice" -- this process demands more CPU time)
- `0` = default priority
- `+19` = lowest priority (most "nice" -- this process yields to others)

The kernel's scheduler uses the nice value to calculate the process's **dynamic priority**, which determines how much CPU time it receives relative to other runnable processes. Only the root user (or a process with the `CAP_SYS_NICE` capability on Linux) can set negative nice values (i.e., increase priority).

- **Units:** Dimensionless integer (-20 to +19).
- **Normal values:** `0` for most processes.
- **Abnormal values:** A process at `-20` that is consuming significant CPU may be starving other processes of CPU time. Batch jobs and background tasks are often set to `+10` or higher.
- **When you would look at this:** When a lower-priority task is consuming CPU and you want to verify or adjust its priority. The `nice` and `renice` commands let you change this at runtime.

---

### 3.6 I/O Fields

These fields measure how much disk (or general block device) I/O the process has performed. On Linux, these come from `/proc/<pid>/io`. On macOS, per-process I/O counters have limited availability, so these often default to `0`.

#### `io_read_count: int = 0`

The total number of **read system calls** (e.g., `read()`, `pread()`) the process has made. Each call to read data from a file, pipe, socket, or device increments this counter by one, regardless of how many bytes were read.

- **Units:** Count (dimensionless).
- **Normal values:** Depends entirely on the workload. A log-tailing process might perform millions of reads.
- **Abnormal values:** Defaults to `0` on macOS.
- **When you would look at this:** To determine if a process is I/O-bound due to a high number of small reads (which is often less efficient than fewer, larger reads).

#### `io_write_count: int = 0`

The total number of **write system calls** (e.g., `write()`, `pwrite()`). Same logic as `io_read_count`, but for writes.

- **Units:** Count (dimensionless).
- **Normal values and use cases:** Same rationale as `io_read_count`.

#### `io_read_bytes: int = 0`

The total number of bytes this process has caused to be fetched from the storage layer. This includes bytes read from disk and from the kernel's **page cache** (an in-memory cache of recently read file data).

- **Units:** Bytes (cumulative since process start).
- **Normal values:** A video editor loading a large file might show billions of bytes. A small CLI tool might show a few MB.
- **Abnormal values:** Defaults to `0` on macOS.
- **When you would look at this:** When investigating slow performance that you suspect is caused by excessive disk reading. Compare with wall-clock time to estimate throughput.

#### `io_write_bytes: int = 0`

The total number of bytes this process has sent to the storage layer.

- **Units:** Bytes (cumulative since process start).
- **Normal values and use cases:** Same rationale as `io_read_bytes`, but for writes. A logging-heavy application or a database might show high write bytes.

---

### 3.7 Context Switch Fields

A **context switch** occurs when the kernel saves the state of one running thread/process (its registers, program counter, stack pointer, etc.) and loads the saved state of another so that the CPU can execute it. Context switches are fundamental to multitasking.

#### `ctx_switches_voluntary: int`

The number of times this process **voluntarily** relinquished the CPU before its time slice expired. This happens when a process makes a system call that blocks (e.g., waiting for disk I/O, sleeping, waiting for a lock, reading from a socket with no data available). The process cannot continue until the event completes, so it tells the scheduler "I have nothing to do right now."

- **Units:** Count (cumulative since process start).
- **Normal values:** An I/O-bound process will have a very high voluntary context switch count. A web server waiting for network requests will accumulate these rapidly.
- **Abnormal values:** This value should never decrease.
- **When you would look at this:** To characterize the workload. A high voluntary switch count relative to involuntary switches means the process spends most of its time waiting for external events (I/O-bound). This is normal for servers.

#### `ctx_switches_involuntary: int`

The number of times this process was **forcibly** preempted by the scheduler -- the process still had work to do, but its **time quantum** (the maximum amount of time the scheduler allows a process to run before giving another process a turn) expired, or a higher-priority process became runnable.

- **Units:** Count (cumulative since process start).
- **Normal values:** A CPU-bound process will have a high involuntary context switch count because it keeps using its entire time quantum.
- **Abnormal values:** An extremely high involuntary switch rate, combined with many runnable processes, suggests **CPU contention** -- more threads want to run than there are CPU cores available.
- **When you would look at this:** When diagnosing scheduling contention. If involuntary switches are very high, the process is getting preempted frequently, which hurts cache locality and performance.

---

### 3.8 File Descriptor and Connection Fields

#### `num_fds: int`

The number of **file descriptors** currently open by this process. A **file descriptor** (FD) is a small non-negative integer that the kernel uses as a handle for an open file, socket, pipe, device, or other I/O resource. When a process opens a file with `open()`, the kernel returns a file descriptor. The process uses that FD for all subsequent operations on that file (`read()`, `write()`, `close()`).

Every process starts with three standard file descriptors:
- FD 0: **stdin** (standard input)
- FD 1: **stdout** (standard output)
- FD 2: **stderr** (standard error)

The kernel maintains a per-process **file descriptor table** that maps each FD to an entry in the system-wide **open file table**.

- **Units:** Count (dimensionless).
- **Normal values:** A simple process might use 5-20 FDs. A web server or database can easily use hundreds or thousands.
- **Abnormal values:** A count that keeps growing without bound indicates an **FD leak** -- the process opens files or sockets but never closes them. Each process has a limit (typically 1024 by default on Linux, configurable with `ulimit -n`). Hitting the limit causes subsequent `open()` calls to fail with `EMFILE` ("Too many open files").
- **When you would look at this:** Diagnosing "too many open files" errors, or monitoring server processes that handle many concurrent connections.

#### `num_connections: int`

The number of active **network connections** (TCP, UDP, Unix sockets) held by this process. Each network connection is represented internally by a socket, which is accessed via a file descriptor.

- **Units:** Count (dimensionless).
- **Normal values:** A web server might have hundreds of connections. A desktop application might have 5-10.
- **Abnormal values:** An unexpectedly high connection count might indicate a connection leak (connections not being properly closed) or a distributed denial-of-service (DDoS) attack flooding the server with connections.
- **When you would look at this:** Monitoring server load. The number of connections is a key capacity metric for any network-facing service.

#### `num_open_files: int`

The number of regular **files** (as opposed to sockets, pipes, or devices) currently open by this process. This is a subset of the file descriptors counted by `num_fds` -- only those that point to actual filesystem files.

- **Units:** Count (dimensionless).
- **Normal values:** Varies by application. A text editor might have a handful of files open. A database might have hundreds (data files, log files, temporary files).
- **Abnormal values:** Persistent growth may indicate a file handle leak.
- **When you would look at this:** When investigating file-related resource exhaustion or auditing which files a process has open.

---

## 4. SystemSnapshot Deep Dive

**File:** `backend/models/system.py`

`SystemSnapshot` captures the global state of the entire machine -- CPU hardware and usage, RAM and swap status, and system metadata. It is composed of three parts: top-level metadata fields, a nested `CpuSnapshot`, and a nested `MemorySnapshot`.

---

### 4.1 Top-Level Fields

#### `hostname: str`

The network name of the machine, as returned by `socket.gethostname()` or the `hostname` command. This is the name other computers use to address this machine on the local network.

- **Units:** String.
- **When you would look at this:** Identifying which machine you are monitoring, especially in a multi-machine setup.

#### `os: str`

A string identifying the operating system, such as `"Darwin"` (macOS), `"Linux"`, or `"Windows"`.

- **Units:** String.
- **When you would look at this:** The application collects different metrics depending on the OS. This field lets the frontend know which OS-specific fields will be populated.

#### `uptime_seconds: int`

The number of seconds since the machine was last booted. Calculated as:

```
uptime_seconds = current_time - boot_time
```

The kernel records the boot time at startup. On Linux, it is available in `/proc/uptime`. On macOS, it is retrieved via `sysctl kern.boottime`.

- **Units:** Seconds (integer).
- **Normal values:** A server that has been running for 30 days will show approximately `2,592,000` seconds.
- **Abnormal values:** A very low uptime on a machine that should be stable may indicate unexpected reboots or crashes.
- **When you would look at this:** Verifying system stability. Frequent reboots are a red flag.

#### `load_average: list[float]`

A list of three floating-point numbers representing the system's **load average** over the last 1, 5, and 15 minutes, respectively. For example: `[2.5, 1.8, 1.2]`.

**What load average actually means mathematically:**

Load average is an exponentially decaying moving average of the number of processes that are either:
1. Currently **running** on a CPU core, or
2. In the **run queue**, waiting for a CPU core to become available, or
3. (On Linux only) In **uninterruptible sleep** (waiting for disk I/O).

The kernel samples this count at fixed intervals (every 5 seconds on Linux) and updates three exponentially weighted moving averages with different decay constants corresponding to 1-minute, 5-minute, and 15-minute windows.

The exponential formula (on Linux) is:

```
load_avg = load_avg * exp(-interval/window) + n * (1 - exp(-interval/window))
```

where `n` is the current count of runnable + uninterruptible processes, `interval` is the sampling interval (5 seconds), and `window` is 60, 300, or 900 seconds.

**Interpreting the values:**

- On a single-core machine, a load average of `1.0` means the CPU is exactly fully utilized -- one process is always ready to run.
- On a 4-core machine, a load average of `4.0` means all four cores are fully utilized.
- A load average *above* the number of logical cores means processes are queuing up, waiting for CPU time.

**Comparing the three values tells you the trend:**
- `[8.0, 4.0, 2.0]` -- load is increasing (getting worse).
- `[2.0, 4.0, 8.0]` -- load is decreasing (recovering from a spike).
- `[3.0, 3.0, 3.0]` -- load is stable.

- **Units:** Dimensionless (average count of runnable processes).
- **Normal values:** Less than or equal to the number of logical CPU cores.
- **Abnormal values:** Sustained values significantly above the core count indicate CPU saturation.
- **When you would look at this:** As a quick health check. Load average is one of the first metrics sysadmins examine when a machine "feels slow."

---

### 4.2 CpuSnapshot

#### `model_: str`

The brand and model name of the CPU, such as `"Apple M2 Pro"` or `"Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz"`. This string is retrieved from `/proc/cpuinfo` on Linux or `sysctl machdep.cpu.brand_string` on macOS.

Note: The field is named `model_` (with a trailing underscore) rather than `model` to avoid a naming conflict with Pydantic's internal `model` namespace. The `Config` class has `populate_by_name = True` to allow aliased assignment.

- **Units:** String.
- **When you would look at this:** Knowing the CPU model helps you understand the expected performance characteristics and look up specifications.

#### `physical_cores: int`

The number of **physical CPU cores**. A physical core is an independent processing unit on the CPU die, with its own execution pipeline, ALU (Arithmetic Logic Unit), and register file.

- **Units:** Count (dimensionless).
- **Normal values:** Desktop machines typically have 4-16 physical cores. Server machines may have 32-128 or more.
- **When you would look at this:** Capacity planning and understanding the maximum parallelism your hardware supports.

#### `logical_cores: int`

The number of **logical CPU cores**, also called **hardware threads**. If the CPU supports **Simultaneous Multithreading** (SMT) -- called **Hyper-Threading** on Intel processors -- each physical core can present itself as two (or more) logical cores. Apple Silicon chips do not use SMT (each physical core is one logical core), but they have a mix of performance and efficiency cores.

```
logical_cores = physical_cores * threads_per_core
```

- **Units:** Count (dimensionless).
- **Normal values:** Equal to `physical_cores` (no SMT) or `2 * physical_cores` (with SMT/Hyper-Threading).
- **When you would look at this:** Load average and `cpu_percent` values are most meaningful when compared against `logical_cores`. A `total_usage` of 100% on a 16-logical-core machine means all 16 logical cores are fully utilized.

#### `frequency_mhz: float`

The current operating frequency of the CPU in **megahertz** (millions of cycles per second). Modern CPUs dynamically adjust their frequency based on load and thermal conditions -- this is called **Dynamic Voltage and Frequency Scaling** (DVFS), or commercially known as "Turbo Boost" (Intel) and "Turbo Core" (AMD).

- **Units:** MHz.
- **Normal values:** Varies by CPU. Might idle at 800 MHz and boost to 5000 MHz under load.
- **When you would look at this:** Performance profiling. If the frequency is unexpectedly low, the CPU might be thermal throttling.

#### `frequency_min_mhz: float`

The minimum operating frequency supported by the CPU. This is the frequency the CPU drops to when idle to conserve power.

- **Units:** MHz.

#### `frequency_max_mhz: float`

The maximum rated frequency of the CPU. This is the highest frequency it can achieve under Turbo Boost / Turbo Core.

- **Units:** MHz.

#### `usage_per_core: list[float]`

A list of floating-point values, one per logical core, each representing the percentage of time that core spent doing work (not idle) during the measurement interval. The length of this list equals `logical_cores`.

CPU usage per core is calculated by the kernel by measuring the time spent in different states (user, system, idle, iowait, etc.) between two clock ticks and computing:

```
usage = (1 - (idle_time / total_time)) * 100
```

- **Units:** Percent per core (0.0 to 100.0 each).
- **Normal values:** On a lightly loaded system, most cores will be near 0-10%. Under heavy load, some or all cores will approach 100%.
- **Abnormal values:** If one core is at 100% while all others are near 0%, a single-threaded workload is bottlenecked on that core.
- **When you would look at this:** Identifying single-threaded bottlenecks or uneven load distribution across cores.

#### `total_usage: float`

The overall CPU usage as a single percentage, averaged across all logical cores. If you have 8 logical cores and `usage_per_core` is `[100, 0, 0, 0, 0, 0, 0, 0]`, then `total_usage` would be approximately `12.5`.

- **Units:** Percent (0.0 to 100.0).
- **When you would look at this:** As the single most important CPU health metric. A value consistently above 80-90% indicates the system is CPU-saturated.

---

### 4.3 MemorySnapshot

This model captures the complete state of the machine's physical memory (RAM) and virtual memory (swap). Some fields are Linux-specific, others are macOS-specific, and some are universal.

#### `total_bytes: int`

The total amount of physical RAM installed in the machine.

- **Units:** Bytes.
- **Normal values:** A typical development machine might have 8-32 GB (8,589,934,592 to 34,359,738,368 bytes). A server might have 64-512 GB.
- **When you would look at this:** To understand the machine's capacity. All percentage calculations reference this as the denominator.

#### `available_bytes: int`

An estimate of how many bytes of memory are available for new allocations **without causing swapping**. This is not the same as `free_bytes`. The kernel considers free memory plus cached/buffered memory that can be quickly reclaimed if needed.

On Linux, this value comes from `MemAvailable` in `/proc/meminfo`, which was introduced in kernel 3.14 specifically to provide a reliable "how much memory can I use?" answer.

On macOS, the equivalent is calculated by `psutil` as `free + inactive` memory (pages that have not been recently accessed and can be reclaimed).

- **Units:** Bytes.
- **Normal values:** On a healthy system, this should be a significant fraction of `total_bytes` -- at least 10-20% to avoid pressure.
- **Abnormal values:** When `available_bytes` approaches zero, the system is under severe memory pressure and will start swapping heavily, leading to dramatic performance degradation.
- **When you would look at this:** This is the most important single memory metric. If you can only look at one number, look at this one.

#### `used_bytes: int`

The amount of memory actively in use. The definition varies slightly by OS:
- **Linux:** `total - free - buffers - cached`
- **macOS:** `total - available` (approximately `wired + app_memory + compressed`)

- **Units:** Bytes.
- **When you would look at this:** General awareness of memory consumption.

#### `free_bytes: int`

The amount of memory that is completely unused -- not allocated, not cached, not buffered. On a well-functioning system with plenty of RAM, `free_bytes` may actually be quite low because the kernel aggressively uses "spare" RAM for the **page cache** (caching recently read file data). Low `free_bytes` does not necessarily mean the system is short on memory -- check `available_bytes` instead.

- **Units:** Bytes.
- **Normal values:** Can be very low on a healthy system (the kernel prefers to use RAM for caching rather than leaving it idle).
- **When you would look at this:** Together with `available_bytes` and `cached_bytes` to understand the full memory picture. A common mistake is looking at `free_bytes` alone and concluding the system is out of memory, when in fact the cached memory can be reclaimed.

#### `percent: float`

The percentage of RAM in use:

```
percent = ((total_bytes - available_bytes) / total_bytes) * 100
```

- **Units:** Percent (0.0 to 100.0).
- **Normal values:** 40-70% is typical for a machine in active use. Above 85-90% means memory pressure is building.
- **Abnormal values:** Above 95% consistently is a problem.
- **When you would look at this:** Quick assessment of memory health.

#### `cached_bytes: int = 0`

**(Linux-specific, defaults to 0 on macOS.)** The amount of memory used by the kernel's **page cache** -- an in-memory copy of recently read file data. The page cache dramatically speeds up repeated reads of the same files. This memory is "used" in the sense that it contains data, but it is "available" in the sense that the kernel will discard it immediately if a process needs the RAM.

- **Units:** Bytes.
- **Normal values:** Can be many GB on a server with plenty of RAM.
- **When you would look at this:** Understanding why `free_bytes` is low. Cached bytes are essentially "free memory with benefits."

#### `buffers_bytes: int = 0`

**(Linux-specific, defaults to 0 on macOS.)** The amount of memory used for kernel buffer cache -- metadata and raw block device data. Similar to `cached_bytes` but for filesystem metadata (inodes, directory entries) and block device I/O buffers.

- **Units:** Bytes.
- **Normal values:** Typically a small fraction of total RAM (a few hundred MB to a few GB).

#### `shared_bytes: int = 0`

**(Linux-specific, defaults to 0 on macOS.)** The amount of memory used by **tmpfs** (temporary filesystem mounted in RAM) and shared memory segments. This corresponds to the `Shmem` field in `/proc/meminfo`.

- **Units:** Bytes.

#### `wired_bytes: int = 0`

**(macOS-specific, defaults to 0 on Linux.)** Memory that is **wired down** -- locked into physical RAM and cannot be swapped out or paged out under any circumstances. This includes the kernel itself, critical kernel data structures, and memory that applications have explicitly locked with `mlock()`. In macOS's Activity Monitor, this appears as "Wired Memory."

- **Units:** Bytes.
- **Normal values:** Typically 2-6 GB on a macOS system. Grows with system load.
- **Abnormal values:** Wired memory growing without bound may indicate a kernel extension or driver bug.
- **When you would look at this:** When diagnosing macOS memory pressure. Wired memory cannot be reclaimed, so it sets a floor on memory usage.

#### `compressed_bytes: int = 0`

**(macOS-specific, defaults to 0 on Linux.)** The amount of memory that macOS's built-in memory compressor has compressed. When physical RAM becomes scarce, macOS compresses the contents of inactive pages rather than swapping them to disk. This is faster than disk I/O because the CPU can decompress pages in microseconds, whereas reading from a spinning disk takes milliseconds and even SSDs take tens of microseconds.

- **Units:** Bytes (the size of the data *before* compression; i.e., how much RAM would be needed if the data were uncompressed).
- **Normal values:** Increases as memory pressure builds. A few GB is normal under moderate load.
- **When you would look at this:** As an early warning of memory pressure on macOS. If compressed memory is growing, the system is starting to feel the pinch but has not yet resorted to swapping.

#### `app_memory_bytes: int = 0`

**(macOS-specific, defaults to 0 on Linux.)** The amount of memory used by application processes, as defined by macOS. This is roughly the sum of all processes' "Memory" column in Activity Monitor. It includes pages that are currently in use by applications but excludes wired (kernel) memory and cached/purgeable memory.

- **Units:** Bytes.
- **When you would look at this:** To understand how much of the total memory pressure is coming from applications versus the kernel.

#### `inactive_bytes: int = 0`

**(macOS-specific, defaults to 0 on Linux.)** Memory that is allocated but has not been recently accessed. The kernel maintains a list of inactive pages that are candidates for reclamation. If a process accesses an inactive page, it moves back to the active list. If the kernel needs the memory, it can reclaim inactive pages (either by discarding them if they are clean copies of file data, or by compressing/swapping them if they contain modified data).

- **Units:** Bytes.
- **Normal values:** A healthy macOS system will have a substantial pool of inactive memory.
- **When you would look at this:** Understanding the kernel's memory management. Inactive memory is a buffer that the system can reclaim if needed.

#### `purgeable_bytes: int = 0`

**(macOS-specific, defaults to 0 on Linux.)** Memory that an application has marked as "purgeable" -- the application is telling the kernel "I can reconstruct this data if you need the RAM, so feel free to discard it." This is commonly used for caches within applications (e.g., decoded image data, pre-computed thumbnails).

- **Units:** Bytes.
- **When you would look at this:** Rarely. This is a refinement of how macOS accounts for reclaimable memory.

#### `swap_total_bytes: int`

The total size of configured **swap space**. **Swap** (also called **virtual memory** on Windows, or **paging space**) is a region on disk that the kernel uses as overflow when physical RAM is full. The kernel moves ("swaps out") inactive pages from RAM to disk to free up physical memory for active processes, and brings them back ("swaps in" or "pages in") when they are accessed again.

On Linux, swap is typically a dedicated disk partition or a swap file. On macOS, swap files are created dynamically in `/private/var/vm/`.

- **Units:** Bytes.
- **Normal values:** Commonly 1-2x the amount of physical RAM, though some systems use less or none at all.
- **When you would look at this:** To know the total fallback capacity beyond physical RAM.

#### `swap_used_bytes: int`

The amount of swap space currently in use.

- **Units:** Bytes.
- **Normal values:** Zero is ideal -- it means everything fits in RAM. A small amount of swap usage (a few hundred MB) is acceptable and may just be rarely-used pages of idle processes.
- **Abnormal values:** GB-scale swap usage combined with frequent swap-in/swap-out activity (called **thrashing**) causes severe performance degradation because disk I/O is orders of magnitude slower than RAM access.
- **When you would look at this:** When the system feels slow and you suspect memory pressure. High swap usage confirms that RAM is insufficient for the current workload.

#### `swap_free_bytes: int`

The amount of swap space that is still available:

```
swap_free_bytes = swap_total_bytes - swap_used_bytes
```

- **Units:** Bytes.
- **When you would look at this:** If swap-free approaches zero, the system is in serious trouble -- it has exhausted both RAM and swap. The Linux **OOM killer** (Out-of-Memory killer) may start terminating processes.

#### `swap_percent: float`

The percentage of swap space in use:

```
swap_percent = (swap_used_bytes / swap_total_bytes) * 100
```

- **Units:** Percent (0.0 to 100.0).
- **When you would look at this:** As a quick health metric. Below 20% is usually fine. Above 50% warrants investigation.

---

### 4.4 macOS vs. Linux Memory Differences

The `MemorySnapshot` model accommodates both operating systems, but they manage and categorize memory differently:

| Concept | Linux | macOS |
|---|---|---|
| **Page cache / buffers** | Explicitly tracked in `cached_bytes` and `buffers_bytes`. These fields will be non-zero. | Not exposed separately. macOS uses a unified buffer cache, and these fields default to `0`. |
| **Wired memory** | No direct equivalent (there is "Slab" memory, but it is not directly comparable). `wired_bytes` will be `0`. | Explicitly tracked. Wired memory is locked in RAM and cannot be paged out. |
| **Compressed memory** | Linux has `zswap` and `zram`, but they are not exposed through the same interface. `compressed_bytes` will be `0`. | Core feature. macOS compresses inactive pages in RAM before resorting to disk swap. |
| **App memory** | Not a standard Linux metric. `app_memory_bytes` will be `0`. | Reported by Activity Monitor. |
| **Inactive memory** | Linux uses "active" and "inactive" lists internally but they are not commonly surfaced. `inactive_bytes` will be `0`. | Important for understanding memory reclamation. |
| **Purgeable memory** | No equivalent. `purgeable_bytes` will be `0`. | Used by macOS apps to mark reclaimable caches. |
| **Available memory** | Directly reported as `MemAvailable` in `/proc/meminfo`. | Estimated as `free + inactive`. |
| **Swap** | Usually a fixed-size partition or file. | Dynamically sized swap files, growing as needed. |

---

## 5. ThreadSnapshot Deep Dive

**File:** `backend/models/thread.py`

A `ThreadSnapshot` captures the state of a single **thread** within a process.

### Threads vs. Processes

A **process** is a resource container: it owns a virtual address space, file descriptors, signal handlers, and credentials. A **thread** is a unit of execution within a process. All threads in the same process share the same memory space, file descriptors, and other resources, but each thread has its own:

- **Program counter** (which instruction is currently being executed)
- **Stack** (local variables, function call history)
- **Register state** (the contents of CPU registers)
- **Thread ID** (a unique identifier)

Threads are lighter-weight than processes because creating a thread does not require duplicating the entire address space (which `fork()` does for processes, at least conceptually, though copy-on-write optimizes this). On Linux, both processes and threads are represented by the same kernel data structure (`task_struct`); the distinction is that threads share their parent's memory mappings (they are created with `clone(CLONE_VM | CLONE_THREAD | ...)`).

---

### 5.1 Fields

#### `entity_type: str = "thread"`

Discriminator tag, analogous to `ProcessSnapshot.entity_type`. Always `"thread"`.

#### `tid: int`

**Thread Identifier.** A unique integer assigned by the kernel to this thread. On Linux, every thread has a unique TID (which is actually the same as the PID of the internal kernel task). The "main thread" of a process has a TID equal to the process's PID. Additional threads get their own TIDs from the same PID namespace.

On macOS, `psutil` reports the Mach thread port number as the TID.

- **Units:** Dimensionless integer.
- **Normal values:** Any positive integer.
- **When you would look at this:** Correlating per-thread performance data. If one thread is consuming excessive CPU, the TID tells you which one to investigate with a debugger or profiler.

#### `pid: int`

The PID of the process that owns this thread. This links the thread back to its parent `ProcessSnapshot`.

- **Units:** Dimensionless integer.

#### `name: str`

The name of the thread. On Linux, threads can be named using `pthread_setname_np()`, and the name appears in `/proc/<pid>/task/<tid>/comm`. Applications that name their threads (e.g., a web server might name threads "worker-1", "worker-2", "io-thread") make debugging much easier. If the thread is not named, this may be an empty string or a default name.

- **Units:** String.
- **Normal values:** Descriptive names like `"main"`, `"GC-thread"`, `"worker-0"`, `"signal-handler"`.
- **When you would look at this:** When profiling a multi-threaded application. Named threads make it immediately clear which thread is doing what.

#### `state: str = "unknown"`

The scheduling state of the thread, similar to `ProcessSnapshot.status` but at the thread level. Possible values depend on the OS and include `"running"`, `"sleeping"`, `"waiting"`, `"stopped"`, and `"unknown"` (the default if the information is not available).

On Linux, each thread has its own state visible in `/proc/<pid>/task/<tid>/status`.

- **Units:** String.
- **When you would look at this:** When trying to understand what a specific thread is doing. A thread stuck in `"disk-sleep"` is waiting for I/O. A thread in `"running"` is actively using the CPU.

#### `cpu_time_user: float`

The cumulative number of seconds this specific thread has spent executing in user mode. Same concept as the process-level `cpu_time_user`, but tracked per-thread by the kernel.

- **Units:** Seconds (cumulative since thread creation).
- **When you would look at this:** Identifying which thread in a multi-threaded process is consuming the most CPU.

#### `cpu_time_system: float`

The cumulative number of seconds this thread has spent executing in kernel mode.

- **Units:** Seconds (cumulative since thread creation).

#### `cpu_percent: float = 0.0`

The percentage of CPU time consumed by this thread over the measurement interval. Same calculation as the process-level `cpu_percent`, but scoped to a single thread. The maximum value is `100.0` (one thread can use at most one core).

- **Units:** Percent (0.0 to 100.0).
- **When you would look at this:** Finding the hot thread. In a multi-threaded application, one thread consuming 100% of a core often points to a tight loop or a performance-critical code path.

#### `priority: int = 0`

The kernel scheduling priority of the thread. The interpretation is OS-dependent:
- **Linux:** The static priority for SCHED_FIFO/SCHED_RR threads (1-99), or `0` for SCHED_OTHER (normal) threads.
- **macOS:** The Mach thread priority.

Higher numeric values generally mean higher priority, but the exact semantics depend on the scheduling policy.

- **Units:** Dimensionless integer.
- **Normal values:** `0` for most regular threads.
- **When you would look at this:** When debugging scheduling behavior in real-time or priority-sensitive applications.

#### `nice: int = 0`

The nice value for this thread. On Linux, individual threads can have different nice values (using `setpriority()` with `PRIO_PROCESS` and the thread's TID). Same range and semantics as the process-level `nice` (-20 to +19).

- **Units:** Dimensionless integer (-20 to +19).

#### `core_id: int | None = None`

The ID of the CPU core on which this thread last ran or is currently running. If the thread is sleeping or the information is unavailable, this is `None`. Core IDs are zero-indexed (core 0 through core `logical_cores - 1`).

- **Units:** Dimensionless integer or `None`.
- **Normal values:** Any integer from `0` to `logical_cores - 1`, or `None`.
- **When you would look at this:** Diagnosing **CPU affinity** issues. If multiple hot threads are pinned to the same core, you have a bottleneck. Ideally, the scheduler distributes threads across cores for maximum parallelism and cache utilization.

#### `voluntary_ctx_switches: int = 0`

The number of voluntary context switches for this thread. Same concept as the process-level `ctx_switches_voluntary`, but tracked per-thread.

- **Units:** Count (cumulative since thread creation).
- **When you would look at this:** Characterizing a thread's behavior as I/O-bound (high voluntary) vs. CPU-bound (high involuntary).

#### `involuntary_ctx_switches: int = 0`

The number of involuntary context switches for this thread. Same concept as the process-level `ctx_switches_involuntary`.

- **Units:** Count (cumulative since thread creation).

#### `stack_size_bytes: int = 0`

The size of this thread's **stack** in bytes. The stack is a per-thread memory region used for local variables, function call frames, return addresses, and saved register state. Each time a function is called, a new **stack frame** is pushed; when the function returns, the frame is popped.

On Linux, the default thread stack size is typically 8 MB (configurable via `ulimit -s` or `pthread_attr_setstacksize()`). On macOS, the main thread gets 8 MB and secondary threads get 512 KB by default.

- **Units:** Bytes.
- **Normal values:** Default stack size for the platform (e.g., 8,388,608 bytes for the main thread on Linux).
- **Abnormal values:** `0` if the information is unavailable. A very large custom stack might indicate the application is doing deep recursion or allocating large local arrays on the stack.
- **When you would look at this:** Diagnosing **stack overflow** issues, or optimizing memory usage in applications that create many threads (each thread's stack reserves virtual memory even if most of it is unused).

---

## 6. ProcessDiff (messages.py)

**File:** `backend/models/messages.py`

### What a "diff" is

A **diff** (short for "difference") represents the changes between two states. Instead of sending the entire process list every time the backend takes a snapshot, the backend compares the new snapshot to the previous one and sends only what changed. This is a common optimization called **delta encoding** or **incremental updates**.

### Why we use it

Sending 200+ full `ProcessSnapshot` objects every second over a WebSocket would waste bandwidth and CPU time (serialization, deserialization, and rendering). Most of the data does not change between successive snapshots (a process's `pid`, `name`, `exe`, `username`, and `create_time` never change while the process is alive). By sending only the differences, we dramatically reduce the amount of data on the wire.

### The `ProcessDiff` model

```python
class ProcessDiff(BaseModel):
    new: list[ProcessSnapshot]
    updated: list[dict]
    exited: list[dict]
```

#### `new: list[ProcessSnapshot]`

A list of full `ProcessSnapshot` objects for processes that appeared since the last snapshot. These are processes that were not present in the previous snapshot -- they were newly started (or newly visible due to permissions changes). The frontend needs the complete snapshot because it has never seen these processes before.

#### `updated: list[dict]`

A list of dictionaries, each containing only the fields that changed for an existing process. Each dictionary will always include `pid` (so the frontend knows which process to update) and then only the fields whose values differ from the previous snapshot. For example:

```json
{"pid": 1234, "cpu_percent": 45.2, "memory_rss_bytes": 104857600}
```

This says: "Process 1234 now has a `cpu_percent` of 45.2 and `memory_rss_bytes` of 104857600; all other fields are unchanged." The frontend merges these partial updates into its existing state for that process.

The type is `list[dict]` (rather than `list[ProcessSnapshot]`) because each dictionary contains a variable subset of fields -- it is not a complete `ProcessSnapshot`.

#### `exited: list[dict]`

A list of dictionaries identifying processes that are no longer running. Each dictionary typically contains at least the `pid` of the departed process. The frontend uses this to remove the process from its display.

For example:

```json
{"pid": 5678}
```

This tells the frontend: "Process 5678 has exited. Remove it from the process list."

### The wire format

When the backend sends a `ProcessDiff` over the WebSocket, it calls `model_dump()` to convert it to a Python dictionary, then serializes it to JSON. The resulting JSON structure looks like:

```json
{
  "new": [
    {"pid": 9999, "ppid": 1, "name": "newapp", "exe": "/usr/bin/newapp", ...}
  ],
  "updated": [
    {"pid": 1234, "cpu_percent": 12.5, "memory_rss_bytes": 52428800}
  ],
  "exited": [
    {"pid": 5678}
  ]
}
```

The frontend parses this JSON message, adds the `new` processes to its store, patches the `updated` processes with the changed fields, and removes the `exited` processes. This cycle repeats every snapshot interval (typically 1-2 seconds), keeping the frontend's state synchronized with the OS without transferring redundant data.

---

## 7. Glossary

An alphabetical reference of every technical term used in this document.

**Address space** -- The range of virtual memory addresses available to a process. On a 64-bit system, this is theoretically 2^64 bytes (16 exabytes), though the OS and hardware limit the usable portion.

**ALU (Arithmetic Logic Unit)** -- The component of a CPU core that performs arithmetic (addition, subtraction, etc.) and logic (AND, OR, NOT) operations.

**BaseModel** -- The foundation class from the Pydantic library that provides type validation, serialization, and other utilities when subclassed.

**Buffer cache** -- A region of memory used by the kernel to store raw block device data and filesystem metadata, speeding up repeated I/O operations.

**Child process** -- A process created by another process (the parent) using `fork()` or similar system calls.

**Clone** -- A Linux system call that creates a new process or thread. It is more flexible than `fork()`, allowing the caller to specify which resources are shared with the parent.

**Code segment** -- See **Text segment**.

**Context switch** -- The act of saving the state of one executing thread/process and restoring the state of another, allowing the CPU to switch between tasks.

**Copy-on-write (COW)** -- An optimization where the kernel does not actually copy memory pages when a process forks; instead, both parent and child share the same physical pages (marked read-only), and the kernel only copies a page when one of them writes to it.

**CPU (Central Processing Unit)** -- The primary hardware component that executes program instructions.

**Data segment** -- The region of a process's memory that holds initialized global and static variables.

**Demand paging** -- A memory management strategy where the kernel does not load a page into physical RAM until the process actually accesses it.

**Delta encoding** -- Transmitting only the differences between successive states, rather than the full state each time.

**Diff** -- Short for "difference." A data structure describing what changed between two states.

**Dirty page** -- A memory page that has been modified in RAM but not yet written back to its backing store (disk).

**Dynamic Voltage and Frequency Scaling (DVFS)** -- A technique where the CPU adjusts its voltage and clock frequency based on workload and thermal conditions.

**Epoch** -- The reference point for Unix timestamps: January 1, 1970, 00:00:00 UTC.

**Exec / execve()** -- A system call that replaces the current process's memory image with a new program loaded from an executable file.

**Exponentially weighted moving average** -- A type of average that gives more weight to recent values and exponentially less weight to older values.

**File descriptor (FD)** -- A small non-negative integer used by the kernel as a handle for an open file, socket, pipe, or device.

**Fork / fork()** -- A system call that creates a new process by duplicating the calling process. The new process (child) is a near-exact copy of the parent.

**Heap** -- The region of a process's memory used for dynamic memory allocation (via `malloc()`, `new`, etc.).

**Hyper-Threading** -- Intel's brand name for Simultaneous Multithreading (SMT).

**Init process** -- The first userspace process started by the kernel at boot (PID 1). Called `systemd` on most modern Linux distributions and `launchd` on macOS.

**Involuntary context switch** -- A context switch triggered by the scheduler because the running thread's time quantum expired or a higher-priority thread became runnable.

**I/O (Input/Output)** -- Any operation where the CPU communicates with external devices (disks, network, peripherals).

**I/O-bound** -- Describes a workload that spends most of its time waiting for I/O operations to complete, rather than performing computation.

**Kernel** -- The core of the operating system. It manages hardware, memory, processes, and provides services to user programs via system calls.

**Kernel mode** -- The highest CPU privilege level, in which code can access hardware and kernel memory directly. Kernel code runs in this mode.

**Load average** -- An exponentially weighted moving average of the number of runnable (and, on Linux, uninterruptibly sleeping) processes.

**Logical core** -- A hardware thread. Each physical CPU core may present one or more logical cores to the operating system.

**Memory leak** -- A bug where a program allocates memory but never frees it, causing its memory usage to grow without bound.

**Memory Management Unit (MMU)** -- Hardware in the CPU that translates virtual addresses to physical addresses using page tables.

**MHz (Megahertz)** -- A unit of frequency equal to one million cycles per second.

**mlock()** -- A system call that locks a range of memory into physical RAM, preventing it from being swapped out.

**model_dump()** -- A Pydantic method that converts a model instance to a plain Python dictionary.

**Nice value** -- An integer from -20 to +19 that influences scheduling priority. Lower values mean higher priority.

**OOM killer (Out-of-Memory killer)** -- A Linux kernel mechanism that selects and terminates processes when the system has completely exhausted memory and swap.

**Orphan process** -- A process whose parent has exited. The kernel reassigns its parent to PID 1 (the init process).

**Overcommit** -- A kernel policy (common on Linux) that allows processes to allocate more virtual memory than physically available, on the assumption that not all allocated memory will be used simultaneously.

**Page** -- The smallest unit of memory managed by the virtual memory system, typically 4 KB (x86) or 16 KB (Apple Silicon).

**Page cache** -- A kernel cache that stores recently read file data in RAM to speed up subsequent reads.

**Page frame** -- A physical memory block corresponding to one page. "Page" usually refers to the virtual side; "page frame" to the physical side.

**Page table** -- A per-process data structure maintained by the kernel that maps virtual page numbers to physical page frame numbers.

**Parent process** -- The process that created a given process via `fork()`.

**Physical core** -- An independent processing unit on the CPU die with its own execution pipeline.

**PID (Process Identifier)** -- A unique integer assigned by the kernel to each process.

**Process** -- An instance of a running program, including its virtual address space, open file descriptors, threads, and other resources.

**Process control block (PCB)** -- A kernel data structure (called `task_struct` on Linux) that stores all bookkeeping information for a process.

**Process table** -- A kernel data structure that maps PIDs to process control blocks.

**Program counter** -- A CPU register that holds the memory address of the next instruction to be executed.

**Proportional Set Size (PSS)** -- A memory metric that divides the cost of shared pages proportionally among the processes sharing them.

**Pydantic** -- A Python library for data validation and serialization using type annotations.

**Register** -- A small, fast storage location inside the CPU used to hold data and addresses during computation.

**Resident Set Size (RSS)** -- The number of bytes of physical RAM currently occupied by a process's pages.

**Schema** -- A formal description of data structure: which fields exist, their types, and constraints.

**Scheduler** -- The kernel component that decides which runnable thread gets to execute on which CPU core and for how long.

**Serialization** -- Converting an in-memory object into a format suitable for transmission or storage (e.g., JSON).

**Shared memory** -- Memory that is simultaneously accessible by multiple processes.

**Signal** -- A software interrupt delivered to a process by the kernel or another process (e.g., SIGTERM, SIGKILL, SIGSTOP).

**Simultaneous Multithreading (SMT)** -- A CPU feature where each physical core can execute multiple threads concurrently by sharing execution resources.

**Stack** -- A per-thread memory region used for function call frames, local variables, and return addresses. Grows and shrinks as functions are called and return.

**Stack frame** -- The portion of the stack allocated for a single function invocation, containing its local variables, parameters, and return address.

**Stack overflow** -- An error that occurs when the stack grows beyond its allocated size, typically due to excessively deep recursion.

**Swap** -- Disk space used as overflow when physical RAM is full. The kernel moves inactive pages to swap and brings them back when needed.

**System call** -- The mechanism by which user-mode programs request services from the kernel (e.g., reading a file, creating a process, allocating memory).

**Text segment** -- The region of a process's memory that contains executable machine code. Usually read-only.

**Thread** -- The smallest unit of execution scheduled by the kernel. Threads within the same process share memory and resources but have their own stack and register state.

**Thread leak** -- A bug where a program creates threads but never terminates or joins them, causing the thread count to grow without bound.

**Thrashing** -- A condition where the system spends more time swapping pages between RAM and disk than doing useful work, caused by severe memory pressure.

**Time quantum (time slice)** -- The maximum amount of time the scheduler allows a thread to run before preempting it to give another thread a turn.

**TID (Thread Identifier)** -- A unique integer assigned by the kernel to each thread.

**tmpfs** -- A Linux filesystem that resides entirely in RAM (and swap), used for temporary files and shared memory.

**Turbo Boost** -- Intel's technology for dynamically increasing CPU clock frequency above the base frequency when thermal and power conditions allow.

**UID (User ID)** -- A numeric identifier for a user account on Unix-like systems.

**Uninterruptible sleep** -- A process state (shown as `"disk-sleep"`) where the process is waiting for an I/O operation and cannot be interrupted by signals.

**Unique Set Size (USS)** -- The amount of physical memory private to a process -- memory that would be freed if only that process were terminated.

**Unix timestamp** -- The number of seconds elapsed since the Unix epoch (January 1, 1970, 00:00:00 UTC).

**User mode** -- The CPU privilege level at which normal application code runs. User-mode code cannot access hardware or kernel memory directly.

**ValidationError** -- An exception raised by Pydantic when input data does not match the model's type annotations or constraints.

**Virtual Memory Size (VMS)** -- The total size of a process's virtual address space, including all mapped regions whether resident, swapped, or never accessed.

**Virtual memory** -- A memory management scheme where each process has its own private address space, mapped by the kernel and hardware to physical RAM.

**Voluntary context switch** -- A context switch where the running thread willingly gives up the CPU because it is waiting for an event (I/O, lock, timer).

**WebSocket** -- A communication protocol that provides full-duplex (bidirectional) communication channels over a single TCP connection, commonly used for real-time data streaming between a server and a web client.

**Wired memory** -- (macOS) Physical memory that is locked in place and cannot be swapped out or paged out.

**Zombie process** -- A process that has exited but whose parent has not yet called `wait()` to collect its exit status. The process table entry remains until the parent reaps it.

**zswap / zram** -- Linux kernel features that compress pages in RAM before writing them to swap, reducing disk I/O at the cost of CPU time.
