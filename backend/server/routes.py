"""REST API routes for the process visualizer."""

from __future__ import annotations

import os

import psutil
from fastapi import APIRouter, HTTPException

from backend.collectors.system_collector import SystemCollector
from backend.collectors.process_collector import ProcessCollector
from backend.collectors.thread_collector import ThreadCollector
from backend.services.tree_service import TreeService

router = APIRouter(prefix="/api")


# ------------------------------------------------------------------ #
# Health
# ------------------------------------------------------------------ #


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "pid": os.getpid()}


# ------------------------------------------------------------------ #
# System
# ------------------------------------------------------------------ #


@router.get("/system")
async def system_snapshot() -> dict:
    collector = SystemCollector()
    snapshot = collector.collect()
    return snapshot.model_dump()


# ------------------------------------------------------------------ #
# Processes
# ------------------------------------------------------------------ #


@router.get("/processes")
async def list_processes() -> list[dict]:
    collector = ProcessCollector()
    processes = collector.collect_all()
    return [p.model_dump() for p in processes]


@router.get("/processes/{pid}")
async def get_process(pid: int) -> dict:
    collector = ProcessCollector()
    snapshot = collector.collect_one(pid)
    if snapshot is None:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")

    result = snapshot.model_dump()

    # Fetch additional expensive fields directly via psutil.
    try:
        proc = psutil.Process(pid)

        # Open files
        try:
            open_files = proc.open_files()
            result["open_files"] = [
                {"path": f.path, "fd": f.fd} for f in open_files
            ]
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            result["open_files"] = []

        # Network connections
        try:
            connections = proc.net_connections()
            conn_list = []
            for c in connections:
                local_addr = (
                    f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else ""
                )
                remote_addr = (
                    f"{c.raddr.ip}:{c.raddr.port}" if c.raddr else ""
                )
                conn_list.append(
                    {
                        "fd": c.fd,
                        "family": str(c.family),
                        "type": str(c.type),
                        "local_addr": local_addr,
                        "remote_addr": remote_addr,
                        "status": c.status,
                    }
                )
            result["connections"] = conn_list
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            result["connections"] = []

        # Environment variables
        try:
            result["environ"] = proc.environ()
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            result["environ"] = {}

        # Extended memory info (USS / PSS)
        try:
            mem_full = proc.memory_full_info()
            result["memory_uss_bytes"] = getattr(mem_full, "uss", 0)
            result["memory_pss_bytes"] = getattr(mem_full, "pss", 0)
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            pass  # Keep values from the snapshot

    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
    except psutil.AccessDenied:
        # Return what we have so far.
        pass

    return result


# ------------------------------------------------------------------ #
# Threads
# ------------------------------------------------------------------ #


@router.get("/processes/{pid}/threads")
async def get_threads(pid: int) -> list[dict]:
    collector = ThreadCollector()
    threads = collector.collect_threads(pid)
    return [t.model_dump() for t in threads]


# ------------------------------------------------------------------ #
# Process tree
# ------------------------------------------------------------------ #


@router.get("/tree")
async def process_tree() -> list[dict]:
    proc_collector = ProcessCollector()
    processes = proc_collector.collect_all()
    tree_service = TreeService()
    return tree_service.build_tree(processes)


@router.get("/tree/{pid}")
async def process_subtree(pid: int) -> dict:
    proc_collector = ProcessCollector()
    thread_collector = ThreadCollector()

    processes = proc_collector.collect_all()
    threads = thread_collector.collect_threads(pid)
    threads_by_pid: dict[int, list] = {}
    if threads:
        threads_by_pid[pid] = threads

    tree_service = TreeService()
    full_tree = tree_service.build_tree(processes, threads_by_pid)

    # Search the tree for the node matching the requested PID.
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
