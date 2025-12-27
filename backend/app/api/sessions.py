"""Realtime session endpoint."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.schemas.sessions import SessionCreateRequest, SessionResponse
from app.services.prompt_builder import prompt_builder
from app.services.provider_factory import mint_session

logger = logging.getLogger(__name__)

router = APIRouter()


class SessionState(Dict[str, object]): ...


_sessions: Dict[str, SessionState] = {}


@router.post("", response_model=SessionResponse)
async def create_session(
    payload: SessionCreateRequest | None = None,
) -> SessionResponse:
    config = prompt_builder.build_session_config(
        payload.participant_name if payload else None
    )
    try:
        ephemeral_key, expires_at, webrtc_url = await mint_session(config)
    except ValueError as exc:
        logger.error("Session creation failed (config error): %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error("Session creation failed (provider error): %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="realtime_session_failed",
        ) from exc

    session_id = str(uuid4())
    conversation_token = str(uuid4())

    _sessions[session_id] = {
        "session_id": session_id,
        "conversation_token": conversation_token,
        "created_at": datetime.utcnow(),
        "checklist": config.checklist,
    }

    return SessionResponse(
        session_id=session_id,
        conversation_token=conversation_token,
        provider=config.provider,
        model=config.model,
        webrtc_url=webrtc_url,
        ephemeral_key=ephemeral_key,
        expires_at=expires_at,
        voice_name=config.voice,
        checklist=config.checklist,
    )
