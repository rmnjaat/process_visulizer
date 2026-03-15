from __future__ import annotations

import time

import psutil

from backend.models.thread import ThreadSnapshot


class ThreadCollector:
    """Collects per-thread metrics for a given process (macOS only).

    Tracks previous cpu times per thread to calculate real cpu_percent
    using the delta between two consecutive calls.
    """

    def __init__(self):
        # {(pid, tid): (user_time, system_time, timestamp)}
        self._prev: dict[tuple[int, int], tuple[float, float, float]] = {}

    def collect_threads(self, pid: int) -> list[ThreadSnapshot]:
        """Return thread snapshots for the given PID with calculated cpu_percent."""
        now = time.monotonic()

        try:
            proc = psutil.Process(pid)
            raw_threads = proc.threads()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return []

        try:
            proc_nice = proc.nice()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            proc_nice = 0

        results: list[ThreadSnapshot] = []
        seen_keys: set[tuple[int, int]] = set()

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

            results.append(
                ThreadSnapshot(
                    tid=t.id,
                    pid=pid,
                    name=f"Thread-{t.id}",
                    state="unknown",
                    cpu_time_user=t.user_time,
                    cpu_time_system=t.system_time,
                    cpu_percent=round(cpu_pct, 1),
                    priority=0,
                    nice=proc_nice,
                    core_id=None,
                    voluntary_ctx_switches=0,
                    involuntary_ctx_switches=0,
                    stack_size_bytes=0,
                )
            )

        # Clean up stale entries for threads that no longer exist
        stale = [k for k in self._prev if k[0] == pid and k not in seen_keys]
        for k in stale:
            del self._prev[k]

        return results
