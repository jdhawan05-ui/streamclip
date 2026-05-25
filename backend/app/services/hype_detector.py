"""
Hype detection engine.

Combines two signals:
  1. Chat velocity — messages per second (rolling 10s window vs 60s baseline)
  2. Audio energy  — RMS loudness read from a shared state updated by the recorder

Fires a callback when both/either signal spikes past threshold.
Enforces a cooldown period so we don't generate back-to-back clips.
"""
import time
import logging
from collections import deque
from typing import Callable, Awaitable
from app.config import settings

log = logging.getLogger(__name__)

class HypeDetector:
    def __init__(self, stream_id: str, on_hype: Callable[[dict], Awaitable[None]]):
        self.stream_id = stream_id
        self.on_hype = on_hype

        # Chat tracking
        self._message_times: deque[float] = deque()   # timestamps of recent msgs

        # Audio tracking (updated externally by stream recorder)
        self._current_audio_db: float = -60.0

        # State
        self._last_hype_at: float = 0.0
        self._enabled: bool = True

    # ── Chat ──────────────────────────────────────────────────────────────────

    async def on_chat_message(self):
        """Call this for every chat message received."""
        now = time.time()
        self._message_times.append(now)
        # Trim to last 90 seconds
        cutoff = now - 90
        while self._message_times and self._message_times[0] < cutoff:
            self._message_times.popleft()

        await self._evaluate(now)

    def update_audio_energy(self, db: float):
        """Called by stream recorder with current audio RMS in dBFS."""
        self._current_audio_db = db

    # ── Scoring ───────────────────────────────────────────────────────────────

    def _chat_velocity_now(self) -> float:
        """Messages per second in last 10 seconds."""
        now = time.time()
        recent = sum(1 for t in self._message_times if t > now - 10)
        return recent / 10.0

    def _chat_baseline(self) -> float:
        """Messages per second over last 60 seconds (smoothed baseline)."""
        now = time.time()
        count = sum(1 for t in self._message_times if t > now - 60)
        return count / 60.0

    def _chat_score(self) -> float:
        """0–1 score. 1 = massive spike."""
        baseline = self._chat_baseline()
        velocity = self._chat_velocity_now()
        if baseline < 0.1:
            # Low-traffic chat: raw velocity matters
            return min(1.0, velocity / 2.0)
        ratio = velocity / baseline
        spike_threshold = settings.CHAT_VELOCITY_MULTIPLIER
        return min(1.0, max(0.0, (ratio - 1.0) / (spike_threshold - 1.0)))

    def _audio_score(self) -> float:
        """0–1 score based on audio energy."""
        db = self._current_audio_db
        threshold = settings.AUDIO_ENERGY_THRESHOLD
        # Treat -60 dB as silent (0), threshold dB as medium (0.5), 0 dBFS as loud (1.0)
        score = (db - (-60)) / (0 - (-60))
        return max(0.0, min(1.0, score))

    def hype_score(self) -> float:
        """Combined hype score 0–10."""
        chat = self._chat_score()
        audio = self._audio_score()
        combined = (chat * 0.65) + (audio * 0.35)
        return round(combined * 10, 2)

    # ── Evaluation ────────────────────────────────────────────────────────────

    async def _evaluate(self, now: float):
        if not self._enabled:
            return
        cooldown_ok = (now - self._last_hype_at) >= settings.HYPE_COOLDOWN_SECONDS
        if not cooldown_ok:
            return

        chat = self._chat_score()
        audio = self._audio_score()
        score = self.hype_score()

        # Trigger if either signal spikes hard, or both spike moderately
        triggered = (
            chat >= 0.75 or
            audio >= 0.75 or
            (chat >= 0.5 and audio >= 0.4)
        )

        if triggered:
            self._last_hype_at = now
            reason = (
                "both" if chat >= 0.5 and audio >= 0.4
                else "chat" if chat >= 0.75
                else "audio"
            )
            log.info(
                f"[{self.stream_id}] HYPE DETECTED! score={score} "
                f"chat={chat:.2f} audio={audio:.2f} reason={reason}"
            )
            await self.on_hype({
                "hype_score": score,
                "chat_velocity": round(self._chat_velocity_now(), 2),
                "audio_energy": round(self._current_audio_db, 1),
                "trigger_reason": reason,
            })

    def disable(self):
        self._enabled = False
