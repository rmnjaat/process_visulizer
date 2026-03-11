from __future__ import annotations

from backend.config import Settings
from backend.collectors.system_collector import SystemCollector
from backend.collectors.process_collector import ProcessCollector
from backend.collectors.thread_collector import ThreadCollector
from backend.collectors.diff_engine import DiffEngine
from backend.services.history_service import HistoryService


class SnapshotService:
    """Orchestrates per-tick data collection and diff computation."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._system_collector = SystemCollector()
        self._process_collector = ProcessCollector()
        self._thread_collector = ThreadCollector()
        self._diff_engine = DiffEngine()
        self._history = HistoryService(buffer_size=settings.history_buffer_size)

        self._subscribed_pids: set[int] = set()
        self._tick_count: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def collect_tick(self) -> dict:
        """Collect one tick of system + process data.

        Returns a dict ready to be JSON-serialized and sent over WebSocket.

        * Tick 1 (``_tick_count == 0`` before increment): full snapshot of
          all processes.
        * Subsequent ticks: diff message containing only new / updated /
          exited processes.
        * System data is always included (it is a small, fixed-size payload).
        * Threads are collected only for subscribed PIDs.
        """
        self._tick_count += 1

        # --- System ---
        system_snapshot = self._system_collector.collect()
        self._history.add(system_snapshot)

        # --- Processes ---
        all_processes = self._process_collector.collect_all()

        # Respect max_processes cap.
        if len(all_processes) > self._settings.max_processes:
            all_processes.sort(key=lambda p: p.cpu_percent, reverse=True)
            all_processes = all_processes[: self._settings.max_processes]

        # --- Threads (only for subscribed PIDs) ---
        threads_by_pid: dict[int, list] = {}
        if self._settings.collect_threads and self._subscribed_pids:
            for pid in list(self._subscribed_pids):
                threads = self._thread_collector.collect_threads(pid)
                if threads:
                    threads_by_pid[pid] = threads

        # --- Build message ---
        system_data = system_snapshot.model_dump()

        if self._tick_count == 1:
            # First tick: send full snapshot and prime the diff engine
            # so that tick 2 has a proper baseline.
            self._diff_engine.compute_diff(all_processes)
            return {
                "type": "snapshot",
                "system": system_data,
                "processes": [p.model_dump() for p in all_processes],
                "threads": {
                    str(pid): [t.model_dump() for t in threads]
                    for pid, threads in threads_by_pid.items()
                },
            }

        # Subsequent ticks: send diff.
        diff = self._diff_engine.compute_diff(all_processes)
        return {
            "type": "diff",
            "system": system_data,
            "diff": diff.model_dump(),
            "threads": {
                str(pid): [t.model_dump() for t in threads]
                for pid, threads in threads_by_pid.items()
            },
        }

    async def collect_full_snapshot(self) -> dict:
        """Return a full snapshot (not a diff) for newly connected clients."""
        system_snapshot = self._system_collector.collect()
        all_processes = self._process_collector.collect_all()

        if len(all_processes) > self._settings.max_processes:
            all_processes.sort(key=lambda p: p.cpu_percent, reverse=True)
            all_processes = all_processes[: self._settings.max_processes]

        threads_by_pid: dict[int, list] = {}
        if self._settings.collect_threads and self._subscribed_pids:
            for pid in list(self._subscribed_pids):
                threads = self._thread_collector.collect_threads(pid)
                if threads:
                    threads_by_pid[pid] = threads

        return {
            "type": "snapshot",
            "system": system_snapshot.model_dump(),
            "processes": [p.model_dump() for p in all_processes],
            "threads": {
                str(pid): [t.model_dump() for t in threads]
                for pid, threads in threads_by_pid.items()
            },
        }

    def subscribe_pid(self, pid: int) -> None:
        """Start collecting threads for *pid*."""
        self._subscribed_pids.add(pid)

    def unsubscribe_pid(self, pid: int) -> None:
        """Stop collecting threads for *pid*."""
        self._subscribed_pids.discard(pid)
