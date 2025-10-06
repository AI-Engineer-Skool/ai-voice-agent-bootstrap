"""Realtime provider interfaces."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from app.schemas.sessions import SessionConfig


class RealtimeProvider(Protocol):
    async def mint_session(self, config: SessionConfig) -> tuple[str, datetime, str]:
        """Return (ephemeral_key, expires_at, webrtc_url)."""
        raise NotImplementedError
