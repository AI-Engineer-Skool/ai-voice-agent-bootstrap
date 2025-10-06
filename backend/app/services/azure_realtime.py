"""Azure OpenAI realtime helper."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import aiohttp

from app.config import settings
from app.schemas.sessions import SessionConfig


class AzureRealtimeProvider:
    async def mint_session(self, config: SessionConfig) -> tuple[str, datetime, str]:
        if not settings.azure_openai_endpoint or not settings.azure_openai_key:
            raise ValueError("Azure OpenAI credentials are missing")

        session_url = (
            settings.azure_openai_endpoint.rstrip("/")
            + "/openai/realtimeapi/sessions?api-version=2025-04-01-preview"
        )

        payload = {
            "model": config.model,
            "voice": config.voice,
            "instructions": config.instructions,
            "modalities": ["audio", "text"],
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
            },
        }

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
                    raise RuntimeError(f"Azure session mint failed: {response.status} {text}")

                data = await response.json()

        ephemeral_key = data.get("client_secret", {}).get("value")
        if not ephemeral_key:
            raise RuntimeError("Azure response missing client_secret.value")

        expires_at = datetime.now(UTC) + timedelta(seconds=60)
        webrtc_url = settings.get_webrtc_url()
        return ephemeral_key, expires_at, webrtc_url
