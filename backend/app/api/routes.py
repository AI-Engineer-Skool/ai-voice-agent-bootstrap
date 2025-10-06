"""Top-level router composition."""

from fastapi import APIRouter

from . import health, moderator, sessions

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["Sessions"])
api_router.include_router(moderator.router, prefix="/moderator", tags=["Moderator"])
