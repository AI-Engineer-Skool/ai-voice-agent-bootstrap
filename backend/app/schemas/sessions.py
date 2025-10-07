"""Schemas for session endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ProviderName = Literal["azure"]
ChecklistKey = Literal["greeting", "rating", "highlight", "pain_point", "suggestion", "closing"]


class SessionCreateRequest(BaseModel):
    participant_name: Optional[str] = Field(default=None, alias="participant_name")


class SessionConfig(BaseModel):
    model: str
    voice: str
    provider: ProviderName
    instructions: str
    checklist: List[ChecklistKey]
    turn_detection: Optional[Dict[str, Any]] = None
    input_audio_transcription: Optional[Dict[str, Any]] = None
    modalities: List[str] = Field(default_factory=lambda: ["text", "audio"])


class SessionResponse(BaseModel):
    session_id: str
    conversation_token: str
    provider: ProviderName
    model: str
    webrtc_url: str
    ephemeral_key: str
    expires_at: datetime
    voice_name: str
    checklist: List[ChecklistKey]
