from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables with PV_ prefix."""

    poll_interval_ms: int = 1000
    history_buffer_size: int = 300
    host: str = "0.0.0.0"
    port: int = 8765
    collect_threads: bool = True
    max_processes: int = 1000

    model_config = {"env_prefix": "PV_"}
