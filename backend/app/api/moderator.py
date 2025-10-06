"""Moderator guidance endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.schemas.moderator import ModeratorGuidanceRequest, ModeratorGuidanceResponse
from app.api.sessions import _sessions
from app.services.moderator_engine import moderator_engine

router = APIRouter()


@router.post("/guidance", response_model=ModeratorGuidanceResponse)
async def generate_guidance(payload: ModeratorGuidanceRequest) -> ModeratorGuidanceResponse:
    session_state = _sessions.get(payload.session_id)
    if not session_state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found")

    guidance = await moderator_engine.analyse(payload.transcript)
    return guidance
