"""StreamClip — FastAPI backend entry point."""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models.database import init_db
from app.routers import auth, streams, clips, socials, stats, ws

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Initialising StreamClip...")
    await init_db()
    Path(settings.CLIPS_DIR).mkdir(parents=True, exist_ok=True)

    # Start monitoring all saved streams
    from app.services.stream_manager import stream_manager
    await stream_manager.start_all()
    log.info("Stream monitors started")

    yield

    log.info("Shutting down stream monitors...")
    from app.services.stream_manager import stream_manager
    await stream_manager.stop_all()

app = FastAPI(
    title="StreamClip API",
    description="Real-time live stream hype detection → auto clips → social posting",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(streams.router, prefix="/api")
app.include_router(clips.router, prefix="/api")
app.include_router(socials.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(ws.router)  # /ws at root

@app.get("/")
async def root():
    return {"status": "ok", "service": "StreamClip API v1.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
