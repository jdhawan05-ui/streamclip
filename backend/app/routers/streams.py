from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid, asyncio

from app.models.database import MonitoredStream, User, get_db
from app.services.auth_service import get_current_user
from app.services.stream_manager import stream_manager

router = APIRouter(prefix="/streams", tags=["streams"])

class AddStreamBody(BaseModel):
    platform: str   # "twitch" or "youtube"
    channel: str    # twitch login name or youtube handle/@handle

class StreamOut(BaseModel):
    id: str
    platform: str
    channel_name: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    active: bool
    is_live: bool
    stream_title: Optional[str]
    viewer_count: Optional[int]
    hype_score: float
    last_checked_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True

@router.post("", response_model=StreamOut)
async def add_stream(
    body: AddStreamBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    platform = body.platform.lower()
    if platform not in ("twitch", "youtube"):
        raise HTTPException(status_code=400, detail="Platform must be 'twitch' or 'youtube'")

    channel = body.channel.lstrip("@").strip()

    # Duplicate check
    existing = await db.execute(
        select(MonitoredStream).where(
            MonitoredStream.user_id == user.id,
            MonitoredStream.platform == platform,
            MonitoredStream.channel_name == channel,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already monitoring this stream")

    # Resolve display name / avatar if possible
    display_name, avatar_url = await _resolve_channel_info(platform, channel)

    stream = MonitoredStream(
        id=str(uuid.uuid4()),
        user_id=user.id,
        platform=platform,
        channel_name=channel,
        display_name=display_name or channel,
        avatar_url=avatar_url,
    )
    db.add(stream)
    await db.commit()
    await db.refresh(stream)

    # Start monitoring
    asyncio.create_task(stream_manager.start_stream(stream.id))

    return _enrich(stream)

@router.get("", response_model=list[StreamOut])
async def list_streams(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MonitoredStream)
        .where(MonitoredStream.user_id == user.id)
        .order_by(MonitoredStream.created_at.desc())
    )
    streams = result.scalars().all()
    return [_enrich(s) for s in streams]

@router.delete("/{stream_id}")
async def remove_stream(
    stream_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MonitoredStream).where(
            MonitoredStream.id == stream_id,
            MonitoredStream.user_id == user.id,
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    await stream_manager.stop_stream(stream_id)
    await db.delete(stream)
    await db.commit()
    return {"ok": True}

@router.post("/{stream_id}/toggle")
async def toggle_stream(
    stream_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MonitoredStream).where(
            MonitoredStream.id == stream_id,
            MonitoredStream.user_id == user.id,
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")

    stream.active = not stream.active
    await db.commit()

    if stream.active:
        asyncio.create_task(stream_manager.start_stream(stream_id))
    else:
        await stream_manager.stop_stream(stream_id)

    return {"ok": True, "active": stream.active}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _enrich(s: MonitoredStream) -> dict:
    d = {
        "id": s.id, "platform": s.platform, "channel_name": s.channel_name,
        "display_name": s.display_name, "avatar_url": s.avatar_url,
        "active": s.active, "is_live": s.is_live or False,
        "stream_title": s.stream_title, "viewer_count": s.viewer_count,
        "hype_score": stream_manager.get_hype_score(s.id),
        "last_checked_at": s.last_checked_at, "created_at": s.created_at,
    }
    return d

async def _resolve_channel_info(platform: str, channel: str):
    """Try to get display name and avatar."""
    import httpx
    from app.config import settings
    try:
        if platform == "twitch" and settings.TWITCH_CLIENT_ID:
            # Need app token first
            async with httpx.AsyncClient() as client:
                tok = await client.post("https://id.twitch.tv/oauth2/token", params={"client_id": settings.TWITCH_CLIENT_ID, "client_secret": settings.TWITCH_CLIENT_SECRET, "grant_type": "client_credentials"})
                token = tok.json().get("access_token", "")
                resp = await client.get("https://api.twitch.tv/helix/users", params={"login": channel}, headers={"Client-ID": settings.TWITCH_CLIENT_ID, "Authorization": f"Bearer {token}"})
                data = resp.json().get("data", [])
                if data:
                    return data[0].get("display_name"), data[0].get("profile_image_url")
        elif platform == "youtube" and settings.YOUTUBE_API_KEY:
            async with httpx.AsyncClient() as client:
                resp = await client.get("https://www.googleapis.com/youtube/v3/channels", params={"part": "snippet", "forHandle": channel, "key": settings.YOUTUBE_API_KEY})
                items = resp.json().get("items", [])
                if items:
                    sn = items[0]["snippet"]
                    return sn.get("title"), sn.get("thumbnails", {}).get("default", {}).get("url")
    except Exception:
        pass
    return None, None
