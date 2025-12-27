"""Moderator guidance endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.schemas.moderator import ModeratorGuidanceRequest, ModeratorGuidanceResponse
from app.api.sessions import _sessions
from app.services.moderator_engine import moderator_engine

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/guidance", response_model=ModeratorGuidanceResponse)
async def generate_guidance(
    payload: ModeratorGuidanceRequest,
) -> ModeratorGuidanceResponse:
    # Session validation is soft - allows guidance to work after server hot-reload
    if payload.session_id and payload.session_id not in _sessions:
        logger.warning("Session %s not found (server may have restarted)", payload.session_id)

    guidance = await moderator_engine.analyse(payload.transcript)
    return guidance
