from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid, httpx

from app.models.database import SocialAccount, User, get_db
from app.services.auth_service import get_current_user
from app.config import settings

router = APIRouter(prefix="/socials", tags=["socials"])

class SocialOut(BaseModel):
    id: str
    platform: str
    username: Optional[str]
    platform_user_id: str
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class ConnectManualBody(BaseModel):
    platform: str
    platform_user_id: str
    username: str
    access_token: str
    refresh_token: Optional[str] = None

@router.get("", response_model=list[SocialOut])
async def list_socials(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(SocialAccount).where(SocialAccount.user_id == user.id).order_by(SocialAccount.created_at)
    )
    return result.scalars().all()

@router.post("/connect/manual", response_model=SocialOut)
async def connect_manual(body: ConnectManualBody, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    existing = await db.execute(
        select(SocialAccount).where(SocialAccount.user_id == user.id, SocialAccount.platform == body.platform)
    )
    acc = existing.scalar_one_or_none()
    if acc:
        acc.access_token = body.access_token
        acc.refresh_token = body.refresh_token
        acc.username = body.username
        acc.platform_user_id = body.platform_user_id
        acc.active = True
        acc.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(acc)
        return acc

    acc = SocialAccount(
        id=str(uuid.uuid4()),
        user_id=user.id,
        platform=body.platform,
        platform_user_id=body.platform_user_id,
        username=body.username,
        access_token=body.access_token,
        refresh_token=body.refresh_token,
    )
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    return acc

@router.get("/tiktok/authorize")
async def tiktok_auth_url(user: User = Depends(get_current_user)):
    if not settings.TIKTOK_CLIENT_KEY:
        raise HTTPException(status_code=503, detail="TikTok integration not configured")
    from urllib.parse import urlencode
    params = urlencode({
        "client_key": settings.TIKTOK_CLIENT_KEY,
        "scope": "user.info.basic,video.publish,video.upload",
        "response_type": "code",
        "redirect_uri": f"{settings.FRONTEND_URL}/connect/tiktok/callback",
        "state": user.id,
    })
    return {"url": f"https://www.tiktok.com/v2/auth/authorize/?{params}"}

@router.get("/tiktok/callback")
async def tiktok_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            data={
                "client_key": settings.TIKTOK_CLIENT_KEY,
                "client_secret": settings.TIKTOK_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": f"{settings.FRONTEND_URL}/connect/tiktok/callback",
            },
        )
        token_data = resp.json()

    if "error" in token_data:
        raise HTTPException(status_code=400, detail=f"TikTok OAuth failed: {token_data.get('error_description', token_data['error'])}")

    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    open_id = token_data["open_id"]

    async with httpx.AsyncClient() as client:
        user_resp = await client.get(
            "https://open.tiktokapis.com/v2/user/info/",
            params={"fields": "display_name,username"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_data = user_resp.json().get("data", {}).get("user", {})

    username = user_data.get("display_name") or user_data.get("username", "TikTok User")
    user_id = state

    existing = await db.execute(
        select(SocialAccount).where(SocialAccount.user_id == user_id, SocialAccount.platform == "tiktok")
    )
    acc = existing.scalar_one_or_none()
    if acc:
        acc.access_token = access_token
        acc.refresh_token = refresh_token
        acc.username = username
        acc.platform_user_id = open_id
        acc.active = True
    else:
        acc = SocialAccount(
            id=str(uuid.uuid4()), user_id=user_id, platform="tiktok",
            platform_user_id=open_id, username=username,
            access_token=access_token, refresh_token=refresh_token,
        )
        db.add(acc)
    await db.commit()
    return {"ok": True, "username": username, "platform": "tiktok"}

@router.get("/instagram/authorize")
async def instagram_auth_url(user: User = Depends(get_current_user)):
    if not settings.META_APP_ID:
        raise HTTPException(status_code=503, detail="Instagram integration not configured")
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": settings.META_APP_ID,
        "redirect_uri": f"{settings.FRONTEND_URL}/connect/instagram/callback",
        "scope": "instagram_basic,instagram_content_publish,pages_read_engagement",
        "response_type": "code",
        "state": user.id,
    })
    return {"url": f"https://www.facebook.com/v21.0/dialog/oauth?{params}"}

@router.get("/instagram/callback")
async def instagram_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        token_resp = await client.get(
            "https://graph.facebook.com/v21.0/oauth/access_token",
            params={
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "redirect_uri": f"{settings.FRONTEND_URL}/connect/instagram/callback",
                "code": code,
            },
        )
        token_data = token_resp.json()

    if "error" in token_data:
        raise HTTPException(status_code=400, detail=f"Instagram OAuth failed: {token_data['error'].get('message', 'Unknown error')}")

    access_token = token_data["access_token"]
    user_id = state

    async with httpx.AsyncClient() as client:
        pages_resp = await client.get(
            "https://graph.facebook.com/v21.0/me/accounts",
            params={"access_token": access_token},
        )
        pages = pages_resp.json().get("data", [])

    if not pages:
        raise HTTPException(status_code=400, detail="No Facebook Pages found. You need a Business account linked to a Facebook Page.")

    page = pages[0]
    page_token = page["access_token"]

    async with httpx.AsyncClient() as client:
        ig_resp = await client.get(
            f"https://graph.facebook.com/v21.0/{page['id']}",
            params={"fields": "instagram_business_account", "access_token": page_token},
        )
        ig_data = ig_resp.json()

    ig_account = ig_data.get("instagram_business_account")
    if not ig_account:
        raise HTTPException(status_code=400, detail="No Instagram Business account linked to this Page.")

    ig_user_id = ig_account["id"]
    async with httpx.AsyncClient() as client:
        profile_resp = await client.get(
            f"https://graph.facebook.com/v21.0/{ig_user_id}",
            params={"fields": "username", "access_token": page_token},
        )
        username = profile_resp.json().get("username", "instagram_user")

    existing = await db.execute(
        select(SocialAccount).where(SocialAccount.user_id == user_id, SocialAccount.platform == "instagram")
    )
    acc = existing.scalar_one_or_none()
    if acc:
        acc.access_token = page_token
        acc.platform_user_id = ig_user_id
        acc.username = username
        acc.active = True
    else:
        acc = SocialAccount(
            id=str(uuid.uuid4()), user_id=user_id, platform="instagram",
            platform_user_id=ig_user_id, username=username, access_token=page_token,
        )
        db.add(acc)
    await db.commit()
    return {"ok": True, "username": username, "platform": "instagram"}

@router.delete("/{account_id}")
async def disconnect(account_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.user_id == user.id)
    )
    acc = result.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(acc)
    await db.commit()
    return {"ok": True}
