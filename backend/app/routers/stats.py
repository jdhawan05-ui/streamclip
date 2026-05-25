from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.database import MonitoredStream, Clip, Post, SocialAccount, User, get_db
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/stats", tags=["stats"])

@router.get("")
async def get_stats(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    uid = user.id
    streams = await db.scalar(select(func.count()).where(MonitoredStream.user_id == uid, MonitoredStream.active == True))
    live = await db.scalar(select(func.count()).where(MonitoredStream.user_id == uid, MonitoredStream.is_live == True))
    total_clips = await db.scalar(select(func.count()).where(Clip.user_id == uid))
    posted = await db.scalar(select(func.count()).where(Clip.user_id == uid, Clip.status == "posted"))
    failed = await db.scalar(select(func.count()).where(Clip.user_id == uid, Clip.status == "failed"))
    processing = await db.scalar(select(func.count()).where(Clip.user_id == uid, Clip.status.notin_(["posted", "failed", "ready"])))
    total_posts = await db.scalar(select(func.count()).where(Post.user_id == uid, Post.status == "posted"))
    socials = await db.scalar(select(func.count()).where(SocialAccount.user_id == uid, SocialAccount.active == True))
    return {
        "streams": streams or 0,
        "live_streams": live or 0,
        "total_clips": total_clips or 0,
        "posted_clips": posted or 0,
        "failed_clips": failed or 0,
        "processing_clips": processing or 0,
        "total_posts": total_posts or 0,
        "connected_socials": socials or 0,
    }
