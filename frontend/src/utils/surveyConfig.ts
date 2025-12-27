export type ChecklistKey =
  | "greeting"
  | "rating"
  | "highlight"
  | "pain_point"
  | "suggestion"
  | "closing";

export const CHECKLIST_LABELS: Record<
  ChecklistKey,
  { title: string; description: string }
> = {
  greeting: {
    title: "Greeting & Consent",
    description: "Confirm the customer is ready for the brief survey.",
  },
  rating: {
    title: "Satisfaction Rating",
    description: "Record a 1–5 score for overall satisfaction.",
  },
  highlight: {
    title: "Highlight",
    description: "Capture a positive moment or benefit.",
  },
  pain_point: {
    title: "Pain Point",
    description: "Understand a frustration or blocker.",
  },
  suggestion: {
    title: "Suggestion",
    description: "Ask for improvements or next steps.",
  },
  closing: {
    title: "Closing Summary",
    description: "Thank them and recap highlight, pain point, and suggestion.",
  },
};

export const MAX_TRANSCRIPT_SEGMENTS = 40;
export const DISPLAY_TRANSCRIPT_SEGMENTS = 8;
