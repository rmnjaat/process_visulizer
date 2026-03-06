from __future__ import annotations

from typing import Any

import psutil

from backend.models.process import ProcessSnapshot


class ProcessCollector:
    """Collects per-process metrics using psutil."""

    def collect_all(self) -> list[ProcessSnapshot]:
        """Return snapshots for every accessible process."""
        results: list[ProcessSnapshot] = []
        for proc in psutil.process_iter():
            snap = self._collect_one(proc)
            if snap is not None:
                results.append(snap)
        return results

    def collect_one(self, pid: int) -> ProcessSnapshot | None:
        """Return a snapshot for a single PID, or None if inaccessible."""
        try:
            proc = psutil.Process(pid)
            return self._collect_one(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _safe(method: Any, default: Any = None) -> Any:
        """Call a psutil method that may raise AccessDenied or NoSuchProcess."""
        try:
            return method()
        except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess, AttributeError, OSError):
            return default

    def _collect_one(self, proc: psutil.Process) -> ProcessSnapshot | None:
        """Extract all fields from a single psutil.Process object."""
        try:
            with proc.oneshot():
                # Identity
                pid = proc.pid
                ppid = self._safe(proc.ppid, 0)
                name = self._safe(proc.name, "") or ""
                exe = self._safe(proc.exe, "") or ""
                cmdline_parts = self._safe(proc.cmdline, []) or []
                cmdline = " ".join(cmdline_parts)
                status = self._safe(proc.status, "unknown") or "unknown"
                username = self._safe(proc.username, "") or ""
                create_time = self._safe(proc.create_time, 0.0) or 0.0

                # CPU
                cpu_percent = self._safe(proc.cpu_percent, 0.0) or 0.0
                cpu_times = self._safe(proc.cpu_times)
                if cpu_times is not None:
                    cpu_time_user = cpu_times.user
                    cpu_time_system = cpu_times.system
                    cpu_time_children_user = getattr(cpu_times, "children_user", 0.0)
                    cpu_time_children_system = getattr(cpu_times, "children_system", 0.0)
                    cpu_time_iowait = getattr(cpu_times, "iowait", 0.0)
                else:
                    cpu_time_user = 0.0
                    cpu_time_system = 0.0
                    cpu_time_children_user = 0.0
                    cpu_time_children_system = 0.0
                    cpu_time_iowait = 0.0

                # Memory
                mem_info = self._safe(proc.memory_info)
                if mem_info is not None:
                    memory_rss_bytes = mem_info.rss
                    memory_vms_bytes = mem_info.vms
                    memory_shared_bytes = getattr(mem_info, "shared", 0)
                    memory_text_bytes = getattr(mem_info, "text", 0)
                    memory_data_bytes = getattr(mem_info, "data", 0)
                    memory_lib_bytes = getattr(mem_info, "lib", 0)
                    memory_dirty_bytes = getattr(mem_info, "dirty", 0)
                else:
                    memory_rss_bytes = 0
                    memory_vms_bytes = 0
                    memory_shared_bytes = 0
                    memory_text_bytes = 0
                    memory_data_bytes = 0
                    memory_lib_bytes = 0
                    memory_dirty_bytes = 0

                memory_percent = self._safe(proc.memory_percent, 0.0) or 0.0

                # Extended memory (USS / PSS) -- may require root on macOS
                mem_full = self._safe(proc.memory_full_info)
                if mem_full is not None:
                    memory_uss_bytes = getattr(mem_full, "uss", 0)
                    memory_pss_bytes = getattr(mem_full, "pss", 0)
                else:
                    memory_uss_bytes = 0
                    memory_pss_bytes = 0

                # Threads
                num_threads = self._safe(proc.num_threads, 0) or 0

                # Scheduling
                nice = self._safe(proc.nice, 0) or 0

                # I/O -- macOS does not have io_counters()
                io_method = getattr(proc, 'io_counters', None)
                io = self._safe(io_method) if io_method else None
                if io is not None:
                    io_read_count = io.read_count
                    io_write_count = io.write_count
                    io_read_bytes = io.read_bytes
                    io_write_bytes = io.write_bytes
                else:
                    io_read_count = 0
                    io_write_count = 0
                    io_read_bytes = 0
                    io_write_bytes = 0

                # Context switches
                ctx = self._safe(proc.num_ctx_switches)
                if ctx is not None:
                    ctx_vol = ctx.voluntary
                    ctx_invol = ctx.involuntary
                else:
                    ctx_vol = 0
                    ctx_invol = 0

                # FDs
                num_fds = self._safe(proc.num_fds, 0) or 0

                # Network
                connections = self._safe(proc.net_connections, []) or []
                num_connections = len(connections)

                # Open files
                open_files = self._safe(proc.open_files, []) or []
                num_open_files = len(open_files)

                return ProcessSnapshot(
                    pid=pid,
                    ppid=ppid,
                    name=name,
                    exe=exe,
                    cmdline=cmdline,
                    status=status,
                    username=username,
                    create_time=create_time,
                    cpu_percent=cpu_percent,
                    cpu_time_user=cpu_time_user,
                    cpu_time_system=cpu_time_system,
                    cpu_time_children_user=cpu_time_children_user,
                    cpu_time_children_system=cpu_time_children_system,
                    cpu_time_iowait=cpu_time_iowait,
                    memory_rss_bytes=memory_rss_bytes,
                    memory_vms_bytes=memory_vms_bytes,
                    memory_shared_bytes=memory_shared_bytes,
                    memory_text_bytes=memory_text_bytes,
                    memory_data_bytes=memory_data_bytes,
                    memory_lib_bytes=memory_lib_bytes,
                    memory_dirty_bytes=memory_dirty_bytes,
                    memory_percent=memory_percent,
                    memory_uss_bytes=memory_uss_bytes,
                    memory_pss_bytes=memory_pss_bytes,
                    num_threads=num_threads,
                    nice=nice,
                    io_read_count=io_read_count,
                    io_write_count=io_write_count,
                    io_read_bytes=io_read_bytes,
                    io_write_bytes=io_write_bytes,
                    ctx_switches_voluntary=ctx_vol,
                    ctx_switches_involuntary=ctx_invol,
                    num_fds=num_fds,
                    num_connections=num_connections,
                    num_open_files=num_open_files,
                )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, AttributeError, OSError):
            return None
