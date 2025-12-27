"""Application configuration for the bootstrap backend."""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

ProviderName = Literal["azure", "openai"]

# OpenAI API endpoints
OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
OPENAI_REALTIME_WEBRTC_URL = "https://api.openai.com/v1/realtime/calls"


class Settings(BaseSettings):
    """Runtime configuration loaded from the environment."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="AI Voice Agent Bootstrap API", alias="APP_NAME")
    app_version: str = Field(default="0.1.0", alias="APP_VERSION")

    provider: ProviderName = Field(default="openai", alias="PROVIDER")
    voice_name: str = "alloy"  # Hardcoded voice for simplicity

    # Azure OpenAI credentials
    azure_openai_endpoint: str | None = Field(
        default=None, alias="AZURE_OPENAI_ENDPOINT"
    )
    azure_openai_key: str | None = Field(default=None, alias="AZURE_OPENAI_KEY")
    azure_openai_api_version: str = Field(
        default="2025-04-01-preview", alias="AZURE_OPENAI_API_VERSION"
    )
    azure_openai_moderator_deployment: str | None = Field(
        default=None, alias="AZURE_OPENAI_MODERATOR_DEPLOYMENT"
    )
    azure_openai_realtime_endpoint: str | None = Field(
        default=None, alias="AZURE_OPENAI_REALTIME_ENDPOINT"
    )

    # OpenAI credentials
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_moderator_model: str = Field(
        default="gpt-5-chat-latest", alias="OPENAI_MODERATOR_MODEL"
    )

    # Hardcoded for simplicity
    realtime_model: str = "gpt-realtime"
    cors_origins: list[str] = ["http://localhost:5173"]

    def get_webrtc_url(self) -> str:
        """Return the WebRTC gateway URL configured for realtime sessions."""
        if self.provider == "openai":
            return OPENAI_REALTIME_WEBRTC_URL
        if not self.azure_openai_realtime_endpoint:
            logger.error(
                "AZURE_OPENAI_REALTIME_ENDPOINT not set but provider is 'azure'"
            )
            raise ValueError(
                "AZURE_OPENAI_REALTIME_ENDPOINT must be set for Azure provider"
            )
        return self.azure_openai_realtime_endpoint


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance."""
    return Settings()


settings = get_settings()
