"""Schemas for moderator guidance flow."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.sessions import ChecklistKey

Actor = Literal["agent", "customer"]
ToneLabel = Literal["negative", "neutral", "positive"]


class TranscriptSegment(BaseModel):
    actor: Actor
    text: str
    timestamp: str


class ModeratorGuidanceRequest(BaseModel):
    session_id: str = Field(..., alias="session_id")
    transcript: List[TranscriptSegment]


class ModeratorGuidanceResponse(BaseModel):
    guidance_id: str
    guidance_text: str
    missing_items: List[ChecklistKey]
    tone_alert: Optional[ToneLabel]
    next_poll_seconds: int | None = None


__all__ = [
    "ModeratorGuidanceRequest",
    "ModeratorGuidanceResponse",
    "TranscriptSegment",
    "ToneLabel",
]
