"""Azure OpenAI realtime helper."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import aiohttp

from app.config import settings
from app.schemas.sessions import SessionConfig

logger = logging.getLogger(__name__)


class AzureRealtimeProvider:
    async def mint_session(self, config: SessionConfig) -> tuple[str, datetime, str]:
        if not settings.azure_openai_endpoint or not settings.azure_openai_key:
            logger.error(
                "Azure OpenAI credentials missing: endpoint=%s, key=%s",
                "set" if settings.azure_openai_endpoint else "missing",
                "set" if settings.azure_openai_key else "missing",
            )
            raise ValueError("Azure OpenAI credentials are missing")

        session_url = (
            settings.azure_openai_endpoint.rstrip("/")
            + f"/openai/realtimeapi/sessions?api-version={settings.azure_openai_api_version}"
        )

        payload = {
            "model": config.model,
            "voice": config.voice,
            "instructions": config.instructions,
            "modalities": config.modalities or ["audio", "text"],
        }

        if config.turn_detection:
            payload["turn_detection"] = config.turn_detection

        if config.input_audio_transcription:
            payload["input_audio_transcription"] = config.input_audio_transcription

        async with aiohttp.ClientSession() as client:
            async with client.post(
                session_url,
                headers={
                    "api-key": settings.azure_openai_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as response:
                if response.status != 200:
                    text = await response.text()
                    logger.error("Azure session mint failed: %s %s", response.status, text)
                    raise RuntimeError(
                        f"Azure session mint failed: {response.status} {text}"
                    )

                data = await response.json()

        ephemeral_key = data.get("client_secret", {}).get("value")
        if not ephemeral_key:
            logger.error("Azure response missing 'client_secret.value'. Response: %s", data)
            raise RuntimeError("Azure response missing client_secret.value")

        expires_at = datetime.now(UTC) + timedelta(seconds=60)
        webrtc_url = settings.get_webrtc_url()
        return ephemeral_key, expires_at, webrtc_url
