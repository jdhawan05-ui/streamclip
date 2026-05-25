from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, Boolean, Integer, Float, DateTime, Text
from datetime import datetime
import uuid
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

def gen_id():
    return str(uuid.uuid4())

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id           = Column(String, primary_key=True, default=gen_id)
    email        = Column(String, unique=True, nullable=False, index=True)
    username     = Column(String, unique=True, nullable=False)
    hashed_pw    = Column(String, nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)

class MonitoredStream(Base):
    __tablename__ = "monitored_streams"
    id              = Column(String, primary_key=True, default=gen_id)
    user_id         = Column(String, nullable=False, index=True)
    platform        = Column(String, nullable=False)   # "twitch" | "youtube"
    channel_name    = Column(String, nullable=False)   # twitch: login name; youtube: channel id or handle
    display_name    = Column(String)
    avatar_url      = Column(String)
    active          = Column(Boolean, default=True)
    is_live         = Column(Boolean, default=False)
    stream_title    = Column(String)
    viewer_count    = Column(Integer)
    last_checked_at = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Clip(Base):
    __tablename__ = "clips"
    id            = Column(String, primary_key=True, default=gen_id)
    stream_id     = Column(String, nullable=False, index=True)
    user_id       = Column(String, nullable=False, index=True)
    platform      = Column(String, nullable=False)
    channel_name  = Column(String, nullable=False)
    stream_title  = Column(String)
    hype_score    = Column(Float)
    chat_velocity = Column(Float)   # msgs/sec at trigger
    audio_energy  = Column(Float)   # dBFS at trigger
    trigger_reason= Column(String)  # "chat" | "audio" | "both"
    duration      = Column(Float)
    file_path     = Column(String)
    s3_key        = Column(String)
    # pending | recording | processing | ready | posting | posted | failed
    status        = Column(String, default="pending")
    error_message = Column(Text)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Post(Base):
    __tablename__ = "posts"
    id               = Column(String, primary_key=True, default=gen_id)
    clip_id          = Column(String, nullable=False, index=True)
    social_account_id= Column(String, nullable=False)
    user_id          = Column(String, nullable=False, index=True)
    platform         = Column(String, nullable=False)
    platform_post_id = Column(String)
    status           = Column(String, default="pending")
    error_message    = Column(Text)
    posted_at        = Column(DateTime)
    created_at       = Column(DateTime, default=datetime.utcnow)

class SocialAccount(Base):
    __tablename__ = "social_accounts"
    id              = Column(String, primary_key=True, default=gen_id)
    user_id         = Column(String, nullable=False, index=True)
    platform        = Column(String, nullable=False)
    platform_user_id= Column(String, nullable=False)
    username        = Column(String)
    access_token    = Column(String, nullable=False)
    refresh_token   = Column(String)
    expires_at      = Column(DateTime)
    active          = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
