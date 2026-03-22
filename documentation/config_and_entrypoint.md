# Configuration and Entry Point -- In-Depth Documentation

This document explains, in exhaustive detail, how the Process Visualizer backend
starts up, how it is configured, and how every piece fits together. It is written
for readers who are new to Python, web servers, and operating-system concepts.
Every technical term that appears is defined the first time it is used and again
in the Glossary at the end.

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [config.py Deep Dive](#2-configpy-deep-dive)
3. [main.py Deep Dive](#3-mainpy-deep-dive)
4. [start.sh -- Full-Stack Startup Script](#4-startsh----full-stack-startup-script)
5. [Python Package Structure](#5-python-package-structure)
6. [Architecture Overview](#6-architecture-overview)
7. [Glossary](#7-glossary)

---

## 1. Module Overview

### What Is an "Entry Point"?

Every program needs a single, well-known place where execution begins. In C the
entry point is the `main()` function. In a Python project the entry point is the
script or module that you ask the Python interpreter to run first. For this
project that entry point is `backend/main.py`.

Think of it like the ignition key of a car: turning the key does not make the
engine, the transmission, or the wheels -- it simply triggers a sequence that
brings all of those subsystems to life. `main.py` is the ignition key of the
Process Visualizer backend.

### Why Is Configuration Separate?

Configuration values (polling speed, network address, maximum number of
processes, and so on) change between environments. On your laptop you might want
to poll once per second; on a production server you might want to poll every five
seconds to save CPU time. Hardcoding these values inside the main logic would
mean editing the source code every time you wanted a different behavior.

By isolating configuration into `config.py`, the rest of the codebase can simply
ask for the current settings without caring where the values came from -- a
file, an environment variable, or the defaults baked into the class. This
pattern is called **separation of concerns**: each file has one job.

### How the App Boots Up (High Level)

The startup sequence in plain English:

1. The user runs `start.sh` (or runs `python -m backend.main` directly).
2. Python loads `backend/main.py` and calls the `main()` function.
3. `main()` reads configuration from the environment (or uses defaults).
4. `main()` hands the configuration to the **application factory** (`create_app`
   in `backend/server/app.py`), which assembles the web application.
5. The assembled application is given to **Uvicorn**, a web server that knows
   how to speak HTTP and WebSocket.
6. Uvicorn starts listening for connections on the configured host and port.

Each of these steps is explored in far greater detail in the sections that
follow.

---

## 2. config.py Deep Dive

The full source of `backend/config.py`:

```python
from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables with PV_ prefix."""

    poll_interval_ms: int = 1000
    history_buffer_size: int = 300
    host: str = "0.0.0.0"
    port: int = 8765
    collect_threads: bool = True
    max_processes: int = 1000

    model_config = {"env_prefix": "PV_"}
```

This is only 17 lines of code, but there is a remarkable amount happening. Let
us unpack every piece.

### 2.1 What Is pydantic-settings and Why We Use It

**Pydantic** is a Python library for data validation. You describe what shape
your data should have (field names, types, default values), and Pydantic makes
sure any data you load actually matches that shape. If you say a field must be an
integer and someone passes the string `"hello"`, Pydantic raises a clear error
immediately rather than letting the bad value propagate deep into the program and
cause a confusing crash later.

**pydantic-settings** is an extension of Pydantic specifically designed for
application configuration. It adds the ability to automatically read values from
**environment variables** (defined below). You declare your settings class once,
and pydantic-settings will:

- Use the default value you wrote in the class if no environment variable is set.
- Read the environment variable (if it exists) and convert it to the correct
  Python type (string to integer, string to boolean, etc.).
- Raise a validation error if the value cannot be converted.

Without pydantic-settings you would have to write boilerplate code like:

```python
import os
poll_interval = int(os.environ.get("PV_POLL_INTERVAL_MS", "1000"))
```

...for every single setting, handling type conversion and error messages
yourself. pydantic-settings eliminates all of that.

### 2.2 Environment Variables

An **environment variable** is a named value that lives in the memory space of
your operating system's shell (the program that interprets your terminal
commands, such as Bash or Zsh). Every process that starts inherits a copy of the
environment variables from its parent process. They are the standard, universal
mechanism for passing configuration into programs on Unix-like systems (macOS,
Linux) and Windows.

You can see all current environment variables by running `env` in your terminal.
You can set one temporarily for a single command:

```bash
PV_POLL_INTERVAL_MS=500 python -m backend.main
```

Or export it so that every subsequent command in the same shell session sees it:

```bash
export PV_POLL_INTERVAL_MS=500
python -m backend.main
```

### 2.3 The `PV_` Prefix Convention

The line:

```python
model_config = {"env_prefix": "PV_"}
```

tells pydantic-settings that every environment variable for this application must
start with `PV_`. The field `poll_interval_ms` maps to the environment variable
`PV_POLL_INTERVAL_MS` (the field name is uppercased automatically).

Why a prefix? Because the operating system's environment is a shared namespace.
Hundreds of variables already exist (`HOME`, `PATH`, `USER`, `LANG`, etc.). If
we named our variable just `HOST`, it might collide with some other tool's `HOST`
variable. The `PV_` prefix acts as a **namespace** -- it says "this variable
belongs to the Process Visualizer" -- and prevents accidental collisions.

### 2.4 Every Setting Explained

#### `poll_interval_ms` (default: `1000`)

**What polling is.** The Process Visualizer needs fresh data about every running
process on the machine. There are two fundamental strategies for getting
up-to-date information:

1. **Push (event-driven):** The operating system notifies you every time
   something changes. This is efficient but the OS kernel does not provide
   push notifications for most process metrics (CPU usage, memory, I/O
   counters).
2. **Poll (pull-based):** You periodically ask the OS "what is the current
   state?" at a fixed interval. This is what the Process Visualizer does.

`poll_interval_ms` is the number of milliseconds between each poll. One second
(1000 ms) is the default.

**Why 1000 ms?** This is the same update interval used by the classic Unix
utility `top`. One second is fast enough that the dashboard feels responsive --
you see changes within a second of them happening -- but slow enough that the
data-collection work itself does not consume significant CPU. Collecting a full
snapshot of all processes involves hundreds of system calls (one set per
process), so doing it too frequently would make the monitoring tool itself a
performance burden.

**The tradeoff:**

| Interval | Freshness | CPU cost of collector | Network traffic |
|----------|-----------|----------------------|-----------------|
| 100 ms   | Very high -- near real-time | High -- 10 collections/sec | 10 WebSocket messages/sec |
| 500 ms   | High | Moderate | 2 messages/sec |
| 1000 ms  | Good (default) | Low | 1 message/sec |
| 5000 ms  | Low -- 5 seconds of staleness | Very low | 0.2 messages/sec |

You can override it:

```bash
PV_POLL_INTERVAL_MS=500 python -m backend.main
```

#### `history_buffer_size` (default: `300`)

The backend keeps a rolling window of past snapshots in memory so that the
frontend can draw sparkline charts (tiny line charts showing recent CPU or memory
trends). `history_buffer_size` is the maximum number of snapshots retained.

**Why 300?** At the default poll interval of one second, 300 snapshots represent
five minutes of history (300 seconds / 60 = 5 minutes). Five minutes is long
enough to spot trends ("CPU has been climbing for the last few minutes") without
consuming excessive memory.

**What happens when the buffer is full?** The backend uses a **ring buffer**
(also called a circular buffer). When entry number 301 arrives, it overwrites
entry number 1. Entry 302 overwrites entry 2, and so on. The buffer is always
exactly 300 entries long (or fewer during the first 300 seconds after startup).
This guarantees bounded memory usage -- the history will never grow without
limit, no matter how long the application runs.

**Memory estimate:** Each snapshot is roughly 50--200 bytes per process. On a
machine with 500 processes, one snapshot is approximately 100 KB. Three hundred
snapshots would therefore consume about 30 MB of RAM. On a machine with 5,000
processes you might see 300 MB, which is why `max_processes` (below) also exists.

#### `host` (default: `"0.0.0.0"`)

This is the **network address** on which the backend listens for incoming
connections. To understand it, a bit of networking background is needed.

**IP addresses** are numerical labels assigned to devices (and to network
interfaces within a device). Your computer typically has several:

- `127.0.0.1` -- the **loopback address**, also called **localhost**. Traffic
  sent to this address never leaves your machine. It is a shortcut that says
  "talk to myself." If the server listens only on `127.0.0.1`, only programs
  running on the same machine can connect to it.
- `192.168.x.x` or `10.x.x.x` -- a **private network address** assigned by
  your router. Other devices on the same Wi-Fi or LAN can reach you at this
  address.
- `0.0.0.0` -- a special "wildcard" address that means **all interfaces**. When
  a server binds to `0.0.0.0`, it accepts connections arriving on any of the
  machine's network interfaces: loopback, Wi-Fi, Ethernet, VPN tunnel, etc.

**Why `0.0.0.0` is the default:** It is the most permissive option. During
development you usually access the backend from `localhost`, but if you ever
want to open the dashboard on your phone (connected to the same Wi-Fi), the
backend will already be reachable. In a production or security-sensitive
environment you might restrict this:

```bash
PV_HOST=127.0.0.1 python -m backend.main   # only local connections
```

**`localhost` vs `127.0.0.1`:** `localhost` is a **hostname** -- a human-readable
alias. Your operating system resolves it to `127.0.0.1` (IPv4) or `::1` (IPv6)
via the file `/etc/hosts`. They are effectively the same thing, but `127.0.0.1`
is the actual numeric address.

#### `port` (default: `8765`)

A **port** is a 16-bit number (ranging from 0 to 65535) that identifies a
specific service on a machine. If an IP address is like a street address
(identifying the building), a port is like an apartment number (identifying which
service inside the building should handle the delivery).

Well-known port ranges:

| Range | Name | Examples |
|-------|------|----------|
| 0--1023 | **Well-known / system ports** | 80 (HTTP), 443 (HTTPS), 22 (SSH) |
| 1024--49151 | **Registered / user ports** | 3306 (MySQL), 5432 (PostgreSQL), 8080 (common dev server) |
| 49152--65535 | **Dynamic / ephemeral ports** | Used by the OS for outgoing connections |

**Why 8765?** It is an arbitrary number in the registered range. It is unlikely
to conflict with any other service you are running. It is easy to remember (the
digits 8-7-6-5 count down). You need elevated privileges (`sudo`) to bind to
ports below 1024 on most Unix systems; port 8765 avoids that requirement (though
the backend still needs `sudo` for other reasons -- see the `start.sh` section).

**Override example:**

```bash
PV_PORT=9000 python -m backend.main
```

#### `collect_threads` (default: `True`)

When set to `True`, the backend will collect per-thread data for processes that
the user has "subscribed to" (clicked on in the UI for detailed inspection).

**Why this is optional:** A single process can have hundreds or even thousands of
threads. The Google Chrome browser, for example, routinely has 50+ threads per
renderer process. Collecting thread-level CPU and state data means making
additional system calls for each thread of each subscribed process on every poll
tick. On a busy machine with many subscribed processes, this can add noticeable
overhead.

By setting `PV_COLLECT_THREADS=false`, a user on a constrained system (a
Raspberry Pi, a small cloud VM) can disable thread collection entirely,
significantly reducing the per-tick cost.

**Thread:** A thread is the smallest unit of execution that the operating system
schedules onto a CPU core. A process contains one or more threads. All threads in
a process share the same memory space but each has its own program counter (which
instruction it is executing) and stack (local variables).

#### `max_processes` (default: `1000`)

The maximum number of processes that the backend will include in each snapshot.

**Why a limit is needed:** On a busy server, especially one running containers
(Docker, Kubernetes), it is common to have 5,000, 10,000, or even more
processes. Collecting and transmitting data for all of them on every tick would:

1. **Increase CPU time** for the collector itself, because it must make system
   calls for each process.
2. **Increase memory usage**, because each snapshot occupies space in the history
   buffer.
3. **Increase network bandwidth**, because the full snapshot is sent over the
   WebSocket to every connected browser.
4. **Overwhelm the frontend**, because rendering a table with 10,000 rows in the
   browser causes jank (visible stuttering).

The default of 1,000 covers the vast majority of desktop and small-server use
cases. Processes are typically sorted by resource usage, so the "top 1,000" gives
you visibility into everything that matters.

```bash
PV_MAX_PROCESSES=5000 python -m backend.main   # for a very busy server
PV_MAX_PROCESSES=200 python -m backend.main     # for a resource-constrained device
```

### 2.5 How to Override Settings via Environment Variables -- Summary

Every field in the `Settings` class maps to an environment variable by
uppercasing the field name and prepending `PV_`:

| Field | Environment Variable | Example Value |
|-------|---------------------|---------------|
| `poll_interval_ms` | `PV_POLL_INTERVAL_MS` | `500` |
| `history_buffer_size` | `PV_HISTORY_BUFFER_SIZE` | `600` |
| `host` | `PV_HOST` | `127.0.0.1` |
| `port` | `PV_PORT` | `9000` |
| `collect_threads` | `PV_COLLECT_THREADS` | `false` |
| `max_processes` | `PV_MAX_PROCESSES` | `200` |

You can combine multiple overrides:

```bash
PV_POLL_INTERVAL_MS=500 PV_MAX_PROCESSES=200 PV_HOST=127.0.0.1 python -m backend.main
```

Or use `export` to set them once and run multiple commands:

```bash
export PV_POLL_INTERVAL_MS=500
export PV_MAX_PROCESSES=200
python -m backend.main
```

You can also create a `.env` file in the project root (pydantic-settings reads
it automatically if the `python-dotenv` package is installed, which it is in this
project):

```
PV_POLL_INTERVAL_MS=500
PV_MAX_PROCESSES=200
PV_HOST=127.0.0.1
```

---

## 3. main.py Deep Dive

The full source of `backend/main.py`:

```python
"""Entry point for the process visualizer backend."""

import setproctitle
import uvicorn

from backend.server.app import create_app
from backend.config import Settings


def main() -> None:
    setproctitle.setproctitle("PV-Backend")
    settings = Settings()
    app = create_app(settings)
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
```

### 3.1 What `setproctitle` Does and Why

When you run a Python script, the operating system records the process name as
`python` (or `python3`). If you open Activity Monitor (macOS), Task Manager
(Windows), or run `ps aux` in a terminal, you will see a row labeled `python` --
but which Python program is it? If you are running several Python programs
simultaneously (the backend, a Jupyter notebook, a script), they all show up as
`python` and you cannot tell them apart.

The `setproctitle` library solves this by reaching into the operating system's
process table and overwriting the process name. After the call:

```python
setproctitle.setproctitle("PV-Backend")
```

the process appears as `PV-Backend` in every process listing tool, including the
Process Visualizer's own dashboard. This is especially important for this project
because the Process Visualizer monitors processes -- if its own backend showed up
as `python`, the user might wonder "what is this mysterious Python process using
CPU?" and investigate it, only to find it is the tool itself. Naming it
`PV-Backend` makes its identity immediately obvious.

### 3.2 The Boot Sequence Step by Step

#### Step 1: Load Settings

```python
settings = Settings()
```

This single line triggers the following chain of events inside pydantic-settings:

1. For each field in the `Settings` class, pydantic-settings checks whether a
   corresponding environment variable exists. For example, for the field
   `poll_interval_ms`, it looks for `PV_POLL_INTERVAL_MS`.
2. If the environment variable exists, its string value is converted to the
   declared Python type (`int`, `str`, `bool`).
3. If the environment variable does not exist, the default value from the class
   definition is used.
4. If any value fails validation (for example, `PV_PORT=hello` cannot be
   converted to an `int`), a `ValidationError` is raised immediately with a
   clear message describing what went wrong.

After this line, `settings` is a fully populated, validated object. You can
access `settings.poll_interval_ms`, `settings.host`, etc.

#### Step 2: Create the Application

```python
app = create_app(settings)
```

This calls the **application factory** function in `backend/server/app.py`. An
application factory is a function that builds and returns a configured
application object. The factory pattern is used (rather than creating the app at
module level) for two reasons:

1. **Testability.** In tests you can call `create_app(test_settings)` with
   different configuration to create an isolated instance.
2. **Delayed initialization.** The app is not created until `main()` is called,
   which means importing the module does not have side effects.

Inside `create_app`, the following happens:

1. A `FastAPI` instance is created with metadata (title, description, version)
   and a **lifespan** manager (which controls startup and shutdown behavior).
2. The `settings` object is attached to `app.state.settings` so that other parts
   of the application can access it.
3. **CORS middleware** is added. CORS (Cross-Origin Resource Sharing) is a
   browser security mechanism. The frontend (running on `localhost:5173`) and the
   backend (running on `localhost:8765`) are different **origins** because they
   use different ports. Without CORS headers, the browser would block the
   frontend from making requests to the backend. The middleware tells the browser
   "yes, requests from `localhost:5173` are allowed."
4. REST API routes are registered (the `/api/...` endpoints).
5. The WebSocket route (`/ws`) is registered for real-time streaming.

#### Step 3: Run Uvicorn

```python
uvicorn.run(app, host=settings.host, port=settings.port)
```

This line hands the assembled application to the Uvicorn web server and blocks
(does not return) until the server is shut down (by Ctrl+C or a signal). More on
Uvicorn below.

### 3.3 What Uvicorn Is

**Uvicorn** is an ASGI server written in Python.

Let us define each of those terms:

- **Server:** A program that listens on a network port, accepts incoming
  connections, and sends back responses.
- **ASGI (Asynchronous Server Gateway Interface):** A standard that defines how
  a Python web application communicates with a web server. It is the successor to
  WSGI (Web Server Gateway Interface). The key difference is that ASGI supports
  **asynchronous** operations -- the server can handle many connections
  concurrently without blocking on I/O. This is essential for WebSocket support,
  where the server must maintain long-lived connections.
- **Asynchronous (async):** A programming model where a single thread can start
  an operation (like waiting for network data), suspend itself, do other work,
  and resume when the operation completes. Python implements this with the
  `async` and `await` keywords.

**How Uvicorn relates to FastAPI:**

FastAPI is a **framework** -- it provides the tools to define routes, validate
input, generate documentation, and so on. But FastAPI itself cannot listen on a
network port or handle raw TCP connections. It needs an ASGI server to do that.
Uvicorn is the most popular ASGI server. The relationship is:

```
Internet/Browser  <-->  Uvicorn (ASGI server)  <-->  FastAPI (application)
```

Uvicorn handles the low-level networking:
- Opening a TCP socket on the specified host and port.
- Accepting incoming connections.
- Parsing HTTP requests and WebSocket frames.
- Calling the FastAPI application with the parsed data.
- Sending the FastAPI application's responses back to the client.

FastAPI handles the high-level application logic:
- Routing (which function handles which URL).
- Request validation.
- Response serialization (converting Python objects to JSON).
- Middleware (CORS, authentication, etc.).

### 3.4 The `if __name__ == "__main__"` Guard

```python
if __name__ == "__main__":
    main()
```

This is a Python idiom that confuses many beginners. Here is what it means:

Every Python file has a built-in variable called `__name__`. Its value depends on
how the file was loaded:

- If the file was **run directly** (e.g., `python backend/main.py` or
  `python -m backend.main`), then `__name__` is set to the string `"__main__"`.
- If the file was **imported** by another file (e.g., `from backend.main import main`),
  then `__name__` is set to the module's dotted name (e.g., `"backend.main"`).

The guard ensures that `main()` is called only when the file is run directly, not
when it is imported. This matters because:

1. **Tests** might import the `main` function to test it in isolation. Without
   the guard, merely importing the module would start the entire server.
2. **Other scripts** might want to reuse the `main` function or inspect the
   module without triggering side effects.

---

## 4. start.sh -- Full-Stack Startup Script

`start.sh` is a Bash shell script that automates starting both the backend and
the frontend in a single command. Here is what happens, line by line.

### Phase 1: Safety and Setup

```bash
set -e
```

This tells Bash to **exit immediately** if any command fails (returns a non-zero
exit code). Without this, the script would continue running even if a critical
step (like activating the virtual environment) failed, leading to confusing
errors later.

```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
```

This computes the **absolute path** to the directory containing the script. It is
necessary because the script might be invoked from a different working directory
(e.g., `~/Desktop/process_visulizer/start.sh` run from `~/`). All subsequent
path references use `$SCRIPT_DIR` as a base to ensure they resolve correctly.

### Phase 2: Prerequisite Checks

```bash
if ! command -v python3 &> /dev/null; then ...
if ! command -v node &> /dev/null; then ...
```

These check whether `python3` and `node` are installed and available on the
system `PATH`. If either is missing, the script prints an error and exits.
`command -v` is a shell built-in that prints the path to a command if it exists
or returns a non-zero exit code if it does not. `&> /dev/null` discards the
output (we only care about the exit code).

### Phase 3: Python Virtual Environment

```bash
if [ ! -d "$SCRIPT_DIR/backend/venv" ]; then
    python3 -m venv "$SCRIPT_DIR/backend/venv"
    source "$SCRIPT_DIR/backend/venv/bin/activate"
    pip install -r "$SCRIPT_DIR/backend/requirements.txt"
else
    source "$SCRIPT_DIR/backend/venv/bin/activate"
fi
```

A **virtual environment** (`venv`) is an isolated Python installation. It
contains its own `pip` (the package installer) and its own `site-packages`
directory (where third-party libraries like FastAPI and psutil are installed).
This isolation prevents the project's dependencies from conflicting with other
Python projects on the same machine.

- If the `venv` directory does not exist, the script creates it, activates it,
  and installs all dependencies from `requirements.txt`.
- If it already exists, the script simply activates it.

**`source ... activate`** modifies the current shell session's `PATH` so that
`python` and `pip` point to the virtual environment's copies rather than the
system-wide ones.

### Phase 4: Frontend Dependencies

```bash
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    cd "$SCRIPT_DIR/frontend" && npm install
fi
```

`node_modules` is Node.js's equivalent of Python's `site-packages` -- it is
where third-party JavaScript packages (React, Vite, Zustand, etc.) are
installed. If it does not exist, `npm install` reads `package.json` and downloads
all listed dependencies.

### Phase 5: Requesting `sudo`

```bash
sudo -v
```

The backend needs to run with **root privileges** (administrator access) because
reading detailed information about processes owned by other users (memory maps,
file descriptors, signals) requires elevated permissions on Unix-like systems.
`sudo -v` prompts for the password once upfront so the user is not surprised by a
password prompt appearing later in the middle of output.

### Phase 6: Starting the Backend

```bash
cd "$SCRIPT_DIR" && sudo bash -c "exec -a 'PV-Backend' '$SCRIPT_DIR/backend/venv/bin/python' -m backend.main" &
BACKEND_PID=$!
```

Breaking this down:

- `sudo` runs the command as the root user.
- `bash -c "..."` starts a new Bash shell that executes the quoted command.
- `exec -a 'PV-Backend'` replaces the shell process with the Python process and
  sets its process name to `PV-Backend` (a belt-and-suspenders approach alongside
  `setproctitle`).
- `'$SCRIPT_DIR/backend/venv/bin/python' -m backend.main` runs the backend
  entry point using the virtual environment's Python interpreter.
- `&` runs the entire command **in the background**, meaning the script continues
  to the next line without waiting for the backend to finish.
- `$!` captures the **PID** (Process ID) of the most recently backgrounded
  command. This PID is saved so the cleanup function can kill the backend later.

### Phase 7: Starting the Frontend

```bash
cd "$SCRIPT_DIR/frontend" && exec -a 'PV-Frontend' npx vite &
FRONTEND_PID=$!
```

This starts the Vite development server (which serves the React frontend) in the
background. `npx vite` runs the Vite binary from `node_modules`. The frontend
listens on port 5173 by default.

### Phase 8: Wait, Open Browser, and Clean Up

```bash
sleep 3
open "http://localhost:5173"   # macOS only
```

A three-second pause gives both servers time to bind their ports and become
ready. Then the default browser is opened to the frontend URL.

```bash
cleanup() {
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    wait
}
trap cleanup EXIT INT TERM
wait
```

- **`trap`** registers the `cleanup` function to be called when the script
  receives an `EXIT`, `INT` (Ctrl+C), or `TERM` (kill) signal.
- **`wait`** blocks the script until all background processes finish. Since the
  backend and frontend run indefinitely, the script effectively pauses here until
  the user presses Ctrl+C.
- When Ctrl+C is pressed, the `cleanup` function sends `SIGTERM` (the default
  signal from `kill`) to both background processes, which causes them to shut
  down gracefully.

---

## 5. Python Package Structure

### What Is a Python Package?

A **module** is a single `.py` file. A **package** is a directory that contains
modules and (historically) a special file called `__init__.py`. Packages let you
organize a large codebase into a hierarchy of directories, just like folders on
your desktop organize files.

The backend's directory structure:

```
backend/
    __init__.py
    config.py
    main.py
    collectors/
        __init__.py
        diff_engine.py
        process_collector.py
        system_collector.py
        thread_collector.py
    models/
        __init__.py
        ...
    server/
        __init__.py
        app.py
        routes.py
        websocket.py
    services/
        __init__.py
        history_service.py
        snapshot_service.py
        tree_service.py
```

### What `__init__.py` Does

`__init__.py` serves two purposes:

1. **It marks a directory as a Python package.** In older versions of Python
   (before 3.3), a directory without `__init__.py` was invisible to the import
   system. Modern Python (3.3+) supports "namespace packages" without
   `__init__.py`, but including the file is still considered best practice
   because it is explicit and works with all tools (linters, type checkers, IDEs).

2. **It runs when the package is imported.** Any code inside `__init__.py`
   executes the first time the package (or anything inside it) is imported. In
   this project, `backend/__init__.py` contains only a docstring:

   ```python
   """Process Visualizer Backend."""
   ```

   This is the minimal, idiomatic content -- it marks the directory as a package
   and provides a one-line description. More complex projects might use
   `__init__.py` to re-export frequently used names so that users can write
   `from backend import Settings` instead of `from backend.config import Settings`.

### How Imports Work

When Python encounters:

```python
from backend.server.app import create_app
```

it performs the following steps:

1. Searches `sys.path` (a list of directories) for a directory or file named
   `backend`.
2. Finds `backend/` and loads `backend/__init__.py`.
3. Inside `backend/`, finds `server/` and loads `backend/server/__init__.py`.
4. Inside `server/`, finds `app.py` and loads it.
5. From the loaded `app` module, extracts the name `create_app` and makes it
   available in the importing module.

The `-m` flag in `python -m backend.main` tells Python to find `backend/main.py`
using the package import machinery (rather than as a file path), which ensures
that all relative imports within the `backend` package resolve correctly.

---

## 6. Architecture Overview

### The Big Picture

```
main.py --> config --> app factory --> routes + websocket + services --> collectors --> psutil --> OS kernel
```

Here is what each arrow represents:

### Arrow 1: `main.py --> config`

`main.py` instantiates the `Settings` class from `config.py`. This is the very
first meaningful action in the boot sequence. The configuration must be loaded
before anything else because every downstream component depends on it.

**What flows across this arrow:** Environment variable values (or defaults) are
read from the OS and assembled into a validated `Settings` object.

### Arrow 2: `config --> app factory`

`main.py` passes the `Settings` object to `create_app()` in
`backend/server/app.py`. The factory uses settings to configure CORS origins, set
up the lifespan manager, and store the settings on `app.state` for use by other
components.

**What flows across this arrow:** The `Settings` object, carrying all
configuration values.

### Arrow 3: `app factory --> routes + websocket + services`

Inside the factory:

- **Routes** (`backend/server/routes.py`) are REST API endpoints that handle
  one-off HTTP requests (e.g., "give me the process tree right now").
- **WebSocket** (`backend/server/websocket.py`) manages persistent, bidirectional
  connections with browser clients. The `ConnectionManager` tracks all connected
  clients and can broadcast messages to all of them at once.
- **Services** (in `backend/services/`) contain the business logic. The
  `SnapshotService` is the orchestrator: on every tick of the broadcast loop, it
  calls the collectors, computes diffs, updates history, and returns the data to
  be sent over WebSocket.

The lifespan manager (which runs at startup) creates the `SnapshotService` and
`ConnectionManager`, attaches them to `app.state`, and starts the
`broadcast_loop` as a background task.

**What flows across this arrow:** The `Settings` object (to services), route
registrations (to the FastAPI router), and the WebSocket endpoint function.

### Arrow 4: `services --> collectors`

The `SnapshotService` owns instances of three collectors:

- `SystemCollector` -- gathers machine-wide metrics (total CPU usage per core,
  total memory, swap, disk I/O, network I/O).
- `ProcessCollector` -- gathers per-process metrics (PID, name, CPU percent,
  memory usage, status, parent PID, etc.).
- `ThreadCollector` -- gathers per-thread metrics for subscribed processes.

On each tick, the `SnapshotService` calls the collectors' `collect` methods.

**What flows across this arrow:** Method calls requesting current data; return
values are lists of data-model objects (like `ProcessSnapshot`).

### Arrow 5: `collectors --> psutil`

The collectors do not talk to the operating system directly. They use **psutil**
(process and system utilities), a cross-platform Python library that provides a
uniform API for retrieving system and process information on Linux, macOS,
Windows, and BSD.

For example, `psutil.process_iter()` returns an iterator over all running
processes. `psutil.cpu_percent(percpu=True)` returns CPU usage for each core.

**What flows across this arrow:** psutil function and method calls; return values
are Python objects wrapping raw OS data.

### Arrow 6: `psutil --> OS kernel`

psutil reads data from the operating system kernel using platform-specific
mechanisms:

- On **Linux**: reads virtual files in `/proc` (e.g., `/proc/[pid]/stat`,
  `/proc/[pid]/status`, `/proc/meminfo`, `/proc/stat`). The `/proc` filesystem
  is not a real filesystem on disk -- it is a window into the kernel's internal
  data structures, dynamically generated on each read.
- On **macOS**: uses system calls like `sysctl`, `proc_pidinfo`, and the Mach
  kernel API.
- On **Windows**: uses the Windows API (`CreateToolhelp32Snapshot`,
  `GetProcessMemoryInfo`, etc.).

The **kernel** is the core of the operating system. It manages all hardware
resources (CPU, memory, disk, network) and all processes. Every piece of data
that the Process Visualizer displays ultimately comes from the kernel.

**What flows across this arrow:** System calls and file reads; return values are
raw numerical data (bytes of memory, jiffies of CPU time, process states).

### Full Data Flow for One Tick

To make the architecture concrete, here is the complete journey of data for a
single poll tick:

1. The `broadcast_loop` in `app.py` wakes up after sleeping for
   `poll_interval_ms` milliseconds.
2. It calls `snapshot_service.collect_tick()`.
3. `SnapshotService` calls `system_collector.collect()`, which calls psutil
   functions, which read from the OS kernel. System metrics are returned.
4. `SnapshotService` calls `process_collector.collect_all()`, which iterates
   over every process via `psutil.process_iter()`, reading CPU, memory, and
   metadata for each one from the kernel. A list of `ProcessSnapshot` objects is
   returned.
5. If any PIDs are subscribed and `collect_threads` is `True`,
   `SnapshotService` calls the `ThreadCollector` for those PIDs.
6. `SnapshotService` feeds the new snapshot into the `DiffEngine`, which
   compares it to the previous snapshot and produces a compact diff (only new,
   changed, and exited processes).
7. The snapshot is added to the `HistoryService` ring buffer.
8. The diff (or full snapshot, on the first tick) is returned to
   `broadcast_loop`.
9. `broadcast_loop` calls `connection_manager.broadcast()`, which serializes the
   data to JSON and sends it to every connected WebSocket client.
10. Each browser client receives the JSON, updates its local state store
    (Zustand), and React re-renders the UI.

---

## 7. Glossary

An alphabetical list of every technical term used in this document.

**Application Factory** -- A function that constructs and returns a configured
application object. Used in web frameworks to allow creating multiple app
instances (e.g., for testing) with different configurations.

**ASGI (Asynchronous Server Gateway Interface)** -- A Python standard defining
how async-capable web servers communicate with web applications. The successor to
WSGI, it supports HTTP, WebSocket, and other protocols.

**Async / Asynchronous** -- A programming model where tasks can be started and
then suspended while waiting for I/O, allowing other tasks to run in the
meantime. Python uses the `async` and `await` keywords for this.

**Background Process** -- A process launched by a shell that does not block the
shell from continuing to execute subsequent commands. Created by appending `&` to
a command.

**Bash** -- The Bourne Again Shell, a command-line interpreter commonly used on
Linux and macOS. Shell scripts written for Bash start with `#!/bin/bash`.

**Binding (a port)** -- The act of a server program claiming a specific port
number so that incoming network traffic to that port is delivered to it.

**Boolean** -- A data type with only two possible values: `True` or `False`.

**Buffer** -- A region of memory used to temporarily hold data. A ring buffer
(circular buffer) overwrites the oldest entry when it is full.

**CORS (Cross-Origin Resource Sharing)** -- A browser security mechanism that
restricts web pages from making requests to a different origin (scheme + host +
port) than the one that served the page. Servers opt in by sending specific HTTP
headers.

**CPU Core** -- A single processing unit within a CPU chip. Modern CPUs have
multiple cores, allowing true parallel execution of threads.

**Docstring** -- A string literal at the beginning of a Python module, class, or
function that documents its purpose. Accessible at runtime via `__doc__`.

**Entry Point** -- The place in a program where execution begins.

**Environment Variable** -- A named value stored in the operating system's
process environment. Inherited by child processes. Commonly used to pass
configuration to programs.

**Ephemeral Port** -- A short-lived port number (typically 49152-65535)
automatically assigned by the OS for outgoing connections.

**Exit Code** -- An integer returned by a process when it finishes. Zero means
success; any other value indicates an error.

**FastAPI** -- A modern Python web framework for building APIs. It uses Python
type hints for automatic request validation and API documentation generation.

**Hostname** -- A human-readable label for a network address (e.g., `localhost`
maps to `127.0.0.1`).

**HTTP (HyperText Transfer Protocol)** -- The request-response protocol used by
web browsers to communicate with web servers.

**Import** -- The mechanism by which one Python file loads and uses code defined
in another Python file.

**IP Address** -- A numerical label assigned to a device on a network. IPv4
addresses look like `192.168.1.1`; IPv6 addresses look like `::1`.

**Jiffies** -- A unit of CPU time used internally by the Linux kernel. The exact
duration depends on the kernel's tick rate (commonly 1/100th or 1/250th of a
second).

**JSON (JavaScript Object Notation)** -- A lightweight text format for
structured data. Used extensively in web APIs for sending data between servers
and browsers.

**Kernel** -- The core component of an operating system that manages hardware
resources and provides services to all other programs.

**Lifespan** -- In FastAPI/Starlette, a context manager that defines what happens
when the application starts up (before the `yield`) and shuts down (after the
`yield`).

**Localhost** -- A hostname that refers to the current machine. Resolves to
`127.0.0.1` (IPv4) or `::1` (IPv6).

**Loopback Address** -- The IP address `127.0.0.1`. Network traffic sent to this
address is routed back to the same machine without touching the physical network.

**Middleware** -- Software that sits between the server and the application,
processing requests and responses as they pass through. CORS middleware adds
headers; logging middleware records request details.

**Module** -- A single Python file (`.py`).

**Namespace** -- A container that holds a set of identifiers (names) and ensures
that they do not collide with identifiers in other containers.

**Node.js** -- A JavaScript runtime that allows running JavaScript outside of a
web browser. Used here to run the Vite development server.

**npm (Node Package Manager)** -- The default package manager for Node.js. Reads
`package.json` to install JavaScript dependencies.

**Origin** -- In web security, the combination of scheme (http/https), hostname,
and port. `http://localhost:5173` and `http://localhost:8765` are different
origins.

**Package** -- A directory containing Python modules and (typically) an
`__init__.py` file.

**PATH** -- An environment variable containing a colon-separated list of
directories. When you type a command name, the shell searches these directories
to find the executable.

**PID (Process ID)** -- A unique integer assigned by the operating system to each
running process.

**Polling** -- Repeatedly checking for new data at a fixed interval, as opposed
to being notified (push model).

**Port** -- A 16-bit number (0-65535) that identifies a specific service on a
networked machine.

**Process** -- An instance of a running program. Has its own memory space, PID,
and one or more threads.

**`/proc` Filesystem** -- A virtual filesystem on Linux that exposes kernel and
process data as readable files. Nothing is stored on disk; the files are
generated dynamically by the kernel.

**psutil** -- A cross-platform Python library for retrieving information about
running processes and system utilization (CPU, memory, disk, network).

**Pydantic** -- A Python library for data validation using type annotations.

**pydantic-settings** -- An extension of Pydantic for loading and validating
application settings from environment variables, `.env` files, and other sources.

**Ring Buffer (Circular Buffer)** -- A fixed-size data structure that wraps
around: when it reaches the end, new entries overwrite the oldest entries.

**Root (User)** -- The superuser account on Unix-like systems with unrestricted
access to all files, processes, and system calls.

**Route** -- A mapping from a URL pattern to a function that handles requests to
that URL.

**`setproctitle`** -- A Python library that changes the process title visible in
system monitoring tools like `ps` and `top`.

**Shell** -- A program that interprets commands typed by the user (e.g., Bash,
Zsh). Also executes shell scripts.

**Signal** -- A software interrupt delivered to a process. Common signals include
`SIGTERM` (request graceful shutdown), `SIGINT` (Ctrl+C), and `SIGKILL`
(immediate termination).

**Socket** -- An endpoint for network communication, identified by an IP address
and a port number.

**`sudo`** -- A Unix command that runs another command with root (superuser)
privileges.

**`sys.path`** -- A Python list of directory paths that the import system
searches when looking for modules and packages.

**TCP (Transmission Control Protocol)** -- A reliable, ordered, connection-based
network protocol. HTTP and WebSocket both run on top of TCP.

**Thread** -- The smallest unit of execution scheduled by the OS. Threads within
a process share memory but have independent execution stacks.

**Tick** -- One iteration of the polling loop. Each tick collects a snapshot and
broadcasts it.

**Trap** -- A shell mechanism for intercepting signals and executing a specified
command or function in response.

**Type Hint** -- A Python annotation that indicates the expected type of a
variable, parameter, or return value (e.g., `port: int = 8765`).

**Uvicorn** -- A high-performance ASGI server for Python, commonly used with
FastAPI and Starlette.

**Validation** -- The process of checking that data conforms to expected rules
(correct type, within allowed range, etc.).

**Virtual Environment (venv)** -- An isolated Python installation that has its
own packages, independent of the system-wide Python installation.

**Vite** -- A fast frontend build tool and development server for JavaScript/TypeScript
projects. Used here to serve the React frontend.

**WebSocket** -- A communication protocol that provides full-duplex (two-way)
communication over a single TCP connection. Unlike HTTP, which is
request-response, WebSocket allows the server to push data to the client at any
time.

**WSGI (Web Server Gateway Interface)** -- The older Python standard for
synchronous web server-to-application communication. Replaced by ASGI for async
applications.

**Zustand** -- A lightweight state management library for React. The frontend
uses it to store process data received over WebSocket.

---

*This document covers the files `backend/main.py`, `backend/config.py`,
`backend/__init__.py`, `backend/server/app.py`, and `start.sh` in the Process
Visualizer project.*
