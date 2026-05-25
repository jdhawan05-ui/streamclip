from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./streamclip.db"

    # Auth
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # APIs
    OPENAI_API_KEY: str = ""
    YOUTUBE_API_KEY: str = ""
    TWITCH_CLIENT_ID: str = ""
    TWITCH_CLIENT_SECRET: str = ""

    # Social posting
    TIKTOK_CLIENT_KEY: str = ""
    TIKTOK_CLIENT_SECRET: str = ""
    META_APP_ID: str = ""
    META_APP_SECRET: str = ""

    # S3 (for Instagram public URLs)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    S3_BUCKET: Optional[str] = None

    FRONTEND_URL: str = "http://localhost:3000"
    CLIPS_DIR: str = "./clips"

    # Hype detection thresholds
    CHAT_VELOCITY_MULTIPLIER: float = 3.0   # spike = N×  baseline
    AUDIO_ENERGY_THRESHOLD: float = -20.0   # dBFS above which = loud
    HYPE_COOLDOWN_SECONDS: int = 180        # min gap between clips
    ROLLING_BUFFER_SECONDS: int = 90        # how much stream to buffer
    CLIP_POST_SECONDS: int = 30             # seconds after detection to include
    MAX_CLIP_DURATION: int = 90             # hard cap

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
