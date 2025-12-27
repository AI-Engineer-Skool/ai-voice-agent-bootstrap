"""OpenAI/Azure OpenAI-backed moderator engine for transcript analysis."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Union

from openai import AsyncAzureOpenAI, AsyncOpenAI

logger = logging.getLogger(__name__)

from app.config import settings
from app.schemas.moderator import (
    ChecklistKey,
    ModeratorGuidanceResponse,
    TranscriptSegment,
)
from app.services.prompt_builder import prompt_builder

GREETING_WORDS = {"hello", "hi", "hey", "welcome"}
RATING_WORDS = {"rate", "rating", "score"}
HIGHLIGHT_WORDS = {"positive", "highlight", "enjoy", "favourite", "favorite"}
PAIN_WORDS = {"pain", "frustration", "issue", "problem", "challenge"}
SUGGEST_WORDS = {"improve", "suggest", "next", "wish", "change"}
CLOSING_WORDS = {"thank", "appreciate", "summary", "summarise", "summarize"}
NEGATIVE_WORDS = {
    "angry",
    "annoyed",
    "frustrated",
    "bad",
    "terrible",
    "awful",
    "disappointed",
}
POSITIVE_WORDS = {"great", "good", "happy", "pleased", "love", "fantastic"}

CHECKLIST_LABELS: Dict[ChecklistKey, str] = {
    "greeting": "Greeting & consent",
    "rating": "Satisfaction rating",
    "highlight": "Highlight",
    "pain_point": "Pain point",
    "suggestion": "Suggestion",
    "closing": "Closing summary",
}

GUIDANCE_TEMPLATES: Dict[ChecklistKey, Dict[str, str]] = {
    "greeting": {
        "coach": "Open warmly and confirm they can stay for the short survey.",
        "prompt": "Hi there! Do you have a minute for a quick satisfaction survey with me?",
    },
    "rating": {
        "coach": "Guide them back to the rating so the survey stays measurable.",
        "prompt": "On a scale of 1 to 5, how satisfied are you overall right now?",
    },
    "highlight": {
        "coach": "Invite a specific positive moment before you explore pain points.",
        "prompt": "What has gone especially well recently that we should keep doing?",
    },
    "pain_point": {
        "coach": "Surface the main friction so we capture what is not working.",
        "prompt": "What has been frustrating or could be better about your recent experience?",
    },
    "suggestion": {
        "coach": "Collect a concrete next step we could act on.",
        "prompt": "What is one change we could make that would improve things for you?",
    },
    "closing": {
        "coach": "Summarise highlight, pain point, and suggestion, then thank them before ending.",
        "prompt": "Thanks for the insight. I will recap the highlight, pain point, and suggestion before we finish.",
    },
}


@dataclass(slots=True)
class ChecklistStatus:
    completed: List[ChecklistKey]
    missing: List[ChecklistKey]


class ModeratorEngine:
    def __init__(self) -> None:
        bundle = prompt_builder.load_prompts()
        self._checklist = bundle.checklist
        self._moderator_instructions = bundle.moderator
        self._checklist_markdown = bundle.checklist_text
        self._client: Union[AsyncOpenAI, AsyncAzureOpenAI, None] = None
        self._model: str | None = None

        # Initialize client based on provider
        if settings.provider == "openai" and settings.openai_api_key:
            self._client = AsyncOpenAI(api_key=settings.openai_api_key)
            self._model = settings.openai_moderator_model
        elif (
            settings.provider == "azure"
            and settings.azure_openai_endpoint
            and settings.azure_openai_key
            and settings.azure_openai_moderator_deployment
        ):
            self._client = AsyncAzureOpenAI(
                azure_endpoint=settings.azure_openai_endpoint,
                api_key=settings.azure_openai_key,
                api_version=settings.azure_openai_api_version,
            )
            self._model = settings.azure_openai_moderator_deployment

    async def analyse(
        self, transcript: Iterable[TranscriptSegment]
    ) -> ModeratorGuidanceResponse:
        segments = list(transcript)
        status = self._evaluate_checklist(segments)
        tone = self._measure_tone(segments)

        guidance = await self._generate_llm_guidance(status, tone, segments)

        return ModeratorGuidanceResponse(
            guidance_id=self._build_guidance_id(segments),
            guidance_text=guidance,
            missing_items=status.missing,
            tone_alert=tone,
            next_poll_seconds=None,
        )

    def _evaluate_checklist(self, segments: List[TranscriptSegment]) -> ChecklistStatus:
        completed: List[ChecklistKey] = []

        def mark(item: ChecklistKey, predicate: Callable[[], bool]) -> None:
            if predicate() and item not in completed:
                completed.append(item)

        lowered = [(seg.actor, seg.text.lower()) for seg in segments]

        mark(
            "greeting",
            lambda: any(
                actor == "agent" and any(word in text for word in GREETING_WORDS)
                for actor, text in lowered
            ),
        )

        mark(
            "rating",
            lambda: any(
                actor == "customer"
                and any(num in text for num in ["1", "2", "3", "4", "5"])
                for actor, text in lowered
            )
            or any(
                actor == "agent" and any(word in text for word in RATING_WORDS)
                for actor, text in lowered
            ),
        )

        mark(
            "highlight",
            lambda: any(
                word in text for _, text in lowered for word in HIGHLIGHT_WORDS
            ),
        )
        mark(
            "pain_point",
            lambda: any(word in text for _, text in lowered for word in PAIN_WORDS),
        )
        mark(
            "suggestion",
            lambda: any(word in text for _, text in lowered for word in SUGGEST_WORDS),
        )
        mark(
            "closing",
            lambda: any(
                actor == "agent" and any(word in text for word in CLOSING_WORDS)
                for actor, text in lowered
            ),
        )

        missing = [item for item in self._checklist if item not in completed]
        return ChecklistStatus(completed=completed, missing=missing)

    async def _generate_llm_guidance(
        self,
        status: ChecklistStatus,
        tone: str | None,
        segments: List[TranscriptSegment],
    ) -> str:
        if not self._client or not self._model:
            logger.error(
                "Moderator client not configured: client=%s, model=%s, provider=%s",
                "set" if self._client else "missing",
                self._model or "missing",
                settings.provider,
            )
            raise RuntimeError(
                "Moderator client is not configured; guidance cannot be generated. "
                "Check your OPENAI_API_KEY or Azure OpenAI credentials."
            )

        transcript_window = segments[-40:]
        transcript_text = "\n".join(
            f"{seg.timestamp} {seg.actor.upper()}: {seg.text}"
            for seg in transcript_window
        ).strip()
        if not transcript_text:
            transcript_text = "(no transcript yet)"

        completed_labels = [CHECKLIST_LABELS[item] for item in status.completed]
        missing_labels = [CHECKLIST_LABELS[item] for item in status.missing]
        priority_template = (
            GUIDANCE_TEMPLATES.get(status.missing[0]) if status.missing else None
        )

        status_lines = [
            f"Completed checklist items: {', '.join(completed_labels) if completed_labels else 'none yet'}",
            f"Missing checklist items: {', '.join(missing_labels) if missing_labels else 'all complete'}",
            f"Observed customer tone: {tone or 'neutral'}",
        ]

        if priority_template:
            status_lines.append(
                "Priority coaching focus: "
                f"Coach hint -> {priority_template['coach']} | Prompt idea -> {priority_template['prompt']}"
            )

        user_prompt = "\n\n".join(
            [
                "You receive the current survey transcript and checklist progress.",
                "Checklist reference:\n" + self._checklist_markdown,
                "Status summary:\n" + "\n".join(status_lines),
                "Transcript (most recent entries last):\n" + transcript_text,
            ]
        )

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": self._moderator_instructions},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_completion_tokens=900,
            )
        except Exception as exc:
            logger.error("Moderator LLM call failed: %s", exc)
            raise

        guidance = (response.choices[0].message.content or "").strip()
        return guidance

    def _measure_tone(self, segments: List[TranscriptSegment]):
        recent_customer_lines = [
            seg.text.lower() for seg in segments if seg.actor == "customer"
        ][-4:]
        if not recent_customer_lines:
            return None
        if any(
            word in line for line in recent_customer_lines for word in NEGATIVE_WORDS
        ):
            return "negative"
        if any(
            word in line for line in recent_customer_lines for word in POSITIVE_WORDS
        ):
            return "positive"
        return "neutral"

    def _build_guidance_id(self, segments: List[TranscriptSegment]) -> str:
        return f"guidance-{len(segments)}"


moderator_engine = ModeratorEngine()
