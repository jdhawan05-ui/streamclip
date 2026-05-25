"""
Rolling-buffer stream recorder.

Strategy:
  1. Use streamlink to get the best HLS URL for Twitch/YouTube Live.
  2. Run FFmpeg to write a continuous stream of 5-second .ts segments.
  3. Maintain a deque of the last BUFFER_SECONDS worth of segments.
  4. On hype event:
       a. Lock the current deque snapshot (pre-event buffer).
       b. Keep recording for POST_SECONDS more.
       c. Concatenate all segments → re-encode to vertical 9:16 MP4 with captions.
"""
import asyncio
import logging
import os
import time
import subprocess
from collections import deque
from pathlib import Path
from typing import Callable, Awaitable, Optional
import numpy as np

from app.config import settings

log = logging.getLogger(__name__)

SEGMENT_DURATION = 5  # seconds per .ts segment
MAX_SEGMENTS = settings.ROLLING_BUFFER_SECONDS // SEGMENT_DURATION + 4  # small overhead

class StreamRecorder:
    def __init__(
        self,
        stream_id: str,
        platform: str,
        channel: str,
        work_dir: str,
        on_audio_energy: Callable[[float], None],
    ):
        self.stream_id = stream_id
        self.platform = platform
        self.channel = channel
        self.work_dir = work_dir
        self.on_audio_energy = on_audio_energy

        Path(work_dir).mkdir(parents=True, exist_ok=True)
        self.seg_dir = os.path.join(work_dir, "segments")
        Path(self.seg_dir).mkdir(exist_ok=True)

        self._segments: deque[str] = deque(maxlen=MAX_SEGMENTS)
        self._ffmpeg_proc: Optional[asyncio.subprocess.Process] = None
        self._seg_watcher_task: Optional[asyncio.Task] = None
        self._audio_task: Optional[asyncio.Task] = None
        self._running = False
        self._seg_index = 0
        self._last_known_seg: Optional[str] = None
        self._capturing_post_event = False

    # ── Public API ────────────────────────────────────────────────────────────

    async def start(self):
        """Get stream URL and start FFmpeg recording."""
        stream_url = await self._get_stream_url()
        if not stream_url:
            raise RuntimeError(f"Could not get stream URL for {self.platform}/{self.channel}")

        self._running = True
        await self._start_ffmpeg(stream_url)
        self._seg_watcher_task = asyncio.create_task(self._watch_segments())
        self._audio_task = asyncio.create_task(self._monitor_audio())
        log.info(f"[{self.stream_id}] Recording started")

    async def stop(self):
        self._running = False
        if self._ffmpeg_proc:
            try:
                self._ffmpeg_proc.terminate()
            except Exception:
                pass
        if self._seg_watcher_task:
            self._seg_watcher_task.cancel()
        if self._audio_task:
            self._audio_task.cancel()
        log.info(f"[{self.stream_id}] Recording stopped")

    async def capture_clip(self, post_seconds: int = settings.CLIP_POST_SECONDS) -> str:
        """
        Called on hype event. Waits post_seconds, then concatenates the buffer
        into a single clip file. Returns the output file path.
        """
        # Snapshot the current buffer
        pre_event_segs = list(self._segments)
        log.info(f"[{self.stream_id}] Clip capture: {len(pre_event_segs)} pre-event segments, waiting {post_seconds}s...")

        self._capturing_post_event = True
        post_segs_needed = (post_seconds // SEGMENT_DURATION) + 2
        post_collected: list[str] = []

        # Collect post-event segments
        deadline = time.time() + post_seconds + 10
        while len(post_collected) < post_segs_needed and time.time() < deadline:
            await asyncio.sleep(1)
            # New segments added since snapshot
            all_current = list(self._segments)
            new = [s for s in all_current if s not in pre_event_segs and s not in post_collected]
            post_collected.extend(new)

        self._capturing_post_event = False

        all_segs = pre_event_segs + post_collected
        # Keep only the last MAX_CLIP_DURATION // SEGMENT_DURATION segments
        max_segs = settings.MAX_CLIP_DURATION // SEGMENT_DURATION
        all_segs = all_segs[-max_segs:]

        if not all_segs:
            raise RuntimeError("No segments captured")

        out_path = os.path.join(self.work_dir, f"clip_{int(time.time())}.mp4")
        await self._concat_and_encode(all_segs, out_path)
        log.info(f"[{self.stream_id}] Clip saved: {out_path}")
        return out_path

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _get_stream_url(self) -> Optional[str]:
        """Use streamlink to get the best HLS URL."""
        if self.platform == "twitch":
            source = f"https://twitch.tv/{self.channel}"
        else:
            source = f"https://youtube.com/@{self.channel}/live"

        try:
            proc = await asyncio.create_subprocess_exec(
                "streamlink", "--stream-url", source, "best",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            url = stdout.decode().strip()
            if url and url.startswith("http"):
                return url
            # Try 720p fallback
            proc2 = await asyncio.create_subprocess_exec(
                "streamlink", "--stream-url", source, "720p,480p,360p,worst",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout2, _ = await asyncio.wait_for(proc2.communicate(), timeout=30)
            url2 = stdout2.decode().strip()
            return url2 if url2.startswith("http") else None
        except Exception as e:
            log.error(f"streamlink failed: {e}")
            return None

    async def _start_ffmpeg(self, stream_url: str):
        """Start FFmpeg to segment the stream into .ts files."""
        seg_pattern = os.path.join(self.seg_dir, "seg_%06d.ts")
        cmd = [
            "ffmpeg", "-y",
            "-i", stream_url,
            "-c:v", "copy",
            "-c:a", "aac",
            "-f", "segment",
            "-segment_time", str(SEGMENT_DURATION),
            "-segment_format", "mpegts",
            "-reset_timestamps", "1",
            "-strftime", "0",
            "-loglevel", "error",
            seg_pattern,
        ]
        self._ffmpeg_proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )

    async def _watch_segments(self):
        """Periodically scan for new .ts segments and add to the ring buffer."""
        known: set[str] = set()
        while self._running:
            try:
                files = sorted(Path(self.seg_dir).glob("seg_*.ts"))
                for f in files:
                    fpath = str(f)
                    if fpath not in known and f.stat().st_size > 0:
                        known.add(fpath)
                        self._segments.append(fpath)
                        log.debug(f"[{self.stream_id}] Segment: {f.name}")

                # Clean up old files not in deque to save disk
                current_set = set(self._segments)
                for fpath in list(known):
                    if fpath not in current_set:
                        try:
                            os.remove(fpath)
                        except Exception:
                            pass
                        known.discard(fpath)
            except Exception as e:
                log.warning(f"Segment watcher error: {e}")
            await asyncio.sleep(2)

    async def _monitor_audio(self):
        """Periodically sample audio energy from latest segment."""
        while self._running:
            await asyncio.sleep(5)
            try:
                if not self._segments:
                    continue
                latest = list(self._segments)[-1]
                db = await self._measure_audio_db(latest)
                self.on_audio_energy(db)
            except Exception as e:
                log.debug(f"Audio monitor error: {e}")

    async def _measure_audio_db(self, seg_path: str) -> float:
        """Use ffmpeg to measure mean audio loudness of a segment (dBFS)."""
        cmd = [
            "ffmpeg", "-i", seg_path,
            "-af", "volumedetect",
            "-vn", "-sn", "-dn",
            "-f", "null", "/dev/null",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        output = stderr.decode()
        for line in output.splitlines():
            if "mean_volume" in line:
                # e.g. "mean_volume: -18.2 dB"
                parts = line.split(":")
                if len(parts) >= 2:
                    return float(parts[-1].strip().split()[0])
        return -60.0

    async def _concat_and_encode(self, seg_paths: list[str], out_path: str):
        """Concatenate segments and re-encode to 9:16 vertical MP4."""
        # Write a concat list file
        concat_file = os.path.join(self.work_dir, "concat.txt")
        with open(concat_file, "w") as f:
            for seg in seg_paths:
                if os.path.exists(seg):
                    f.write(f"file '{seg}'\n")

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            # Vertical 9:16 for social media
            "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            "-loglevel", "error",
            out_path,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg encode failed: {stderr.decode()[-300:]}")
