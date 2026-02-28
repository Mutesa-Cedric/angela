"""WebSocket connection manager and event broadcasting."""

import json
import logging
from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.append(ws)
        log.info(f"WS connected ({len(self.connections)} total)")

    def disconnect(self, ws: WebSocket) -> None:
        self.connections.remove(ws)
        log.info(f"WS disconnected ({len(self.connections)} total)")

    async def broadcast(self, event: str, payload: dict) -> None:
        message = json.dumps({"event": event, "data": payload})
        dead: list[WebSocket] = []
        for ws in self.connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections.remove(ws)


manager = ConnectionManager()
