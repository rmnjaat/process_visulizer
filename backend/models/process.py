from __future__ import annotations

from pydantic import BaseModel


class ProcessSnapshot(BaseModel):
    entity_type: str = "process"

    # Identity
    pid: int
    ppid: int
    name: str
    exe: str
    cmdline: str
    status: str
    username: str
    create_time: float

    # CPU
    cpu_percent: float
    cpu_time_user: float
    cpu_time_system: float
    cpu_time_children_user: float
    cpu_time_children_system: float
    cpu_time_iowait: float = 0.0

    # Memory
    memory_rss_bytes: int
    memory_vms_bytes: int
    memory_shared_bytes: int = 0
    memory_text_bytes: int = 0
    memory_data_bytes: int = 0
    memory_lib_bytes: int = 0
    memory_dirty_bytes: int = 0
    memory_percent: float
    memory_uss_bytes: int = 0
    memory_pss_bytes: int = 0

    # Threads
    num_threads: int

    # Scheduling
    nice: int

    # I/O
    io_read_count: int = 0
    io_write_count: int = 0
    io_read_bytes: int = 0
    io_write_bytes: int = 0

    # Context switches
    ctx_switches_voluntary: int
    ctx_switches_involuntary: int

    # FDs
    num_fds: int

    # Network
    num_connections: int

    # Files
    num_open_files: int
