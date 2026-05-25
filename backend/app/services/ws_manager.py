"""
WebSocket connection manager.
Allows broadcasting real-time events to a user's browser dashboard.
"""
import json
import logging
from typing import Dict
from fastapi import WebSocket

log = logging.getLogger(__name__)

class WSManager:
    def __init__(self):
        # user_id -> WebSocket
        self._connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[user_id] = ws
        log.info(f"WS connected: {user_id}")

    def disconnect(self, user_id: str):
        self._connections.pop(user_id, None)
        log.info(f"WS disconnected: {user_id}")

    async def send(self, user_id: str, event: str, data: dict):
        ws = self._connections.get(user_id)
        if ws:
            try:
                await ws.send_text(json.dumps({"event": event, "data": data}))
            except Exception as e:
                log.warning(f"WS send failed for {user_id}: {e}")
                self.disconnect(user_id)

    async def broadcast(self, event: str, data: dict):
        for uid in list(self._connections.keys()):
            await self.send(uid, event, data)

# Global singleton
ws_manager = WSManager()
