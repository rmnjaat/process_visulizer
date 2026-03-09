from __future__ import annotations

from backend.models.process import ProcessSnapshot
from backend.models.messages import ProcessDiff

# Fields that change frequently between ticks and are worth tracking.
_VOLATILE_FIELDS: list[str] = [
    "cpu_percent",
    "memory_rss_bytes",
    "memory_vms_bytes",
    "memory_percent",
    "num_threads",
    "status",
    "cpu_time_user",
    "cpu_time_system",
    "io_read_bytes",
    "io_write_bytes",
    "io_read_count",
    "io_write_count",
    "ctx_switches_voluntary",
    "ctx_switches_involuntary",
    "num_connections",
    "num_open_files",
    "num_fds",
]


class DiffEngine:
    """Computes diffs between consecutive process snapshots."""

    def __init__(self) -> None:
        self._previous: dict[int, ProcessSnapshot] = {}

    def compute_diff(self, current: list[ProcessSnapshot]) -> ProcessDiff:
        """Compare *current* against the previous tick and return a diff.

        - ``new``: processes that appeared since the last tick.
        - ``updated``: processes still alive but with changed volatile fields
          (only the changed fields plus ``pid`` are included).
        - ``exited``: ``{"pid": ..., "name": ...}`` for processes that
          disappeared.

        After computing the diff the current list is stored as the baseline
        for the next call.
        """
        current_map: dict[int, ProcessSnapshot] = {p.pid: p for p in current}
        prev_pids = set(self._previous.keys())
        curr_pids = set(current_map.keys())

        # New processes
        new_pids = curr_pids - prev_pids
        new: list[ProcessSnapshot] = [current_map[pid] for pid in new_pids]

        # Exited processes
        exited_pids = prev_pids - curr_pids
        exited: list[dict] = [
            {"pid": pid, "name": self._previous[pid].name} for pid in exited_pids
        ]

        # Updated processes (only changed volatile fields)
        updated: list[dict] = []
        common_pids = curr_pids & prev_pids
        for pid in common_pids:
            cur = current_map[pid]
            prev = self._previous[pid]
            changes: dict = {}
            for field in _VOLATILE_FIELDS:
                cur_val = getattr(cur, field)
                prev_val = getattr(prev, field)
                if cur_val != prev_val:
                    changes[field] = cur_val
            if changes:
                changes["pid"] = pid
                updated.append(changes)

        # Store current as the next tick's baseline.
        self._previous = current_map

        return ProcessDiff(new=new, updated=updated, exited=exited)

    def reset(self) -> None:
        """Clear stored baseline so the next tick behaves like tick 1."""
        self._previous.clear()
