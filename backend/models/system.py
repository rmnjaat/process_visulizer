from __future__ import annotations

from pydantic import BaseModel


class CpuSnapshot(BaseModel):
    model_: str  # aliased from "model" to avoid Pydantic conflict
    physical_cores: int
    logical_cores: int
    frequency_mhz: float
    frequency_min_mhz: float
    frequency_max_mhz: float
    usage_per_core: list[float]
    total_usage: float

    class Config:
        populate_by_name = True


class MemorySnapshot(BaseModel):
    total_bytes: int
    available_bytes: int
    used_bytes: int
    free_bytes: int
    percent: float
    cached_bytes: int = 0
    buffers_bytes: int = 0
    shared_bytes: int = 0
    # macOS-specific breakdown (mirrors Activity Monitor)
    wired_bytes: int = 0
    compressed_bytes: int = 0
    app_memory_bytes: int = 0
    inactive_bytes: int = 0
    purgeable_bytes: int = 0
    swap_total_bytes: int
    swap_used_bytes: int
    swap_free_bytes: int
    swap_percent: float


class SystemSnapshot(BaseModel):
    hostname: str
    os: str
    uptime_seconds: int
    cpu: CpuSnapshot
    memory: MemorySnapshot
    load_average: list[float]
