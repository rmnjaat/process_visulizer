from __future__ import annotations

import psutil

from backend.models.thread import ThreadSnapshot


class ThreadCollector:
    """Collects per-thread metrics for a given process (macOS only)."""

    def collect_threads(self, pid: int) -> list[ThreadSnapshot]:
        """Return thread snapshots for the given PID.

        On macOS, psutil.Process.threads() returns named tuples of
        (id, user_time, system_time). Thread names, states, core affinity,
        and context-switch counters are not available through psutil on
        macOS, so sensible defaults are used.
        """
        try:
            proc = psutil.Process(pid)
            raw_threads = proc.threads()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return []

        # Attempt to read the process-level nice value for all threads.
        try:
            proc_nice = proc.nice()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            proc_nice = 0

        results: list[ThreadSnapshot] = []
        for t in raw_threads:
            results.append(
                ThreadSnapshot(
                    tid=t.id,
                    pid=pid,
                    name=f"Thread-{t.id}",
                    state="unknown",
                    cpu_time_user=t.user_time,
                    cpu_time_system=t.system_time,
                    cpu_percent=0.0,
                    priority=0,
                    nice=proc_nice,
                    core_id=None,
                    voluntary_ctx_switches=0,
                    involuntary_ctx_switches=0,
                    stack_size_bytes=0,
                )
            )
        return results
