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

        persona = (PROMPT_DIR / "agent_persona.md").read_text(encoding="utf-8").strip()
        checklist_text = (PROMPT_DIR / "survey_checklist.md").read_text(encoding="utf-8").strip()
        moderator = (PROMPT_DIR / "moderator_instructions.md").read_text(encoding="utf-8").strip()

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

    def build_session_config(self, participant_name: str | None = None) -> SessionConfig:
        bundle = self.load_prompts()
        conversation_goal = bundle.persona
        if participant_name:
            conversation_goal += f"\n\nThe customer you are interviewing is named {participant_name}."

        conversation_goal += (
            "\n\nKeep your questions aligned with the checklist. Summarise the highlight, pain point,"
            " and suggestion before closing with gratitude."
        )
        instructions = f"{conversation_goal}\n\nChecklist:\n{bundle.checklist_text}"

        return SessionConfig(
            model=settings.get_realtime_model(),
            voice=settings.voice_name,
            provider=settings.provider,
            instructions=instructions,
            checklist=bundle.checklist,
        )


prompt_builder = PromptBuilder()
