#!/usr/bin/env python3
"""
STRESS TEST for M4 MacBook (12 cores, 24GB)
============================================
Phase 1: 10 parallel processes, each with 4 threads → ~80% CPU for 20s
Phase 2: Sequential processes come and go
"""

import ctypes
import ctypes.util
import math
import multiprocessing
import os
import threading
import time


def _set_proc_name(name):
    """Set process name using libc (no pip packages needed)."""
    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c"))
        libc.pthread_setname_np(name.encode()[:63])
    except Exception:
        pass


def thread_burn(duration_sec):
    """Single thread: tight math loop."""
    end = time.monotonic() + duration_sec
    x = 1.0
    while time.monotonic() < end:
        for _ in range(100_000):
            x = math.sqrt(abs(x) + 1.0) * math.sin(x) + math.log(abs(x) + 1.0)
            x = math.cos(x * 0.001) + math.tan(min(abs(x), 1.0))
            x = math.pow(abs(x) + 0.1, 0.99) * math.atan(x)


def memory_eater(duration_sec, megabytes=200):
    """Allocate memory in chunks and keep touching it."""
    blocks = []
    chunk = 1024 * 1024  # 1MB
    for i in range(megabytes):
        block = bytearray(chunk)
        for offset in range(0, chunk, 4096):
            block[offset] = (i * 7 + offset) % 256
        blocks.append(block)
        time.sleep(0.01)
    # Hold and touch memory until duration expires
    end = time.monotonic() + duration_sec
    while time.monotonic() < end:
        for block in blocks:
            block[0] = (block[0] + 1) % 256
        time.sleep(0.3)


def worker_with_threads(duration_sec, name, num_threads=4):
    """Process that spawns multiple real OS threads."""
    _set_proc_name(name)
    threads = []
    for i in range(num_threads):
        t = threading.Thread(target=thread_burn, args=(duration_sec,), name=f"{name}-T{i}")
        t.start()
        threads.append(t)
    for t in threads:
        t.join()


def worker_cpu_and_memory(duration_sec, name, num_threads=4, mem_mb=200):
    """Process that burns CPU with threads AND eats memory."""
    _set_proc_name(name)
    threads = []
    # CPU threads
    for i in range(num_threads):
        t = threading.Thread(target=thread_burn, args=(duration_sec,), name=f"{name}-T{i}")
        t.start()
        threads.append(t)
    # Memory thread
    t = threading.Thread(target=memory_eater, args=(duration_sec, mem_mb), name=f"{name}-Mem")
    t.start()
    threads.append(t)
    for t in threads:
        t.join()


def log(msg):
    t = time.strftime("%H:%M:%S")
    print(f"[{t}] PID={os.getpid():<7} {msg}", flush=True)


def main():
    main_pid = os.getpid()
    num_workers = 10

    print("=" * 60)
    print("  STRESS TEST — M4 MacBook (12 cores)")
    print(f"  Main PID: {main_pid}")
    print("  Each process: 4 CPU threads + 200MB memory")
    print("=" * 60)
    print()

    # ═══════════════════════════════════════════
    # PHASE 1: 10 processes × 4 threads = 40 threads
    # ═══════════════════════════════════════════
    log("PHASE 1 — Launching 10 processes (CPU + Memory)")

    workers = []
    for i in range(num_workers):
        p = multiprocessing.Process(
            target=worker_cpu_and_memory,
            args=(40, f"StressWorker-{i}", 4, 800),
        )
        p.start()
        workers.append(p)
        log(f"  Started StressWorker-{i}  PID={p.pid}  (4 CPU threads + 200MB)")

    log(f"All {num_workers} workers running (40 CPU threads + 2GB memory). Holding...")
    print()

    for p in workers:
        p.join()

    log("PHASE 1 DONE — All workers exited.")
    print()

    # ═══════════════════════════════════════════
    # PHASE 2: Sequential — processes come and go
    # ═══════════════════════════════════════════
    log("PHASE 2 — Sequential processes (one at a time, 5s each)")

    seq_names = [
        "FileIndexer", "LogParser", "DataCompressor",
        "CacheRebuilder", "ReportGenerator", "Cleanup",
    ]

    for name in seq_names:
        p = multiprocessing.Process(
            target=worker_with_threads,
            args=(5, name, 3),
        )
        p.start()
        log(f"  [{name}] started  PID={p.pid}  (3 threads)")
        p.join()
        log(f"  [{name}] finished")

    print()
    print("=" * 60)
    print("  STRESS TEST COMPLETE")
    print("  Phase 1: 10 processes × (4 CPU threads + 200MB) × 40s")
    print("  Phase 2: 6 sequential processes × 3 threads × 5s")
    print("=" * 60)


if __name__ == "__main__":
    multiprocessing.set_start_method("fork")
    main()
