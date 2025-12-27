"""OpenAI realtime helper."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import aiohttp

logger = logging.getLogger(__name__)

from app.config import OPENAI_REALTIME_CLIENT_SECRETS_URL, settings
from app.schemas.sessions import SessionConfig


class OpenAIRealtimeProvider:
    """Provider for OpenAI's Realtime API (GA interface)."""

    async def mint_session(self, config: SessionConfig) -> tuple[str, datetime, str]:
        if not settings.openai_api_key:
            logger.error("OPENAI_API_KEY environment variable is not set")
            raise ValueError("OPENAI_API_KEY must be set for OpenAI provider")

        # Build the session configuration per OpenAI client_secrets API spec
        session = {
            "type": "realtime",
            "model": config.model,
            "instructions": config.instructions,
        }

        # Build audio config
        audio_config: dict = {
            "output": {
                "voice": config.voice,
            }
        }

        # Add turn detection if configured
        if config.turn_detection:
            audio_config["input"] = {
                "turn_detection": config.turn_detection,
            }

        # Add input transcription if configured
        if config.input_audio_transcription:
            if "input" not in audio_config:
                audio_config["input"] = {}
            audio_config["input"]["transcription"] = {
                "model": config.input_audio_transcription.get("model", "whisper-1")
            }

        if audio_config:
            session["audio"] = audio_config

        session_config = {
            "session": session,
        }

        logger.debug("OpenAI session config: %s", session_config)

        async with aiohttp.ClientSession() as client:
            async with client.post(
                OPENAI_REALTIME_CLIENT_SECRETS_URL,
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=session_config,
            ) as response:
                if response.status != 200:
                    text = await response.text()
                    logger.error(
                        "OpenAI session mint failed: %s %s", response.status, text
                    )
                    raise RuntimeError(
                        f"OpenAI session mint failed: {response.status} {text}"
                    )

                data = await response.json()

        # Extract the ephemeral key (client secret) from the response
        ephemeral_key = data.get("value")
        if not ephemeral_key:
            logger.error("OpenAI response missing 'value' field. Response: %s", data)
            raise RuntimeError("OpenAI response missing value")

        # Use expires_at from response, fallback to 60 seconds
        expires_ts = data.get("expires_at")
        if expires_ts:
            expires_at = datetime.fromtimestamp(expires_ts, tz=UTC)
        else:
            expires_at = datetime.now(UTC) + timedelta(seconds=60)
        webrtc_url = settings.get_webrtc_url()
        return ephemeral_key, expires_at, webrtc_url
