from __future__ import annotations

from pydantic import BaseModel


class ThreadSnapshot(BaseModel):
    entity_type: str = "thread"

    tid: int
    pid: int
    name: str
    state: str = "unknown"

    cpu_time_user: float
    cpu_time_system: float
    cpu_percent: float = 0.0

    priority: int = 0
    nice: int = 0
    core_id: int | None = None

    voluntary_ctx_switches: int = 0
    involuntary_ctx_switches: int = 0
    stack_size_bytes: int = 0
