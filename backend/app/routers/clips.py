from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import asyncio, uuid, os

from app.models.database import Clip, Post, User, SocialAccount, get_db, AsyncSessionLocal
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/clips", tags=["clips"])

class ClipOut(BaseModel):
    id: str
    stream_id: str
    platform: str
    channel_name: str
    stream_title: Optional[str]
    hype_score: Optional[float]
    chat_velocity: Optional[float]
    audio_energy: Optional[float]
    trigger_reason: Optional[str]
    duration: Optional[float]
    status: str
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class PostOut(BaseModel):
    id: str
    platform: str
    status: str
    platform_post_id: Optional[str]
    posted_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True

@router.get("", response_model=list[ClipOut])
async def list_clips(
    stream_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Clip).where(Clip.user_id == user.id)
    if stream_id:
        q = q.where(Clip.stream_id == stream_id)
    if status:
        q = q.where(Clip.status == status)
    q = q.order_by(Clip.created_at.desc()).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()

@router.get("/{clip_id}", response_model=ClipOut)
async def get_clip(clip_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Clip).where(Clip.id == clip_id, Clip.user_id == user.id))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    return clip

@router.get("/{clip_id}/posts", response_model=list[PostOut])
async def get_posts(clip_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Post).where(Post.clip_id == clip_id, Post.user_id == user.id))
    return result.scalars().all()

@router.get("/{clip_id}/download")
async def download_clip(clip_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Clip).where(Clip.id == clip_id, Clip.user_id == user.id))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    if not clip.file_path or not os.path.exists(clip.file_path):
        raise HTTPException(status_code=404, detail="Clip file not ready")
    return FileResponse(clip.file_path, media_type="video/mp4", filename=f"streamclip_{clip.id[:8]}.mp4")

@router.post("/{clip_id}/repost")
async def repost_clip(clip_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Clip).where(Clip.id == clip_id, Clip.user_id == user.id))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    if not clip.file_path or not os.path.exists(clip.file_path):
        raise HTTPException(status_code=400, detail="Clip file not available")

    socials_r = await db.execute(
        select(SocialAccount).where(SocialAccount.user_id == user.id, SocialAccount.active == True)
    )
    accounts = socials_r.scalars().all()

    title = clip.stream_title or "Live Clip"
    caption = f"🔴 {title}\n\n#live #{clip.platform} #clips #viral"

    from app.services.social_poster import post_to_tiktok, post_to_instagram, post_to_youtube, get_public_url

    async def do_post_all():
        for acc in accounts:
            post_id = str(uuid.uuid4())
            async with AsyncSessionLocal() as s:
                post = Post(
                    id=post_id, clip_id=clip_id, social_account_id=acc.id,
                    user_id=user.id, platform=acc.platform, status="posting",
                )
                s.add(post)
                await s.commit()
            try:
                if acc.platform == "tiktok":
                    pid = await post_to_tiktok(acc.access_token, clip.file_path, title, caption)
                elif acc.platform == "instagram":
                    pub_url = await get_public_url(clip.file_path, acc.platform_user_id)
                    pid = await post_to_instagram(acc.access_token, acc.platform_user_id, pub_url, caption)
                elif acc.platform == "youtube":
                    pid = await post_to_youtube(acc.access_token, clip.file_path, title, caption)
                else:
                    continue
                async with AsyncSessionLocal() as s:
                    await s.execute(update(Post).where(Post.id == post_id).values(
                        status="posted", platform_post_id=pid, posted_at=datetime.utcnow()
                    ))
                    await s.commit()
            except Exception as e:
                async with AsyncSessionLocal() as s:
                    await s.execute(update(Post).where(Post.id == post_id).values(
                        status="failed", error_message=str(e)[:500]
                    ))
                    await s.commit()

    asyncio.create_task(do_post_all())
    return {"ok": True, "message": f"Reposting to {len(accounts)} platform(s)"}

@router.delete("/{clip_id}")
async def delete_clip(clip_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Clip).where(Clip.id == clip_id, Clip.user_id == user.id))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    # Delete file from disk
    if clip.file_path and os.path.exists(clip.file_path):
        try:
            os.remove(clip.file_path)
        except Exception:
            pass
    await db.delete(clip)
    await db.commit()
    return {"ok": True}
