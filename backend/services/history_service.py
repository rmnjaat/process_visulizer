from __future__ import annotations

from collections import deque

from backend.models.system import SystemSnapshot


class HistoryService:
    """Keeps a rolling buffer of system snapshots."""

    def __init__(self, buffer_size: int = 300) -> None:
        self._buffer: deque[SystemSnapshot] = deque(maxlen=buffer_size)

    def add(self, snapshot: SystemSnapshot) -> None:
        """Append a snapshot to the rolling buffer."""
        self._buffer.append(snapshot)

    def get_history(self) -> list[SystemSnapshot]:
        """Return all stored snapshots as a plain list."""
        return list(self._buffer)
