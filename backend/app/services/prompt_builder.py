"""Utilities for assembling prompts used by the teaching backend."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

from app.schemas.sessions import ChecklistKey, SessionConfig
from app.config import settings

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"


@dataclass(slots=True)
class PromptBundle:
    persona: str
    checklist_text: str
    moderator: str
    checklist: List[ChecklistKey]


class PromptBuilder:
    """Load markdown templates and build realtime instructions."""

    def __init__(self) -> None:
        self._bundle: PromptBundle | None = None

    def load_prompts(self) -> PromptBundle:
        if self._bundle is not None:
            return self._bundle

        persona_text = (
            (PROMPT_DIR / "agent_persona.md").read_text(encoding="utf-8").strip()
        )
        checklist_text = (
            (PROMPT_DIR / "survey_checklist.md").read_text(encoding="utf-8").strip()
        )
        moderator_text = (
            (PROMPT_DIR / "moderator_instructions.md")
            .read_text(encoding="utf-8")
            .strip()
        )

        appended_checklist = f"\n\n---\n{checklist_text}"
        persona = f"{persona_text}{appended_checklist}"
        moderator = f"{moderator_text}{appended_checklist}"

        checklist: List[ChecklistKey] = [
            "greeting",
            "rating",
            "highlight",
            "pain_point",
            "suggestion",
            "closing",
        ]

        self._bundle = PromptBundle(
            persona=persona,
            checklist_text=checklist_text,
            moderator=moderator,
            checklist=checklist,
        )
        return self._bundle

    def build_session_config(
        self, participant_name: str | None = None
    ) -> SessionConfig:
        bundle = self.load_prompts()
        conversation_goal = bundle.persona
        if participant_name:
            conversation_goal += (
                f"\n\nThe customer you are interviewing is named {participant_name}."
            )

        conversation_goal += (
            "\n\nKeep your questions aligned with the checklist. Summarise the highlight, pain point,"
            " and suggestion before closing with gratitude."
        )
        instructions = conversation_goal

        if settings.provider == "azure":
            turn_detection = {
                "type": "server_vad",
                "threshold": 0.9,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 1500,
                "create_response": False,
            }
        else:
            turn_detection = {
                "type": "semantic_vad",
                "create_response": False,
                "interrupt_response": True,
            }

        input_audio_transcription = {
            "model": "whisper-1",
        }

        return SessionConfig(
            model=settings.realtime_model,
            voice=settings.voice_name,
            provider=settings.provider,
            instructions=instructions,
            checklist=bundle.checklist,
            turn_detection=turn_detection,
            input_audio_transcription=input_audio_transcription,
            modalities=["text", "audio"],
        )


prompt_builder = PromptBuilder()
