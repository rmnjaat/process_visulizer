# Server Package Documentation

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Networking Fundamentals](#2-networking-fundamentals)
3. [FastAPI and ASGI Concepts](#3-fastapi-and-asgi-concepts)
4. [app.py Deep Dive](#4-apppy-deep-dive)
5. [routes.py Deep Dive](#5-routespy-deep-dive)
6. [websocket.py Deep Dive](#6-websocketpy-deep-dive)
7. [Request Flow Diagrams](#7-request-flow-diagrams)
8. [Glossary](#8-glossary)

---

## 1. Module Overview

The `backend/server/` package is the **network-facing layer** of the Process Visualizer application. It contains four files:

| File | Purpose |
|------|---------|
| `__init__.py` | Marks the directory as a Python package (empty in this project). |
| `app.py` | Constructs and configures the FastAPI application instance. |
| `routes.py` | Defines all REST API endpoints (the URLs the frontend can call). |
| `websocket.py` | Manages persistent WebSocket connections for real-time data streaming. |

### What is a "Server" in Client-Server Architecture?

The **client-server architecture** divides software into two roles:

- **Client** -- the program that makes requests. In this project the client is the React frontend running in your web browser.
- **Server** -- the program that listens for requests, does work, and sends back responses. In this project the server is a Python process running FastAPI.

The server sits between the frontend and the operating system. The frontend asks "give me the list of running processes," the server reads that information from the OS using `psutil`, and sends it back as structured data (JSON). Without the server, the browser has no way to access OS-level information -- browsers are sandboxed for security and cannot read process tables directly.

The server in this project does two things:

1. **Serves REST API endpoints** -- one-time request/response interactions (e.g., "get process #1234").
2. **Maintains WebSocket connections** -- long-lived, bidirectional channels that push live process data to the browser every few seconds without the browser having to ask repeatedly.

---

## 2. Networking Fundamentals

This section defines every networking concept used in the server package. If you already know what HTTP and REST mean, feel free to skip ahead, but the definitions here are written for someone encountering these terms for the first time.

### HTTP (HyperText Transfer Protocol)

HTTP is the protocol (a set of rules) that web browsers and web servers use to communicate. When you type a URL into your browser and press Enter, the browser sends an **HTTP request** to a server, and the server sends back an **HTTP response**.

An HTTP request has:
- A **method** (also called a "verb"): `GET`, `POST`, `PUT`, `DELETE`, etc.
- A **path**: the part of the URL after the domain, like `/api/processes`.
- **Headers**: metadata about the request (e.g., what data format the client accepts).
- An optional **body**: data sent with the request (used with `POST` and `PUT`).

An HTTP response has:
- A **status code**: a number indicating success or failure (see below).
- **Headers**: metadata about the response.
- A **body**: the actual data being returned (often JSON).

### REST API (Representational State Transfer Application Programming Interface)

REST is a design style for building web APIs. A REST API organizes server functionality around **resources** (nouns like "processes," "threads," "system") and uses HTTP methods as **verbs**:

| HTTP Method | Meaning | Example in this project |
|-------------|---------|------------------------|
| `GET` | Read / retrieve data | `GET /api/processes` -- retrieve all processes |
| `POST` | Create or perform an action | `POST /api/processes/1234/signal` -- send a signal |

A REST API is **stateless** -- every request contains all the information the server needs to fulfill it. The server does not remember previous requests.

### WebSocket

A WebSocket is a communication protocol that provides a **persistent, bidirectional connection** between a client and a server. Unlike HTTP, where the client must initiate every exchange, a WebSocket allows the server to push data to the client at any time.

The lifecycle:
1. The client sends a special HTTP request asking to "upgrade" the connection to a WebSocket.
2. The server agrees and the connection stays open.
3. Either side can send messages at any time.
4. Either side can close the connection.

In this project, WebSockets are used to stream live process snapshots to the browser every few seconds.

### CORS (Cross-Origin Resource Sharing)

By default, web browsers block a webpage from making requests to a different "origin" (a combination of protocol, domain, and port). For example, if your frontend is served from `http://localhost:5173` and your backend runs on `http://localhost:8000`, the browser considers these **different origins** and will block the frontend's requests to the backend.

CORS is a mechanism where the **server** tells the browser: "It is safe for requests from these specific origins to reach me." The server does this by including special HTTP headers in its responses (like `Access-Control-Allow-Origin`).

### Middleware

Middleware is code that sits **between** the incoming request and your route handler. Every request passes through middleware before reaching the endpoint, and every response passes through middleware before reaching the client.

Think of middleware as a series of checkpoints at an airport. Every passenger (request) goes through security (middleware) before reaching their gate (endpoint). Middleware can:
- Modify the request (add headers, log information).
- Reject the request entirely (e.g., CORS blocking an unauthorized origin).
- Modify the response (add headers).

In this project, CORS middleware is the only middleware in use.

### Endpoint (Route)

An endpoint is a specific URL path combined with an HTTP method that the server knows how to handle. For example, `GET /api/health` is an endpoint. The function that handles it is called a **route handler** (or just "handler").

A **route** is the mapping between a URL path pattern and a handler function. The terms "endpoint" and "route" are often used interchangeably.

### Request/Response Cycle

1. The client (browser) constructs an HTTP request and sends it over the network.
2. The server receives the raw bytes and parses them into a request object.
3. The request passes through middleware (e.g., CORS checks).
4. The server matches the request's method and path to a route handler.
5. The handler runs, possibly querying the OS or a database.
6. The handler returns data, which the framework converts into an HTTP response.
7. The response passes back through middleware.
8. The server sends the response bytes back to the client.

### HTTP Status Codes

Status codes are three-digit numbers in the response that tell the client what happened.

| Code | Name | Meaning | Used in this project when... |
|------|------|---------|------------------------------|
| **200** | OK | The request succeeded. | Any successful `GET` or `POST`. |
| **400** | Bad Request | The client sent something the server cannot understand or accept. | An invalid signal name is provided to the signal endpoint. |
| **403** | Forbidden | The server understood the request but refuses to authorize it. | The server process lacks OS permissions to send a signal to another process. |
| **404** | Not Found | The requested resource does not exist. | A PID that does not correspond to any running process. |
| **500** | Internal Server Error | Something went wrong inside the server. | An unexpected OS error occurs while sending a signal. |

### JSON Serialization

**JSON** (JavaScript Object Notation) is a text format for representing structured data. It looks like this:

```json
{
  "pid": 1234,
  "name": "python",
  "cpu_percent": 12.5
}
```

**Serialization** is the process of converting an in-memory data structure (like a Python dictionary) into a string of text (JSON). **Deserialization** is the reverse -- parsing a JSON string back into a data structure.

Python's built-in `json` module can serialize basic types (`dict`, `list`, `str`, `int`, `float`, `bool`, `None`) but does **not** know how to handle `datetime`, `set`, or `bytes`. The server provides a custom serializer to handle these (covered in detail in the `app.py` section).

---

## 3. FastAPI and ASGI Concepts

### What is FastAPI?

FastAPI is a modern Python web framework for building APIs. It was chosen for this project because:

1. **Speed** -- It is one of the fastest Python web frameworks, comparable to Node.js and Go.
2. **Type hints** -- It uses Python type annotations to automatically validate request data and generate documentation.
3. **Async support** -- It natively supports `async`/`await`, which is essential for handling WebSocket connections and non-blocking I/O.
4. **Automatic documentation** -- It generates interactive API docs at `/docs` (Swagger UI) and `/redoc` automatically.

### What is ASGI?

**ASGI** stands for **Asynchronous Server Gateway Interface**. It is a specification (a standard interface) that defines how a Python web application communicates with a web server.

Think of it this way: your Python code (FastAPI) is the "application," and you need something to actually listen on a network port and handle raw TCP connections. That something is an ASGI server. The ASGI specification defines the contract between these two pieces.

The older standard is **WSGI** (Web Server Gateway Interface), which is synchronous -- it can handle only one request at a time per worker. ASGI is its asynchronous successor, allowing a single worker to handle thousands of concurrent connections (which is critical for WebSockets).

### What is Uvicorn?

**Uvicorn** is the ASGI server used to run this application. It is the program that:
- Listens on a network port (e.g., port 8000).
- Accepts incoming TCP connections.
- Translates raw HTTP bytes into Python objects.
- Calls your FastAPI application with those objects.
- Takes your application's response and sends it back over the network.

You can think of Uvicorn as the "engine" and FastAPI as the "car body." Uvicorn handles the low-level networking; FastAPI handles your application logic.

### The Lifespan Pattern

Modern FastAPI applications use a **lifespan** context manager to run code at startup and shutdown. This replaces the older `@app.on_event("startup")` and `@app.on_event("shutdown")` decorators.

A **context manager** is a Python object that defines setup and teardown behavior. You use it with the `with` statement (or `async with` for async code). Everything before `yield` runs at startup; everything after `yield` runs at shutdown.

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # --- STARTUP code runs here ---
    yield
    # --- SHUTDOWN code runs here ---
```

This pattern is used in `app.py` to start the broadcast loop when the server boots and cancel it when the server shuts down.

### Dependency Injection

**Dependency injection** is a design pattern where a function declares what it needs, and the framework provides it. In FastAPI, you can declare parameters in your route handler and FastAPI will automatically "inject" the right values.

In this project, dependency injection is used implicitly -- for example, when a route handler declares `pid: int` as a path parameter, FastAPI extracts the integer from the URL and passes it to the function.

### APIRouter

An `APIRouter` is a FastAPI class that lets you organize your routes into separate files or modules. Instead of attaching all routes directly to the main `FastAPI` app object, you attach them to a router, and then include the router in the app.

```python
# In routes.py
router = APIRouter(prefix="/api")

@router.get("/health")
async def health():
    ...

# In app.py
app.include_router(router)
```

The `prefix="/api"` means every route defined on this router will be prefixed with `/api`. So `@router.get("/health")` actually becomes `GET /api/health`.

This keeps the code organized: all REST endpoints live in `routes.py`, the app configuration lives in `app.py`, and the WebSocket logic lives in `websocket.py`.

---

## 4. app.py Deep Dive

**File**: `backend/server/app.py`

This file is the central assembly point of the server. It creates the FastAPI application, configures middleware, registers routes, and manages the application's lifecycle.

### 4.1 The Application Factory Pattern

The `create_app` function is an example of the **application factory pattern**:

```python
def create_app(settings: Settings) -> FastAPI:
    """Build and return the configured FastAPI application."""
    app = FastAPI(
        title="Process Visualizer",
        description="Real-time process monitoring backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)
    app.add_api_websocket_route("/ws", websocket_endpoint)

    return app
```

**Why use a factory function instead of creating the app at module level?**

1. **Configurability** -- The function accepts a `Settings` object as a parameter. Different callers can pass different settings (e.g., test settings vs. production settings) and get a differently-configured app.
2. **Testability** -- In tests, you can call `create_app(test_settings)` to get a fresh application instance that does not interfere with other tests.
3. **No global state** -- The app is not a module-level global. This avoids subtle bugs where importing the module triggers side effects.

The `FastAPI(...)` constructor receives:
- `title`, `description`, `version` -- metadata shown in the auto-generated documentation at `/docs`.
- `lifespan` -- the async context manager that controls startup/shutdown behavior.

After construction, `app.state.settings = settings` stores the settings object on the application's `state` attribute. `app.state` is a special attribute provided by Starlette (the toolkit FastAPI is built on) that lets you attach arbitrary data to the application instance. This is how the lifespan function and route handlers access shared configuration.

### 4.2 CORS Middleware Configuration

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

This adds CORS middleware to the application. Let us break down each parameter:

- **`allow_origins`**: A list of origins (protocol + domain + port) that are permitted to make requests. The frontend development server (Vite) runs on port 5173. Both `localhost` and `127.0.0.1` are included because they are technically different hostnames even though they point to the same machine. If the browser is at `http://localhost:5173` and the `allow_origins` list only contained `http://127.0.0.1:5173`, the browser would block the request.

- **`allow_credentials=True`**: Allows the browser to send cookies and authentication headers in cross-origin requests. Even if this project does not use authentication today, this is a common "allow everything in development" setting.

- **`allow_methods=["*"]`**: Permits all HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, etc.). The `"*"` wildcard means "any method."

- **`allow_headers=["*"]`**: Permits all HTTP headers in the request. Again, `"*"` means "any header."

**What happens without CORS middleware?** The browser would refuse to use the response from the backend. You would see an error in the browser's developer console like: "Access to fetch at 'http://localhost:8000/api/processes' from origin 'http://localhost:5173' has been blocked by CORS policy."

### 4.3 The Lifespan Context Manager

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage startup and shutdown of background services."""
    # Startup
    settings: Settings = app.state.settings
    app.state.snapshot_service = SnapshotService(settings)
    app.state.connection_manager = ConnectionManager()
    app.state.poll_interval_ms = settings.poll_interval_ms

    broadcast_task = asyncio.create_task(broadcast_loop(app))
    app.state.broadcast_task = broadcast_task

    logger.info("Process visualizer backend started on %s:%s", settings.host, settings.port)

    yield

    # Shutdown
    broadcast_task.cancel()
    try:
        await broadcast_task
    except asyncio.CancelledError:
        pass

    logger.info("Process visualizer backend shut down")
```

**Startup phase** (everything before `yield`):

1. **Creates a `SnapshotService`** -- This service is responsible for collecting process and system data. It is stored on `app.state` so that route handlers and the WebSocket endpoint can access it.

2. **Creates a `ConnectionManager`** -- This object tracks all active WebSocket connections. It is also stored on `app.state`.

3. **Sets `poll_interval_ms`** -- The interval (in milliseconds) between each data broadcast. Stored on `app.state` so that WebSocket clients can change it dynamically via the `set_interval` command.

4. **Starts the broadcast loop** -- `asyncio.create_task(broadcast_loop(app))` launches the broadcast loop as a background **task** (explained below). The task reference is saved so it can be cancelled during shutdown.

5. **Logs a startup message** -- Useful for confirming the server is running.

6. **`yield`** -- Control is handed to FastAPI. The server is now running and serving requests.

**Shutdown phase** (everything after `yield`):

1. **`broadcast_task.cancel()`** -- Sends a cancellation signal to the broadcast loop task. This does not immediately stop the task; it causes an `asyncio.CancelledError` to be raised inside the task at the next `await` point.

2. **`await broadcast_task`** -- Waits for the task to actually finish. The `try/except asyncio.CancelledError` block catches the expected cancellation error so it does not propagate as an unhandled exception.

3. **Logs a shutdown message**.

### 4.4 The Broadcast Loop

```python
async def broadcast_loop(app: FastAPI) -> None:
    """Continuously collect snapshots and broadcast to all WebSocket clients."""
    snapshot_service: SnapshotService = app.state.snapshot_service
    connection_manager: ConnectionManager = app.state.connection_manager

    while True:
        interval_ms: int = getattr(app.state, "poll_interval_ms", snapshot_service._settings.poll_interval_ms)
        await asyncio.sleep(interval_ms / 1000.0)

        if not connection_manager.active_connections:
            continue

        try:
            tick_data = await snapshot_service.collect_tick()
            await connection_manager.broadcast(tick_data, default=_json_serializer)
        except Exception:
            logger.exception("Error in broadcast loop tick")
```

This is the heart of the real-time data streaming. Let us examine it line by line.

**`while True:`** -- This is an infinite loop. It runs forever (until the task is cancelled during shutdown). Each iteration is called a "tick."

**`interval_ms = getattr(app.state, "poll_interval_ms", ...)`** -- Reads the current poll interval from `app.state`. The `getattr` function is used with a default value as a safety measure: if `poll_interval_ms` has not been set on `app.state` for some reason, it falls back to the value from the settings object. Importantly, this is read on **every iteration**, which means a WebSocket client can change the interval at runtime and the change takes effect on the next tick.

**`await asyncio.sleep(interval_ms / 1000.0)`** -- Pauses the loop for the specified interval. The division by 1000 converts milliseconds to seconds (Python's `sleep` takes seconds). The `await` keyword is critical: it tells the event loop "I am going to sleep; go do other work (like handling HTTP requests) while I wait." Without `await`, the entire server would freeze during the sleep.

**`if not connection_manager.active_connections: continue`** -- An optimization. If no WebSocket clients are connected, there is no point collecting and serializing data. The loop skips directly to the next sleep.

**`tick_data = await snapshot_service.collect_tick()`** -- Collects a snapshot of current process and system data. This calls into the `psutil` library to read CPU usage, memory, process lists, etc.

**`await connection_manager.broadcast(tick_data, default=_json_serializer)`** -- Serializes the data to JSON and sends it to every connected WebSocket client. The `default` parameter provides the custom serializer for non-standard types.

**`except Exception: logger.exception(...)`** -- If anything goes wrong during a tick (e.g., a process disappears between collection steps), the error is logged but the loop continues. This is a resilience pattern -- one bad tick should not crash the entire broadcast loop.

#### How `asyncio.create_task` Works

`asyncio.create_task()` schedules a coroutine to run **concurrently** on the event loop. It returns immediately, giving you a `Task` object that represents the running coroutine.

Think of it like hiring an assistant. When you call `asyncio.create_task(broadcast_loop(app))`, you are saying: "Start running this function in the background. I will continue doing my own work." The broadcast loop and the request handlers run on the **same thread** but take turns at `await` points (this is called cooperative multitasking).

The returned `Task` object can be:
- **Awaited** -- `await task` blocks until the task finishes.
- **Cancelled** -- `task.cancel()` requests the task to stop.
- **Inspected** -- `task.done()`, `task.result()`, `task.exception()`.

### 4.5 JSON Serialization Edge Cases

```python
def _json_serializer(obj: Any) -> Any:
    """Handle types that are not natively JSON-serializable."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")
```

Python's `json.dumps()` accepts a `default` parameter -- a function that is called whenever it encounters an object it does not know how to serialize. This function handles three cases:

**`datetime` objects** -- JSON has no native date type. The standard approach is to convert datetimes to ISO 8601 strings (e.g., `"2025-01-15T14:30:00"`). The `.isoformat()` method produces this format. The frontend can parse this string back into a JavaScript `Date` object.

**`set` objects** -- JSON has arrays (ordered lists) but no concept of a "set" (unordered collection of unique items). Converting to a `list` is the most natural mapping. For example, a Python `set({1, 2, 3})` becomes the JSON array `[1, 2, 3]`.

**`bytes` objects** -- JSON is a text format and cannot represent raw binary data. The `.decode("utf-8", errors="replace")` call converts bytes to a UTF-8 string. The `errors="replace"` parameter means that any bytes that are not valid UTF-8 are replaced with the Unicode replacement character (a question-mark-in-a-diamond symbol) rather than raising an error. This is a safe default when you do not know the encoding of the bytes.

**The final `raise TypeError`** -- If `json.dumps` encounters a type that is not handled by this function (and is not a native JSON type), this error is raised. This makes debugging easier: you get a clear error message telling you exactly which type caused the problem, rather than a generic "not serializable" message.

---

## 5. routes.py Deep Dive

**File**: `backend/server/routes.py`

This file defines all REST API endpoints. It uses an `APIRouter` with the prefix `/api`, meaning every route path is prefixed with `/api`.

### Module-Level Setup

```python
router = APIRouter(prefix="/api")

_thread_collector = ThreadCollector()

ALLOWED_SIGNALS: dict[str, int] = {
    "SIGTERM": signal_module.SIGTERM,
    "SIGKILL": signal_module.SIGKILL,
    "SIGSTOP": signal_module.SIGSTOP,
    "SIGCONT": signal_module.SIGCONT,
}

class SignalRequest(BaseModel):
    signal: str
```

**`_thread_collector = ThreadCollector()`** -- A module-level singleton. The thread collector tracks CPU usage deltas (the difference in CPU time between two measurements), which requires it to persist across requests. If a new instance were created per request, it would have no previous measurement to compare against, and CPU percentages would always be zero.

**`ALLOWED_SIGNALS`** -- A whitelist of signal names the API will accept. This is a security measure -- it prevents callers from sending arbitrary signals. More on signals in section 5.6.

**`SignalRequest`** -- A Pydantic model that defines the expected shape of the request body for the signal endpoint. Pydantic is a data validation library. When FastAPI sees a route parameter typed as `SignalRequest`, it automatically parses the JSON request body, validates that it has a `signal` field of type `str`, and returns a 422 error if validation fails.

---

### 5.1 `GET /api/health`

```python
@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "pid": os.getpid()}
```

**HTTP Method and Path**: `GET /api/health`

**What it does**: Returns a simple JSON object confirming the server is running. It also includes the server's own process ID (PID), which can be useful for debugging.

**When the frontend calls it**: Typically on initial load to verify the backend is reachable. Health endpoints are also used by monitoring systems and load balancers to check if a service is alive.

**Request parameters**: None.

**Response shape**:
```json
{
  "status": "ok",
  "pid": 12345
}
```

**Error cases**: This endpoint has no error handling because `os.getpid()` cannot fail -- if the process exists enough to handle the request, it has a PID.

---

### 5.2 `GET /api/system`

```python
@router.get("/system")
async def system_snapshot() -> dict:
    collector = SystemCollector()
    snapshot = collector.collect()
    return snapshot.model_dump()
```

**HTTP Method and Path**: `GET /api/system`

**What it does**: Collects and returns a snapshot of system-wide metrics -- CPU usage across all cores, total and available memory, swap usage, etc.

**When the frontend calls it**: On the "CPU Cores" and "Memory View" pages, or whenever the dashboard needs system-level information.

**Request parameters**: None.

**Response shape**: A dictionary produced by `snapshot.model_dump()`. The exact fields depend on `SystemCollector`, but typically include:
```json
{
  "cpu_percent": 23.5,
  "cpu_count": 8,
  "cpu_freq_mhz": 3200.0,
  "memory_total_bytes": 17179869184,
  "memory_available_bytes": 8589934592,
  "memory_percent": 50.0,
  "swap_total_bytes": 4294967296,
  "swap_used_bytes": 1073741824,
  ...
}
```

**Error cases**: No explicit error handling. If `psutil` fails (extremely rare for system-wide metrics), FastAPI will return a 500 Internal Server Error automatically.

**Note on `model_dump()`**: This is a Pydantic method that converts a Pydantic model instance into a plain Python dictionary. Pydantic models are used throughout the collectors to ensure data has the correct types and structure. `model_dump()` produces a dictionary that FastAPI can directly serialize to JSON.

---

### 5.3 `GET /api/processes`

```python
@router.get("/processes")
async def list_processes() -> list[dict]:
    collector = ProcessCollector()
    processes = collector.collect_all()
    return [p.model_dump() for p in processes]
```

**HTTP Method and Path**: `GET /api/processes`

**What it does**: Returns a list of all running processes on the system, with basic metrics for each (PID, name, CPU%, memory, etc.).

**When the frontend calls it**: On the "Process List" page to populate the table of all processes.

**Request parameters**: None.

**Response shape**: A JSON array of process objects:
```json
[
  {
    "pid": 1,
    "name": "init",
    "cpu_percent": 0.0,
    "memory_rss_bytes": 12345678,
    "status": "running",
    "username": "root",
    ...
  },
  ...
]
```

**Error cases**: No explicit error handling. The `ProcessCollector` internally handles individual process failures (a process may disappear between enumeration and data collection) and simply omits those processes from the result.

---

### 5.4 `GET /api/processes/{pid}`

```python
@router.get("/processes/{pid}")
async def get_process(pid: int) -> dict:
    collector = ProcessCollector()
    snapshot = collector.collect_one(pid)
    if snapshot is None:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")

    result = snapshot.model_dump()

    try:
        proc = psutil.Process(pid)

        try:
            open_files = proc.open_files()
            result["open_files"] = [{"path": f.path, "fd": f.fd} for f in open_files]
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            result["open_files"] = []

        try:
            connections = proc.net_connections()
            # ... builds conn_list ...
            result["connections"] = conn_list
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            result["connections"] = []

        try:
            result["environ"] = proc.environ()
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            result["environ"] = {}

        try:
            mem_full = proc.memory_full_info()
            result["memory_uss_bytes"] = getattr(mem_full, "uss", 0)
            result["memory_pss_bytes"] = getattr(mem_full, "pss", 0)
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            pass

    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
    except psutil.AccessDenied:
        pass

    return result
```

**HTTP Method and Path**: `GET /api/processes/{pid}`

The `{pid}` is a **path parameter**. FastAPI extracts the value from the URL and converts it to an integer (because the function parameter is typed `pid: int`). For example, a request to `/api/processes/1234` would set `pid = 1234`.

**What it does**: Returns detailed information about a single process, including expensive-to-collect fields that are not included in the process list:
- **Open files** -- every file the process currently has open, with the file descriptor number.
- **Network connections** -- all network sockets the process owns, with local/remote addresses and connection status.
- **Environment variables** -- the full set of environment variables the process was started with.
- **Extended memory info** -- USS (Unique Set Size: memory unique to this process) and PSS (Proportional Set Size: shared memory divided proportionally among all sharers).

**When the frontend calls it**: When the user clicks on a specific process to see its detail view.

**Request parameters**:
- `pid` (path parameter, integer, required): The process ID to look up.

**Response shape**:
```json
{
  "pid": 1234,
  "name": "python",
  "cpu_percent": 5.2,
  "memory_rss_bytes": 52428800,
  "open_files": [
    {"path": "/usr/lib/libpython3.so", "fd": 3}
  ],
  "connections": [
    {
      "fd": 5,
      "family": "AddressFamily.AF_INET",
      "type": "SocketKind.SOCK_STREAM",
      "local_addr": "127.0.0.1:8000",
      "remote_addr": "127.0.0.1:54321",
      "status": "ESTABLISHED"
    }
  ],
  "environ": {
    "PATH": "/usr/bin:/bin",
    "HOME": "/root"
  },
  "memory_uss_bytes": 41943040,
  "memory_pss_bytes": 47185920,
  ...
}
```

**Error cases**:
- **404** -- The process with the given PID does not exist (either `collect_one` returns `None`, or `psutil.NoSuchProcess` is raised during detail collection).
- **Partial data on AccessDenied** -- If the server process does not have permission to read certain data (e.g., environment variables of a process owned by a different user), those fields are set to empty values rather than failing the entire request. This is a **graceful degradation** pattern.

**Why are the "expensive" fields collected separately?** Fields like open files, network connections, and environment variables require additional system calls that are slower than basic process info. The `/api/processes` list endpoint omits them for performance (you don't need open files for every process in a table). The detail endpoint fetches them because the user has specifically asked about one process.

---

### 5.5 `GET /api/processes/{pid}/threads`

```python
@router.get("/processes/{pid}/threads")
async def get_threads(pid: int) -> list[dict]:
    threads = _thread_collector.collect_threads(pid)
    return [t.model_dump() for t in threads]
```

**HTTP Method and Path**: `GET /api/processes/{pid}/threads`

**What it does**: Returns a list of all threads belonging to a specific process. Each thread includes its thread ID, CPU usage, and current state.

**When the frontend calls it**: In the process detail view, when the user expands the threads section.

**Request parameters**:
- `pid` (path parameter, integer, required): The process ID whose threads to list.

**Response shape**:
```json
[
  {
    "thread_id": 1234,
    "cpu_percent": 2.1,
    "user_time": 45.67,
    "system_time": 12.34
  },
  ...
]
```

**Error cases**: If the process does not exist, `collect_threads` returns an empty list rather than raising an error. The endpoint returns `[]`.

**Why use the module-level `_thread_collector`?** Thread CPU percentage is calculated as the difference in CPU time between two calls divided by the elapsed wall-clock time. The `ThreadCollector` stores the previous measurement. If a new collector were created per request, the first call would always have zero CPU percentage because there is no previous baseline.

---

### 5.6 `POST /api/processes/{pid}/signal`

```python
@router.post("/processes/{pid}/signal")
async def send_signal(pid: int, body: SignalRequest) -> dict:
    signal_name = body.signal.upper()

    if signal_name not in ALLOWED_SIGNALS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid signal '{body.signal}'. Allowed signals: {', '.join(ALLOWED_SIGNALS)}",
        )

    if not psutil.pid_exists(pid):
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")

    try:
        os.kill(pid, ALLOWED_SIGNALS[signal_name])
    except ProcessLookupError:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
    except PermissionError:
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: cannot send {signal_name} to process {pid}",
        )
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "ok", "pid": pid, "signal": signal_name}
```

**HTTP Method and Path**: `POST /api/processes/{pid}/signal`

This is a `POST` because it performs an **action** (sending a signal) rather than retrieving data. In REST conventions, `GET` is for reading and `POST` is for actions with side effects.

**What it does**: Sends a Unix signal to a specific process. This allows the frontend user to terminate, kill, stop, or resume processes directly from the UI.

**When the frontend calls it**: When the user clicks a "Kill," "Terminate," "Stop," or "Resume" button in the process detail view.

**Request parameters**:
- `pid` (path parameter, integer, required): The target process ID.
- `body` (JSON request body, required): Must match the `SignalRequest` schema:
  ```json
  {"signal": "SIGTERM"}
  ```

**Response shape (success)**:
```json
{
  "status": "ok",
  "pid": 1234,
  "signal": "SIGTERM"
}
```

**Error cases**:
- **400 Bad Request** -- The signal name is not in the allowed list.
- **404 Not Found** -- The process does not exist (checked both before and after the `os.kill` call, because the process could disappear between the check and the signal).
- **403 Forbidden** -- The server process does not have OS-level permission to signal the target process (e.g., trying to kill a root-owned process while running as a regular user).
- **500 Internal Server Error** -- An unexpected OS error occurred.

#### What are Unix Signals?

A **signal** is a software interrupt delivered to a process by the operating system. Signals are the primary mechanism for inter-process communication and process control on Unix-like systems (Linux, macOS).

When a signal is delivered to a process, the process can:
1. **Handle it** -- Run a custom signal handler function.
2. **Ignore it** -- Do nothing (not possible for all signals).
3. **Use the default behavior** -- Each signal has a default action (usually terminate the process).

The four signals allowed by this API:

| Signal | Number | Default Action | Description |
|--------|--------|----------------|-------------|
| **SIGTERM** | 15 | Terminate | A polite request to terminate. The process can catch this signal, clean up resources (close files, save state), and exit gracefully. This is the "please shut down" signal. Most programs handle SIGTERM. |
| **SIGKILL** | 9 | Terminate (forced) | An unconditional kill. The process **cannot** catch, handle, or ignore this signal. The kernel immediately removes the process. Use this as a last resort when SIGTERM does not work. Data loss may occur because the process has no chance to clean up. |
| **SIGSTOP** | 17/19/23* | Stop (pause) | Pauses the process. The process is frozen in place -- it stops executing but remains in memory. Like SIGKILL, this signal **cannot** be caught or ignored. |
| **SIGCONT** | 19/18/25* | Continue | Resumes a stopped process. This is the counterpart to SIGSTOP. |

*Signal numbers vary by operating system; the names are portable.

**`os.kill(pid, signal_number)`** -- Despite its name, `os.kill` does not always kill a process. It sends any signal to any process. The name is historical: the original use case was sending SIGKILL.

**Why restrict to only four signals?** There are dozens of signals on a typical Unix system (SIGHUP, SIGINT, SIGUSR1, etc.). Exposing all of them through a web API would be a security risk and a usability problem. These four cover the essential process control operations: graceful shutdown, forced shutdown, pause, and resume.

---

### 5.7 `GET /api/tree`

```python
@router.get("/tree")
async def process_tree() -> list[dict]:
    proc_collector = ProcessCollector()
    processes = proc_collector.collect_all()
    tree_service = TreeService()
    return tree_service.build_tree(processes)
```

**HTTP Method and Path**: `GET /api/tree`

**What it does**: Returns all processes organized as a tree structure based on parent-child relationships. Every process on a Unix system (except PID 1, the init process) has a parent process that created it. This endpoint builds that hierarchy.

**When the frontend calls it**: On the "Process Tree" page.

**Request parameters**: None.

**Response shape**: A JSON array of tree nodes. Each node has process data and a `children` array:
```json
[
  {
    "data": {"pid": 1, "name": "init", "cpu_percent": 0.1, ...},
    "children": [
      {
        "data": {"pid": 500, "name": "systemd-logind", ...},
        "children": []
      },
      ...
    ]
  }
]
```

**Error cases**: No explicit error handling. Returns whatever the `TreeService` builds, which is always a valid (possibly empty) list.

---

### 5.8 `GET /api/tree/{pid}`

```python
@router.get("/tree/{pid}")
async def process_subtree(pid: int) -> dict:
    proc_collector = ProcessCollector()
    processes = proc_collector.collect_all()
    threads = _thread_collector.collect_threads(pid)
    threads_by_pid: dict[int, list] = {}
    if threads:
        threads_by_pid[pid] = threads

    tree_service = TreeService()
    full_tree = tree_service.build_tree(processes, threads_by_pid)

    def find_node(nodes: list[dict], target_pid: int) -> dict | None:
        for node in nodes:
            if node.get("data", {}).get("pid") == target_pid:
                return node
            found = find_node(node.get("children", []), target_pid)
            if found is not None:
                return found
        return None

    node = find_node(full_tree, pid)
    if node is None:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found in tree")

    return node
```

**HTTP Method and Path**: `GET /api/tree/{pid}`

**What it does**: Returns the subtree rooted at a specific process. It includes the process itself, all its descendants (children, grandchildren, etc.), and the threads of the specified process.

**When the frontend calls it**: When the user clicks on a process in the tree view to focus on its subtree.

**Request parameters**:
- `pid` (path parameter, integer, required): The PID of the root process for the subtree.

**Response shape**: A single tree node with nested children:
```json
{
  "data": {"pid": 1234, "name": "python", ...},
  "children": [
    {
      "data": {"pid": 1235, "name": "worker-1", ...},
      "children": []
    }
  ]
}
```

**Error cases**:
- **404** -- The process with the given PID is not found in the tree.

**The `find_node` function** is a **recursive** search. It walks through the tree depth-first, checking each node's PID. If a node matches, it is returned. If not, the function calls itself on each child. This is a classic tree traversal algorithm.

---

## 6. websocket.py Deep Dive

**File**: `backend/server/websocket.py`

This file implements the real-time data streaming system using WebSockets. It has two main parts: the `ConnectionManager` class and the `websocket_endpoint` function.

### 6.1 ConnectionManager

```python
class ConnectionManager:
    """Manages active WebSocket connections and broadcasts messages."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await ws.accept()
        self.active_connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        """Remove a WebSocket connection from the active list."""
        try:
            self.active_connections.remove(ws)
        except ValueError:
            pass

    async def broadcast(self, message: dict, default: Any = None) -> None:
        """Serialize *message* to JSON and send to all active connections."""
        serializer = default or _json_default
        text = json.dumps(message, default=serializer)

        dead: list[WebSocket] = []
        for ws in self.active_connections:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)
```

The `ConnectionManager` follows the **observer pattern** (also called the publish-subscribe pattern). It maintains a list of "subscribers" (WebSocket connections) and sends messages to all of them when new data is available.

#### How It Tracks Clients

The `active_connections` list is a simple Python list of `WebSocket` objects. Each `WebSocket` object represents one open connection to one browser tab.

- **`connect(ws)`** -- Called when a new client connects. `await ws.accept()` completes the WebSocket handshake (the server agrees to the upgrade request). Then the socket is added to the list.

- **`disconnect(ws)`** -- Called when a client disconnects. The `try/except ValueError` handles the case where the socket has already been removed (e.g., it was cleaned up by `broadcast` before `disconnect` was called explicitly). This is defensive programming -- it prevents a crash from a harmless race condition.

#### Broadcast Pattern

The `broadcast` method is the core of real-time data delivery:

1. **Serialize once** -- `json.dumps(message, default=serializer)` converts the data to a JSON string **once**, regardless of how many clients are connected. This is efficient: serializing a large process snapshot is expensive, and doing it once instead of N times saves significant CPU time.

2. **Send to all** -- It iterates over every active connection and sends the same text.

3. **Dead connection cleanup** -- If sending to a connection fails (the client closed the tab, the network dropped, etc.), the connection is added to the `dead` list. After iterating through all connections, dead connections are removed. This two-phase approach avoids modifying the list while iterating over it, which would cause bugs (skipping connections or index errors).

**Why not remove dead connections immediately?** In Python, removing an item from a list while iterating over that same list causes the iterator to skip the next item. The standard solution is to collect items to remove in a separate list, then remove them after the loop.

### 6.2 The WebSocket Lifecycle

```python
async def websocket_endpoint(websocket: WebSocket) -> None:
    snapshot_service = websocket.app.state.snapshot_service
    connection_manager: ConnectionManager = websocket.app.state.connection_manager

    await connection_manager.connect(websocket)

    try:
        # Send an initial full snapshot immediately.
        initial_data = await snapshot_service.collect_full_snapshot()
        text = json.dumps(initial_data, default=_json_default)
        await websocket.send_text(text)

        # Listen for client commands.
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Received non-JSON WebSocket message: %s", raw[:200])
                continue

            action = msg.get("action")

            if action == "subscribe_process":
                pid = msg.get("pid")
                if isinstance(pid, int):
                    snapshot_service.subscribe_pid(pid)

            elif action == "unsubscribe_process":
                pid = msg.get("pid")
                if isinstance(pid, int):
                    snapshot_service.unsubscribe_pid(pid)

            elif action == "set_interval":
                interval = msg.get("interval_ms")
                if isinstance(interval, (int, float)) and interval >= 100:
                    websocket.app.state.poll_interval_ms = int(interval)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception:
        logger.exception("Unexpected error in WebSocket endpoint")
    finally:
        connection_manager.disconnect(websocket)
```

The lifecycle of a single WebSocket connection proceeds through these phases:

#### Phase 1: Connect

```python
await connection_manager.connect(websocket)
```

The WebSocket handshake is completed and the connection is registered. From this point on, the `broadcast_loop` in `app.py` will include this connection when broadcasting data.

#### Phase 2: Initial Snapshot

```python
initial_data = await snapshot_service.collect_full_snapshot()
text = json.dumps(initial_data, default=_json_default)
await websocket.send_text(text)
```

Immediately after connecting, the server sends a **full snapshot** of all process and system data. This is important because the broadcast loop sends incremental "tick" data at regular intervals. Without an initial snapshot, the client would have to wait until the next tick to display anything. By sending a full snapshot immediately, the UI can render right away.

#### Phase 3: Listen for Commands

```python
while True:
    raw = await websocket.receive_text()
```

The endpoint enters an infinite loop, waiting for messages from the client. The `await websocket.receive_text()` call **blocks** (in the async sense -- other tasks continue running) until the client sends a message. This is how the server receives commands from the frontend.

Each received message is parsed as JSON. If it is not valid JSON, a warning is logged and the message is ignored (the `continue` statement skips to the next iteration of the loop).

#### Phase 4: Disconnect

```python
except WebSocketDisconnect:
    logger.info("WebSocket client disconnected")
...
finally:
    connection_manager.disconnect(websocket)
```

When the client closes the connection (closes the browser tab, navigates away, or loses network), `receive_text()` raises `WebSocketDisconnect`. The `finally` block ensures the connection is always removed from the manager, even if an unexpected exception occurs. This prevents the broadcast loop from trying to send data to a dead connection.

### 6.3 Client Commands

The frontend can send three types of commands over the WebSocket:

#### `subscribe_process`

```json
{"action": "subscribe_process", "pid": 1234}
```

Tells the server that the client is interested in detailed data about a specific process. The `snapshot_service.subscribe_pid(pid)` call adds this PID to a set of "watched" processes. On subsequent broadcast ticks, the snapshot will include extra detail for subscribed PIDs (such as thread information or more frequent updates).

**Use case**: When the user opens the detail view for a process, the frontend sends this command so the server includes detailed data for that process in every broadcast.

#### `unsubscribe_process`

```json
{"action": "unsubscribe_process", "pid": 1234}
```

The inverse of subscribe. When the user navigates away from a process detail view, the frontend sends this command to tell the server to stop including extra detail for that PID.

#### `set_interval`

```json
{"action": "set_interval", "interval_ms": 2000}
```

Changes the broadcast interval. The minimum allowed value is 100 milliseconds. This directly modifies `websocket.app.state.poll_interval_ms`, which the `broadcast_loop` in `app.py` reads on every tick.

**Use case**: The frontend might offer a "refresh rate" slider. Setting a lower interval gives more responsive updates but uses more CPU and bandwidth.

**Important detail**: The minimum of 100ms is enforced by the condition `interval >= 100`. Without this guard, a malicious or buggy client could set the interval to 1ms and overwhelm the server.

### 6.4 Why WebSocket Instead of Polling REST?

**Polling** means the client repeatedly calls a REST endpoint at regular intervals:

```
Client: GET /api/processes     (wait 2 seconds)
Client: GET /api/processes     (wait 2 seconds)
Client: GET /api/processes     (wait 2 seconds)
...
```

**WebSocket** means the server pushes data to the client whenever it is available:

```
Server: here is a snapshot     (2 seconds pass)
Server: here is a snapshot     (2 seconds pass)
Server: here is a snapshot
...
```

The advantages of WebSocket for this application:

| Aspect | Polling REST | WebSocket |
|--------|-------------|-----------|
| **Latency** | Data can be up to one polling interval stale. | Data arrives as soon as the server collects it. |
| **Overhead** | Each poll requires a full HTTP request/response (headers, connection setup). | One connection is established; subsequent messages are lightweight frames. |
| **Server load** | The server processes N identical requests per second per client. | The server collects data once and broadcasts to all clients simultaneously. |
| **Bidirectional** | Client-to-server only (client initiates). | Both directions (client can send commands like `subscribe_process`). |
| **Connection count** | A new TCP connection for each poll (unless HTTP keep-alive is used). | One persistent TCP connection per client. |

For a real-time process monitor that updates multiple times per second, WebSocket is clearly superior. The broadcast pattern (collect once, send to all) is especially efficient when multiple browser tabs are open.

---

## 7. Request Flow Diagrams

### 7.1 REST Request Flow

This traces what happens when the frontend calls `GET /api/processes/1234`:

```
Browser (Frontend)
    |
    |  HTTP GET /api/processes/1234
    |  Headers: Origin: http://localhost:5173
    v
Uvicorn (ASGI Server)
    |
    |  Parses raw HTTP bytes into a Request object
    v
CORS Middleware
    |
    |  Checks: Is "http://localhost:5173" in allow_origins?
    |  Yes -> Adds Access-Control-Allow-Origin header
    |  No  -> Returns 403 (request blocked)
    v
FastAPI Router Matching
    |
    |  Matches path "/api/processes/1234" to route "/api/processes/{pid}"
    |  Extracts pid=1234 from the path
    v
get_process(pid=1234) handler in routes.py
    |
    |  1. ProcessCollector().collect_one(1234)
    |     -> Calls psutil.Process(1234) to read basic process info
    |     -> Returns a Pydantic model (or None if not found)
    |
    |  2. If None: raise HTTPException(404)
    |
    |  3. snapshot.model_dump() -> converts to dict
    |
    |  4. psutil.Process(1234).open_files()
    |     -> Reads /proc/1234/fd on Linux (or equivalent on macOS)
    |
    |  5. psutil.Process(1234).net_connections()
    |     -> Reads /proc/1234/net on Linux
    |
    |  6. psutil.Process(1234).environ()
    |     -> Reads /proc/1234/environ on Linux
    |
    |  7. psutil.Process(1234).memory_full_info()
    |     -> Reads detailed memory maps
    |
    |  8. Returns the enriched dict
    v
FastAPI JSON Response
    |
    |  Serializes dict to JSON string
    |  Sets Content-Type: application/json
    |  Sets status code: 200
    v
CORS Middleware (response pass-through)
    |
    |  Adds CORS headers to response
    v
Uvicorn
    |
    |  Converts Response object to raw HTTP bytes
    |  Sends over TCP connection
    v
Browser (Frontend)
    |
    |  Parses JSON response
    |  Updates React state
    |  Re-renders the ProcessDetail component
```

### 7.2 WebSocket Connection and Message Flow

This traces the full lifecycle of a WebSocket connection:

```
Browser (Frontend)
    |
    |  HTTP GET /ws (with Upgrade: websocket header)
    v
Uvicorn
    |
    |  Detects WebSocket upgrade request
    |  Routes to websocket_endpoint()
    v
websocket_endpoint() in websocket.py
    |
    |  1. connection_manager.connect(websocket)
    |     -> await websocket.accept()  (completes handshake)
    |     -> Adds to active_connections list
    |
    |  2. snapshot_service.collect_full_snapshot()
    |     -> Gathers all process + system data
    |     -> json.dumps() with custom serializer
    |     -> websocket.send_text(json_string)
    |
    |  3. Enters receive loop: await websocket.receive_text()
    |     (blocks until client sends a message)
    v

=== Meanwhile, in parallel: ===

broadcast_loop() in app.py
    |
    |  Every N milliseconds:
    |    1. await asyncio.sleep(interval_ms / 1000)
    |    2. snapshot_service.collect_tick()
    |    3. connection_manager.broadcast(tick_data)
    |       -> json.dumps(tick_data) once
    |       -> For each ws in active_connections:
    |            ws.send_text(json_string)
    |       -> Remove any dead connections
    v

=== Client sends a command: ===

Browser
    |
    |  {"action": "subscribe_process", "pid": 1234}
    v
websocket_endpoint() receive loop
    |
    |  raw = await websocket.receive_text()
    |  msg = json.loads(raw)
    |  action = "subscribe_process"
    |  pid = 1234
    |  -> snapshot_service.subscribe_pid(1234)
    |
    |  (loop continues, waiting for next message)
    v

=== Client disconnects: ===

Browser closes tab
    |
    v
websocket.receive_text() raises WebSocketDisconnect
    |
    v
except WebSocketDisconnect:
    logger.info("WebSocket client disconnected")
    |
    v
finally:
    connection_manager.disconnect(websocket)
    -> Removes from active_connections list
    -> Future broadcasts skip this connection
```

### 7.3 Signal Request Flow

This traces what happens when the user clicks "Terminate" on process 5678:

```
Browser (Frontend)
    |
    |  POST /api/processes/5678/signal
    |  Body: {"signal": "SIGTERM"}
    v
Uvicorn -> CORS Middleware -> FastAPI Router
    |
    v
send_signal(pid=5678, body=SignalRequest(signal="SIGTERM"))
    |
    |  1. signal_name = "SIGTERM"
    |
    |  2. Is "SIGTERM" in ALLOWED_SIGNALS? -> Yes
    |     (If no: return 400 Bad Request)
    |
    |  3. psutil.pid_exists(5678) -> True
    |     (If false: return 404 Not Found)
    |
    |  4. os.kill(5678, 15)   [15 is SIGTERM's number]
    |     -> Kernel delivers signal to process 5678
    |     -> ProcessLookupError? -> 404
    |     -> PermissionError?    -> 403
    |     -> OSError?            -> 500
    |
    |  5. Return {"status": "ok", "pid": 5678, "signal": "SIGTERM"}
    v
Browser
    |
    |  Shows success notification
    |  Process 5678 begins shutting down
    |  Next WebSocket broadcast reflects updated process list
```

---

## 8. Glossary

An alphabetical reference of every technical term used in this document.

**APIRouter** -- A FastAPI class for organizing route handlers into separate modules. Routes are defined on the router and later included in the main application via `app.include_router()`.

**ASGI (Asynchronous Server Gateway Interface)** -- A specification defining how asynchronous Python web applications communicate with web servers. It is the async successor to WSGI.

**async/await** -- Python keywords for asynchronous programming. `async def` declares a coroutine function. `await` pauses execution of the coroutine until the awaited operation completes, allowing other coroutines to run in the meantime.

**asyncio** -- Python's built-in library for writing asynchronous code. It provides the event loop, tasks, and synchronization primitives.

**Broadcast** -- The act of sending the same message to multiple recipients simultaneously. In this project, the server broadcasts process data to all connected WebSocket clients.

**Client** -- A program that initiates requests to a server. In this project, the React frontend running in a web browser.

**Context Manager** -- A Python object that defines setup and teardown behavior using `__enter__`/`__exit__` (sync) or `__aenter__`/`__aexit__` (async). Used with the `with` or `async with` statement.

**CORS (Cross-Origin Resource Sharing)** -- A browser security mechanism that restricts web pages from making requests to a different origin than the one that served the page. Servers opt in to allowing cross-origin requests by sending specific HTTP headers.

**Coroutine** -- A function defined with `async def` that can be paused and resumed. Coroutines are the building blocks of asynchronous Python code.

**Dependency Injection** -- A design pattern where a function declares what it needs as parameters, and the framework automatically provides (injects) those values.

**Endpoint** -- A specific URL path plus HTTP method that the server handles. For example, `GET /api/health`.

**Event Loop** -- The central mechanism in asyncio that schedules and runs coroutines. It repeatedly checks for completed I/O operations and runs the next step of waiting coroutines.

**FastAPI** -- A modern Python web framework for building APIs with automatic validation, serialization, and documentation.

**Graceful Degradation** -- A design approach where the system continues to function with reduced capability rather than failing entirely. In this project, if certain process data cannot be read due to permissions, the endpoint returns what it can rather than returning an error.

**Handler (Route Handler)** -- The Python function that processes a request for a specific endpoint.

**HTTP (HyperText Transfer Protocol)** -- The protocol used for communication between web browsers and web servers. Defines methods (GET, POST, etc.), status codes, headers, and message body format.

**HTTPException** -- A FastAPI class for returning error responses. It takes a status code and a detail message.

**ISO 8601** -- An international standard for representing dates and times as strings (e.g., `2025-01-15T14:30:00`).

**JSON (JavaScript Object Notation)** -- A lightweight text format for structured data. Uses key-value pairs (`{}`) and ordered lists (`[]`). The lingua franca of web APIs.

**JSON Serialization** -- Converting an in-memory data structure (like a Python dict) into a JSON text string.

**Lifespan** -- In FastAPI, the lifespan is an async context manager that runs code when the application starts up and shuts down. It replaces the older `on_event("startup")` / `on_event("shutdown")` pattern.

**Middleware** -- Software that processes requests and responses between the client and the route handler. Middleware can modify, validate, or reject traffic.

**model_dump()** -- A Pydantic method that converts a model instance into a plain Python dictionary.

**Observer Pattern** -- A design pattern where an object (the "subject") maintains a list of dependents ("observers") and notifies them of state changes. The `ConnectionManager` is the subject; WebSocket connections are the observers.

**Origin** -- In web security, an origin is the combination of protocol (http/https), domain (localhost), and port (5173). Two URLs have the same origin only if all three match.

**os.kill()** -- A Python function that sends a signal to a process. Despite its name, it can send any signal, not just SIGKILL.

**Path Parameter** -- A variable embedded in a URL path, like `{pid}` in `/api/processes/{pid}`. FastAPI extracts the value and passes it to the handler function.

**PID (Process ID)** -- A unique integer assigned by the operating system to each running process.

**Polling** -- A technique where the client repeatedly asks the server for updates at regular intervals. Less efficient than server push for real-time data.

**psutil** -- A Python library for retrieving information about running processes and system utilization (CPU, memory, disk, network).

**Pydantic** -- A Python data validation library that uses type annotations to validate and serialize data. FastAPI uses it extensively.

**Recursive Function** -- A function that calls itself. In `routes.py`, `find_node` calls itself to search through a tree of nested dictionaries.

**Request** -- An HTTP message sent from client to server, consisting of a method, path, headers, and optional body.

**Resource** -- In REST, a resource is a conceptual entity (like a process, thread, or system) that can be addressed by a URL.

**Response** -- An HTTP message sent from server to client, consisting of a status code, headers, and optional body.

**REST (Representational State Transfer)** -- An architectural style for web APIs that organizes functionality around resources and uses HTTP methods as verbs.

**Route** -- A mapping between a URL pattern and a handler function.

**Server** -- A program that listens for and responds to client requests.

**Serializer** -- A function that converts an object to a text or binary representation (e.g., Python dict to JSON string).

**SIGCONT** -- A Unix signal that resumes a stopped process.

**SIGKILL** -- A Unix signal that immediately terminates a process. Cannot be caught or ignored.

**Signal (Unix)** -- A software interrupt sent to a process. Used for inter-process communication and process control.

**SIGSTOP** -- A Unix signal that pauses a process. Cannot be caught or ignored.

**SIGTERM** -- A Unix signal that requests a process to terminate gracefully. Can be caught and handled.

**Singleton** -- An object of which only one instance exists. The `_thread_collector` in `routes.py` is a module-level singleton.

**Snapshot** -- A point-in-time capture of system or process data.

**Starlette** -- The ASGI toolkit that FastAPI is built on top of. It provides the low-level HTTP and WebSocket handling.

**State (app.state)** -- A Starlette attribute on the FastAPI application object for storing application-wide data (services, configuration, etc.).

**Stateless** -- A property of REST APIs where each request contains all information needed to process it. The server does not remember previous requests.

**Status Code** -- A three-digit number in an HTTP response indicating the outcome (200 = success, 404 = not found, etc.).

**Task (asyncio.Task)** -- A wrapper around a coroutine that schedules it to run on the event loop. Created by `asyncio.create_task()`.

**TCP (Transmission Control Protocol)** -- The underlying network protocol that HTTP and WebSocket run on top of. It provides reliable, ordered delivery of bytes.

**Tick** -- One iteration of the broadcast loop. Each tick collects a snapshot and broadcasts it.

**USS (Unique Set Size)** -- The amount of memory that is unique to a process and would be freed if the process were terminated. Does not include memory shared with other processes.

**PSS (Proportional Set Size)** -- A process's share of memory, where shared memory is divided proportionally among all processes sharing it.

**Uvicorn** -- A high-performance ASGI server for Python. It handles the low-level networking (listening on a port, managing connections) and delegates request handling to the FastAPI application.

**WebSocket** -- A communication protocol providing full-duplex (bidirectional) communication channels over a single TCP connection. Unlike HTTP, either side can send messages at any time.

**WebSocketDisconnect** -- A FastAPI exception raised when a WebSocket client disconnects.

**WSGI (Web Server Gateway Interface)** -- The older, synchronous standard for Python web application servers. Replaced by ASGI for applications that need async support.

**Yield** -- A Python keyword used in generators and context managers. In a lifespan context manager, `yield` separates startup code from shutdown code.
