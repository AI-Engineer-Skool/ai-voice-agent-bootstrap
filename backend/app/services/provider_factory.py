"""Factory for realtime providers."""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache

from app.config import settings
from app.schemas.sessions import SessionConfig
from app.services.azure_realtime import AzureRealtimeProvider
from app.services.realtime_provider import RealtimeProvider


@lru_cache(maxsize=1)
def get_provider() -> RealtimeProvider:
    if settings.provider != "azure":
        raise ValueError(f"Unsupported provider: {settings.provider}")
    return AzureRealtimeProvider()


async def mint_session(config: SessionConfig) -> tuple[str, datetime, str]:
    provider = get_provider()
    return await provider.mint_session(config)
