"""
YouTube Live stream monitor.

- Polls YouTube Data API for live chat messages.
- Uses liveChatMessages.list with pollingIntervalMillis pacing.
- Polls stream status every 60s.
"""
import asyncio
import logging
from typing import Callable, Awaitable, Optional
import httpx

from app.config import settings

log = logging.getLogger(__name__)
YT_API = "https://www.googleapis.com/youtube/v3"

class YouTubeMonitor:
    def __init__(
        self,
        channel: str,  # channel handle or ID
        on_chat_message: Callable[[], Awaitable[None]],
        on_stream_status: Callable[[bool, dict], Awaitable[None]],
    ):
        self.channel = channel
        self.on_chat_message = on_chat_message
        self.on_stream_status = on_stream_status
        self._running = False
        self._live_chat_id: Optional[str] = None
        self._video_id: Optional[str] = None
        self._chat_task: Optional[asyncio.Task] = None
        self._status_task: Optional[asyncio.Task] = None

    async def start(self):
        self._running = True
        self._status_task = asyncio.create_task(self._status_poll_loop())
        log.info(f"[youtube/{self.channel}] Monitor started")

    async def stop(self):
        self._running = False
        if self._chat_task:
            self._chat_task.cancel()
        if self._status_task:
            self._status_task.cancel()
        log.info(f"[youtube/{self.channel}] Monitor stopped")

    # ── Status polling ────────────────────────────────────────────────────────

    async def _status_poll_loop(self):
        while self._running:
            try:
                info = await self._get_live_stream_info()
                if info:
                    await self.on_stream_status(True, info)
                    if self._live_chat_id and not self._chat_task:
                        self._chat_task = asyncio.create_task(self._chat_poll_loop())
                else:
                    await self.on_stream_status(False, {})
                    if self._chat_task:
                        self._chat_task.cancel()
                        self._chat_task = None
                    self._live_chat_id = None
            except Exception as e:
                log.debug(f"[youtube/{self.channel}] Status error: {e}")
            await asyncio.sleep(60)

    async def _get_live_stream_info(self) -> Optional[dict]:
        if not settings.YOUTUBE_API_KEY:
            return None

        # Resolve channel handle → ID if needed
        channel_id = await self._resolve_channel_id()
        if not channel_id:
            return None

        async with httpx.AsyncClient() as client:
            # Search for live stream on channel
            resp = await client.get(f"{YT_API}/search", params={
                "part": "snippet",
                "channelId": channel_id,
                "eventType": "live",
                "type": "video",
                "key": settings.YOUTUBE_API_KEY,
            })
            items = resp.json().get("items", [])
            if not items:
                return None

            video_id = items[0]["id"]["videoId"]
            snippet = items[0]["snippet"]
            self._video_id = video_id

            # Get live chat ID
            vid_resp = await client.get(f"{YT_API}/videos", params={
                "part": "liveStreamingDetails,snippet,statistics",
                "id": video_id,
                "key": settings.YOUTUBE_API_KEY,
            })
            vid_items = vid_resp.json().get("items", [])
            if not vid_items:
                return None

            vid = vid_items[0]
            live_details = vid.get("liveStreamingDetails", {})
            self._live_chat_id = live_details.get("activeLiveChatId")
            stats = vid.get("statistics", {})

            return {
                "title": snippet.get("title"),
                "viewer_count": int(stats.get("viewCount", 0)),
                "video_id": video_id,
            }

    async def _resolve_channel_id(self) -> Optional[str]:
        handle = self.channel.lstrip("@")
        if handle.startswith("UC") and len(handle) == 24:
            return handle

        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{YT_API}/channels", params={
                "part": "id",
                "forHandle": handle,
                "key": settings.YOUTUBE_API_KEY,
            })
            items = resp.json().get("items", [])
            return items[0]["id"] if items else None

    # ── Chat polling ──────────────────────────────────────────────────────────

    async def _chat_poll_loop(self):
        page_token: Optional[str] = None
        poll_interval_ms = 5000  # start at 5 seconds, YouTube adjusts

        while self._running and self._live_chat_id:
            try:
                result = await self._fetch_chat_page(page_token)
                if not result:
                    await asyncio.sleep(poll_interval_ms / 1000)
                    continue

                messages = result.get("items", [])
                for _ in messages:
                    await self.on_chat_message()

                page_token = result.get("nextPageToken")
                poll_interval_ms = result.get("pollingIntervalMillis", 5000)

            except Exception as e:
                log.debug(f"[youtube/{self.channel}] Chat poll error: {e}")
                poll_interval_ms = 10000

            await asyncio.sleep(poll_interval_ms / 1000)

    async def _fetch_chat_page(self, page_token: Optional[str]) -> Optional[dict]:
        if not settings.YOUTUBE_API_KEY or not self._live_chat_id:
            return None

        params = {
            "part": "snippet",
            "liveChatId": self._live_chat_id,
            "key": settings.YOUTUBE_API_KEY,
        }
        if page_token:
            params["pageToken"] = page_token

        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{YT_API}/liveChat/messages", params=params)
            if resp.status_code != 200:
                return None
            return resp.json()
