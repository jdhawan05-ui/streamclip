"""
Twitch stream monitor.

- Connects to Twitch IRC anonymously (no OAuth needed for read).
- Counts chat messages to feed HypeDetector.
- Polls Twitch Helix API to check if stream is live + get viewer count/title.
"""
import asyncio
import logging
import re
import time
from typing import Callable, Awaitable, Optional
import httpx

from app.config import settings

log = logging.getLogger(__name__)

TWITCH_IRC_HOST = "irc.chat.twitch.tv"
TWITCH_IRC_PORT = 6667
# Anonymous nick (justinfan = read-only, no auth needed)
ANON_NICK = "justinfan88888"

class TwitchMonitor:
    def __init__(
        self,
        channel: str,
        on_chat_message: Callable[[], Awaitable[None]],
        on_stream_status: Callable[[bool, dict], Awaitable[None]],
    ):
        self.channel = channel.lower().lstrip("@")
        self.on_chat_message = on_chat_message
        self.on_stream_status = on_stream_status
        self._running = False
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._irc_task: Optional[asyncio.Task] = None
        self._poll_task: Optional[asyncio.Task] = None

    async def start(self):
        self._running = True
        self._irc_task = asyncio.create_task(self._irc_loop())
        self._poll_task = asyncio.create_task(self._status_poll_loop())
        log.info(f"[twitch/{self.channel}] Monitor started")

    async def stop(self):
        self._running = False
        if self._writer:
            try:
                self._writer.close()
            except Exception:
                pass
        if self._irc_task:
            self._irc_task.cancel()
        if self._poll_task:
            self._poll_task.cancel()
        log.info(f"[twitch/{self.channel}] Monitor stopped")

    # ── IRC loop ──────────────────────────────────────────────────────────────

    async def _irc_loop(self):
        while self._running:
            try:
                await self._connect_irc()
            except Exception as e:
                log.warning(f"[twitch/{self.channel}] IRC error: {e}, reconnecting in 10s")
                await asyncio.sleep(10)

    async def _connect_irc(self):
        log.info(f"[twitch/{self.channel}] Connecting to Twitch IRC...")
        self._reader, self._writer = await asyncio.open_connection(
            TWITCH_IRC_HOST, TWITCH_IRC_PORT
        )
        self._writer.write(f"NICK {ANON_NICK}\r\n".encode())
        self._writer.write(f"JOIN #{self.channel}\r\n".encode())
        await self._writer.drain()
        log.info(f"[twitch/{self.channel}] Joined IRC channel")

        while self._running:
            line = await asyncio.wait_for(self._reader.readline(), timeout=60)
            if not line:
                break
            decoded = line.decode("utf-8", errors="ignore").strip()

            # Respond to PING to stay connected
            if decoded.startswith("PING"):
                self._writer.write(b"PONG :tmi.twitch.tv\r\n")
                await self._writer.drain()
                continue

            # Count chat messages
            if "PRIVMSG" in decoded:
                await self.on_chat_message()

    # ── Helix API polling ─────────────────────────────────────────────────────

    async def _status_poll_loop(self):
        """Poll Twitch Helix API every 60s to check if stream is live."""
        token = await self._get_app_token()
        while self._running:
            try:
                info = await self._fetch_stream_info(token)
                is_live = info is not None
                await self.on_stream_status(is_live, info or {})
            except Exception as e:
                log.debug(f"[twitch/{self.channel}] Status poll error: {e}")
            await asyncio.sleep(60)

    async def _get_app_token(self) -> str:
        if not settings.TWITCH_CLIENT_ID:
            return ""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://id.twitch.tv/oauth2/token",
                params={
                    "client_id": settings.TWITCH_CLIENT_ID,
                    "client_secret": settings.TWITCH_CLIENT_SECRET,
                    "grant_type": "client_credentials",
                },
            )
            return resp.json().get("access_token", "")

    async def _fetch_stream_info(self, token: str) -> Optional[dict]:
        if not settings.TWITCH_CLIENT_ID or not token:
            return None
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.twitch.tv/helix/streams",
                params={"user_login": self.channel},
                headers={
                    "Client-ID": settings.TWITCH_CLIENT_ID,
                    "Authorization": f"Bearer {token}",
                },
            )
            data = resp.json().get("data", [])
            if not data:
                return None
            stream = data[0]
            return {
                "title": stream.get("title"),
                "viewer_count": stream.get("viewer_count", 0),
                "game": stream.get("game_name", ""),
            }
