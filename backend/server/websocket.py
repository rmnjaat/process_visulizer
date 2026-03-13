"""WebSocket connection manager and endpoint."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


def _json_default(obj: Any) -> Any:
    """Fallback serializer for non-standard types."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts messages."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await ws.accept()
        self.active_connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        """Remove a WebSocket connection from the active list."""
        try:
            self.active_connections.remove(ws)
        except ValueError:
            pass

    async def broadcast(self, message: dict, default: Any = None) -> None:
        """Serialize *message* to JSON and send to all active connections.

        Dead connections are silently removed.
        """
        serializer = default or _json_default
        text = json.dumps(message, default=serializer)

        dead: list[WebSocket] = []
        for ws in self.active_connections:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)


async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time process data streaming."""
    snapshot_service = websocket.app.state.snapshot_service
    connection_manager: ConnectionManager = websocket.app.state.connection_manager

    await connection_manager.connect(websocket)

    try:
        # Send an initial full snapshot immediately.
        initial_data = await snapshot_service.collect_full_snapshot()
        text = json.dumps(initial_data, default=_json_default)
        await websocket.send_text(text)

        # Listen for client commands.
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Received non-JSON WebSocket message: %s", raw[:200])
                continue

            action = msg.get("action")

            if action == "subscribe_process":
                pid = msg.get("pid")
                if isinstance(pid, int):
                    snapshot_service.subscribe_pid(pid)
                    logger.info("Client subscribed to PID %d", pid)

            elif action == "unsubscribe_process":
                pid = msg.get("pid")
                if isinstance(pid, int):
                    snapshot_service.unsubscribe_pid(pid)
                    logger.info("Client unsubscribed from PID %d", pid)

            elif action == "set_interval":
                interval = msg.get("interval_ms")
                if isinstance(interval, (int, float)) and interval >= 100:
                    websocket.app.state.poll_interval_ms = int(interval)
                    logger.info("Broadcast interval set to %d ms", int(interval))

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception:
        logger.exception("Unexpected error in WebSocket endpoint")
    finally:
        connection_manager.disconnect(websocket)
