import type { ChecklistKey } from "../utils/surveyConfig";

export interface ModeratorTranscriptSegment {
  actor: "agent" | "customer";
  text: string;
  timestamp: string;
}

export interface ModeratorGuidanceResponse {
  guidance_id: string;
  guidance_text: string;
  missing_items: ChecklistKey[];
  tone_alert: "negative" | "neutral" | "positive" | null;
  next_poll_seconds?: number | null;
}
