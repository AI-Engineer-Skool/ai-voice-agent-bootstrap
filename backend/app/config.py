"""Application configuration for the bootstrap backend."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["azure"]


class Settings(BaseSettings):
    """Runtime configuration loaded from the environment."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="AI Voice Agent Bootstrap API", alias="APP_NAME")
    app_version: str = Field(default="0.1.0", alias="APP_VERSION")

    provider: ProviderName = Field(default="azure", alias="PROVIDER")
    voice_name: str = Field(default="alloy", alias="VOICE_NAME")
    azure_openai_endpoint: str | None = Field(default=None, alias="AZURE_OPENAI_ENDPOINT")
    azure_openai_key: str | None = Field(default=None, alias="AZURE_OPENAI_KEY")
    azure_openai_api_version: str = Field(default="2024-05-01-preview", alias="AZURE_OPENAI_API_VERSION")
    azure_openai_moderator_deployment: str | None = Field(default=None, alias="AZURE_OPENAI_MODERATOR_DEPLOYMENT")

    realtime_model: str | None = Field(default=None, alias="REALTIME_MODEL")
    azure_openai_realtime_endpoint: str | None = Field(
        default=None, alias="AZURE_OPENAI_REALTIME_ENDPOINT"
    )

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"], alias="CORS_ORIGINS")

    def get_realtime_model(self) -> str:
        """Return the realtime model identifier for the configured provider."""
        if self.realtime_model:
            return self.realtime_model
        if self.provider != "azure":
            raise ValueError(f"Unsupported provider: {self.provider}")
        return "gpt-realtime"

    def get_webrtc_url(self) -> str:
        """Return the WebRTC gateway URL configured for realtime sessions."""
        if not self.azure_openai_realtime_endpoint:
            raise ValueError("AZURE_OPENAI_REALTIME_ENDPOINT must be set for realtime access")
        return self.azure_openai_realtime_endpoint


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance."""
    return Settings()


settings = get_settings()
