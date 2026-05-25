"""
StreamManager — singleton that tracks all active stream monitors.

For each MonitoredStream in the DB:
  1. Creates a HypeDetector
  2. Creates a TwitchMonitor or YouTubeMonitor (for chat + status)
  3. Creates a StreamRecorder (for rolling buffer)
  4. On hype event → records clip → posts to socials → notifies UI via WebSocket
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict

from sqlalchemy import select, update

from app.config import settings
from app.models.database import AsyncSessionLocal, MonitoredStream, Clip, Post, SocialAccount
from app.services.hype_detector import HypeDetector
from app.services.stream_recorder import StreamRecorder
from app.services.twitch_monitor import TwitchMonitor
from app.services.youtube_monitor import YouTubeMonitor
from app.services.social_poster import (
    post_to_tiktok, post_to_instagram, post_to_youtube, get_public_url
)
from app.services.ws_manager import ws_manager

log = logging.getLogger(__name__)

class StreamSession:
    """All runtime state for one monitored stream."""
    def __init__(self, stream_id: str, user_id: str, platform: str, channel: str):
        self.stream_id = stream_id
        self.user_id = user_id
        self.platform = platform
        self.channel = channel
        self.work_dir = os.path.join(settings.CLIPS_DIR, user_id, stream_id)

        self.hype_detector: HypeDetector = None
        self.recorder: StreamRecorder = None
        self.chat_monitor = None  # TwitchMonitor or YouTubeMonitor
        self._hype_in_progress = False

class StreamManager:
    def __init__(self):
        self._sessions: Dict[str, StreamSession] = {}

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start_all(self):
        """Called at app startup — start monitoring all active streams."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MonitoredStream).where(MonitoredStream.active == True)
            )
            streams = result.scalars().all()

        for stream in streams:
            asyncio.create_task(self.start_stream(stream.id))

    async def start_stream(self, stream_id: str):
        """Start monitoring a single stream."""
        if stream_id in self._sessions:
            log.warning(f"[{stream_id}] Already monitoring")
            return

        async with AsyncSessionLocal() as db:
            stream = await db.get(MonitoredStream, stream_id)
            if not stream or not stream.active:
                return

        session = StreamSession(stream_id, stream.user_id, stream.platform, stream.channel_name)
        self._sessions[stream_id] = session
        Path(session.work_dir).mkdir(parents=True, exist_ok=True)

        log.info(f"[{stream_id}] Starting {stream.platform}/{stream.channel_name}")

        # Wire up hype detector
        async def on_hype(hype_data: dict):
            await self._handle_hype(session, hype_data)

        session.hype_detector = HypeDetector(stream_id, on_hype)

        # Wire up recorder
        session.recorder = StreamRecorder(
            stream_id=stream_id,
            platform=stream.platform,
            channel=stream.channel_name,
            work_dir=session.work_dir,
            on_audio_energy=session.hype_detector.update_audio_energy,
        )

        # Wire up chat monitor
        async def on_chat():
            if session.hype_detector:
                await session.hype_detector.on_chat_message()

        async def on_status(is_live: bool, info: dict):
            await self._handle_status_change(session, is_live, info)

        if stream.platform == "twitch":
            session.chat_monitor = TwitchMonitor(stream.channel_name, on_chat, on_status)
        else:
            session.chat_monitor = YouTubeMonitor(stream.channel_name, on_chat, on_status)

        try:
            await session.chat_monitor.start()
            await session.recorder.start()
            log.info(f"[{stream_id}] All monitors running")
        except Exception as e:
            log.error(f"[{stream_id}] Failed to start: {e}")
            await self.stop_stream(stream_id)

    async def stop_stream(self, stream_id: str):
        session = self._sessions.pop(stream_id, None)
        if not session:
            return
        if session.chat_monitor:
            await session.chat_monitor.stop()
        if session.recorder:
            await session.recorder.stop()
        if session.hype_detector:
            session.hype_detector.disable()
        log.info(f"[{stream_id}] Stopped")

    async def stop_all(self):
        for stream_id in list(self._sessions.keys()):
            await self.stop_stream(stream_id)

    # ── Hype handling ─────────────────────────────────────────────────────────

    async def _handle_hype(self, session: StreamSession, hype_data: dict):
        if session._hype_in_progress:
            log.debug(f"[{session.stream_id}] Hype already in progress, skipping")
            return
        session._hype_in_progress = True

        clip_id = str(uuid.uuid4())
        log.info(f"[{session.stream_id}] Handling hype → clip {clip_id}")

        # Notify dashboard
        await ws_manager.send(session.user_id, "hype_detected", {
            "stream_id": session.stream_id,
            "clip_id": clip_id,
            **hype_data,
        })

        # Get current stream info
        async with AsyncSessionLocal() as db:
            stream_row = await db.get(MonitoredStream, session.stream_id)
            stream_title = stream_row.stream_title if stream_row else "Live Stream"

        try:
            # Save clip record
            async with AsyncSessionLocal() as db:
                clip = Clip(
                    id=clip_id,
                    stream_id=session.stream_id,
                    user_id=session.user_id,
                    platform=session.platform,
                    channel_name=session.channel,
                    stream_title=stream_title,
                    hype_score=hype_data.get("hype_score"),
                    chat_velocity=hype_data.get("chat_velocity"),
                    audio_energy=hype_data.get("audio_energy"),
                    trigger_reason=hype_data.get("trigger_reason"),
                    status="recording",
                )
                db.add(clip)
                await db.commit()

            # Record clip
            file_path = await session.recorder.capture_clip()
            duration = _get_duration(file_path)

            async with AsyncSessionLocal() as db:
                await db.execute(update(Clip).where(Clip.id == clip_id).values(
                    file_path=file_path, duration=duration, status="ready"
                ))
                await db.commit()

            await ws_manager.send(session.user_id, "clip_ready", {
                "clip_id": clip_id, "stream_id": session.stream_id,
                "hype_score": hype_data.get("hype_score"), "duration": duration,
            })

            # Post to all connected social accounts
            await self._post_clip(session, clip_id, file_path, stream_title, hype_data)

        except Exception as e:
            log.error(f"[{session.stream_id}] Hype handling failed: {e}", exc_info=True)
            async with AsyncSessionLocal() as db:
                await db.execute(update(Clip).where(Clip.id == clip_id).values(
                    status="failed", error_message=str(e)[:500]
                ))
                await db.commit()
            await ws_manager.send(session.user_id, "clip_failed", {
                "clip_id": clip_id, "error": str(e)
            })
        finally:
            session._hype_in_progress = False

    async def _post_clip(self, session: StreamSession, clip_id: str, file_path: str, title: str, hype_data: dict):
        """Post the clip to all connected social accounts."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SocialAccount).where(
                    SocialAccount.user_id == session.user_id,
                    SocialAccount.active == True,
                )
            )
            accounts = result.scalars().all()

        description = f"🔴 LIVE moment from {session.channel}! #live #{session.platform} #clips #viral"
        caption = f"{title[:80]}\n\n{description}"

        for account in accounts:
            post_id = str(uuid.uuid4())
            async with AsyncSessionLocal() as db:
                post = Post(
                    id=post_id, clip_id=clip_id, social_account_id=account.id,
                    user_id=session.user_id, platform=account.platform, status="posting",
                )
                db.add(post)
                await db.commit()

            try:
                if account.platform == "tiktok":
                    pid = await post_to_tiktok(account.access_token, file_path, title, caption)
                elif account.platform == "instagram":
                    public_url = await get_public_url(file_path, account.platform_user_id)
                    pid = await post_to_instagram(account.access_token, account.platform_user_id, public_url, caption)
                elif account.platform == "youtube":
                    pid = await post_to_youtube(account.access_token, file_path, title, caption)
                else:
                    continue

                async with AsyncSessionLocal() as db:
                    await db.execute(update(Post).where(Post.id == post_id).values(
                        status="posted", platform_post_id=pid, posted_at=datetime.utcnow()
                    ))
                    await db.execute(update(Clip).where(Clip.id == clip_id).values(status="posted"))
                    await db.commit()

                await ws_manager.send(session.user_id, "clip_posted", {
                    "clip_id": clip_id, "platform": account.platform,
                    "username": account.username,
                })
                log.info(f"[{session.stream_id}] Posted to {account.platform} ✓")

            except Exception as e:
                log.error(f"[{session.stream_id}] Post to {account.platform} failed: {e}")
                async with AsyncSessionLocal() as db:
                    await db.execute(update(Post).where(Post.id == post_id).values(
                        status="failed", error_message=str(e)[:500]
                    ))
                    await db.commit()

    # ── Status changes ────────────────────────────────────────────────────────

    async def _handle_status_change(self, session: StreamSession, is_live: bool, info: dict):
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(MonitoredStream).where(MonitoredStream.id == session.stream_id).values(
                    is_live=is_live,
                    stream_title=info.get("title"),
                    viewer_count=info.get("viewer_count"),
                    last_checked_at=datetime.utcnow(),
                )
            )
            await db.commit()

        await ws_manager.send(session.user_id, "stream_status", {
            "stream_id": session.stream_id,
            "is_live": is_live,
            "title": info.get("title"),
            "viewer_count": info.get("viewer_count"),
        })

    def get_hype_score(self, stream_id: str) -> float:
        session = self._sessions.get(stream_id)
        if session and session.hype_detector:
            return session.hype_detector.hype_score()
        return 0.0

def _get_duration(file_path: str) -> float:
    import subprocess
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0

# Global singleton
stream_manager = StreamManager()
