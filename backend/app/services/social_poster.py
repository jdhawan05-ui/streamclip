"""Post clips to TikTok, Instagram Reels, and YouTube Shorts."""
import asyncio
import os
import httpx
from app.config import settings

async def post_to_tiktok(access_token: str, video_path: str, title: str, description: str) -> str:
    file_size = os.path.getsize(video_path)
    async with httpx.AsyncClient(timeout=120) as client:
        init = await client.post(
            "https://open.tiktokapis.com/v2/post/publish/video/init/",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json; charset=UTF-8"},
            json={
                "post_info": {"title": title[:150], "privacy_level": "PUBLIC_TO_EVERYONE", "disable_duet": False, "disable_comment": False, "disable_stitch": False, "video_cover_timestamp_ms": 1000},
                "source_info": {"source": "FILE_UPLOAD", "video_size": file_size, "chunk_size": file_size, "total_chunk_count": 1},
            },
        )
        init_data = init.json()
        if init.status_code != 200:
            raise RuntimeError(f"TikTok init failed: {init_data}")
        upload_url = init_data["data"]["upload_url"]
        publish_id = init_data["data"]["publish_id"]
        with open(video_path, "rb") as f:
            video_bytes = f.read()
        await client.put(upload_url, content=video_bytes, headers={"Content-Type": "video/mp4", "Content-Range": f"bytes 0-{file_size-1}/{file_size}", "Content-Length": str(file_size)})
        for _ in range(20):
            await asyncio.sleep(5)
            status = await client.post("https://open.tiktokapis.com/v2/post/publish/status/fetch/", headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json; charset=UTF-8"}, json={"publish_id": publish_id})
            s = status.json().get("data", {}).get("status", "")
            if s == "PUBLISH_COMPLETE":
                return publish_id
            if s in ("FAILED", "CANCELLED"):
                raise RuntimeError(f"TikTok publish failed: {s}")
        return publish_id

async def post_to_instagram(access_token: str, ig_user_id: str, video_url: str, caption: str) -> str:
    async with httpx.AsyncClient(timeout=120) as client:
        create = await client.post(f"https://graph.facebook.com/v21.0/{ig_user_id}/media", params={"media_type": "REELS", "video_url": video_url, "caption": caption[:2200], "share_to_feed": "true", "access_token": access_token})
        data = create.json()
        if "error" in data:
            raise RuntimeError(f"Instagram create failed: {data['error']}")
        container_id = data["id"]
        for _ in range(30):
            await asyncio.sleep(5)
            status = await client.get(f"https://graph.facebook.com/v21.0/{container_id}", params={"fields": "status_code", "access_token": access_token})
            if status.json().get("status_code") == "FINISHED":
                break
            if status.json().get("status_code") == "ERROR":
                raise RuntimeError(f"Instagram processing failed")
        pub = await client.post(f"https://graph.facebook.com/v21.0/{ig_user_id}/media_publish", params={"creation_id": container_id, "access_token": access_token})
        pub_data = pub.json()
        if "error" in pub_data:
            raise RuntimeError(f"Instagram publish failed: {pub_data['error']}")
        return pub_data["id"]

async def post_to_youtube(access_token: str, video_path: str, title: str, description: str) -> str:
    file_size = os.path.getsize(video_path)
    async with httpx.AsyncClient(timeout=300) as client:
        init = await client.post(
            "https://www.googleapis.com/upload/youtube/v3/videos",
            params={"uploadType": "resumable", "part": "snippet,status"},
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(file_size)},
            json={"snippet": {"title": title[:100], "description": f"{description}\n\n#Shorts", "categoryId": "20"}, "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False}},
        )
        if init.status_code != 200:
            raise RuntimeError(f"YouTube upload init failed: {init.text}")
        upload_url = init.headers["Location"]
        with open(video_path, "rb") as f:
            video_bytes = f.read()
        up = await client.put(upload_url, content=video_bytes, headers={"Content-Type": "video/mp4", "Content-Length": str(file_size)})
        if up.status_code not in (200, 201):
            raise RuntimeError(f"YouTube upload failed: {up.text}")
        return up.json()["id"]

async def get_public_url(clip_path: str, identifier: str) -> str:
    if not settings.S3_BUCKET:
        raise RuntimeError("S3_BUCKET not configured — needed for Instagram public URL")
    import boto3
    s3 = boto3.client("s3", aws_access_key_id=settings.AWS_ACCESS_KEY_ID, aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY, region_name=settings.AWS_REGION)
    key = f"clips/{identifier}/{os.path.basename(clip_path)}"
    s3.upload_file(clip_path, settings.S3_BUCKET, key, ExtraArgs={"ACL": "public-read", "ContentType": "video/mp4"})
    return f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
