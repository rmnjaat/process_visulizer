"""FastAPI application factory with lifespan management."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import Settings
from backend.server.routes import router
from backend.server.websocket import ConnectionManager, websocket_endpoint
from backend.services.snapshot_service import SnapshotService

logger = logging.getLogger(__name__)


def _json_serializer(obj: Any) -> Any:
    """Handle types that are not natively JSON-serializable."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


async def broadcast_loop(app: FastAPI) -> None:
    """Continuously collect snapshots and broadcast to all WebSocket clients."""
    snapshot_service: SnapshotService = app.state.snapshot_service
    connection_manager: ConnectionManager = app.state.connection_manager

    while True:
        interval_ms: int = getattr(app.state, "poll_interval_ms", snapshot_service._settings.poll_interval_ms)
        await asyncio.sleep(interval_ms / 1000.0)

        if not connection_manager.active_connections:
            continue

        try:
            tick_data = await snapshot_service.collect_tick()
            await connection_manager.broadcast(tick_data, default=_json_serializer)
        except Exception:
            logger.exception("Error in broadcast loop tick")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage startup and shutdown of background services."""
    # Startup
    settings: Settings = app.state.settings
    app.state.snapshot_service = SnapshotService(settings)
    app.state.connection_manager = ConnectionManager()
    app.state.poll_interval_ms = settings.poll_interval_ms

    broadcast_task = asyncio.create_task(broadcast_loop(app))
    app.state.broadcast_task = broadcast_task

    logger.info("Process visualizer backend started on %s:%s", settings.host, settings.port)

    yield

    # Shutdown
    broadcast_task.cancel()
    try:
        await broadcast_task
    except asyncio.CancelledError:
        pass

    logger.info("Process visualizer backend shut down")


def create_app(settings: Settings) -> FastAPI:
    """Build and return the configured FastAPI application."""
    app = FastAPI(
        title="Process Visualizer",
        description="Real-time process monitoring backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Store settings so the lifespan can access them.
    app.state.settings = settings

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # REST routes
    app.include_router(router)

    # WebSocket route
    app.add_api_websocket_route("/ws", websocket_endpoint)

    return app
