"""Factory for realtime providers."""

from __future__ import annotations

import logging
from datetime import datetime
from functools import lru_cache

from app.config import settings
from app.schemas.sessions import SessionConfig
from app.services.azure_realtime import AzureRealtimeProvider
from app.services.openai_realtime import OpenAIRealtimeProvider
from app.services.realtime_provider import RealtimeProvider

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_provider() -> RealtimeProvider:
    if settings.provider == "azure":
        logger.info("Using Azure OpenAI provider")
        return AzureRealtimeProvider()
    if settings.provider == "openai":
        logger.info("Using OpenAI provider")
        return OpenAIRealtimeProvider()
    logger.error("Unsupported provider configured: %s", settings.provider)
    raise ValueError(f"Unsupported provider: {settings.provider}")


async def mint_session(config: SessionConfig) -> tuple[str, datetime, str]:
    provider = get_provider()
    return await provider.mint_session(config)
