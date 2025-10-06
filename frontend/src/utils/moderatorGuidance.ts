export interface ParsedModeratorGuidance {
  checklist: string;
  coach: string;
  prompt: string;
}

export function parseModeratorGuidance(raw?: string | null): ParsedModeratorGuidance | null {
  if (!raw) {
    return null;
  }

  const match = raw.match(/<MODERATOR_GUIDANCE>([\s\S]*?)<\/MODERATOR_GUIDANCE>/);
  if (!match) {
    return null;
  }

  const lines = match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: Partial<ParsedModeratorGuidance> = {};

  for (const line of lines) {
    if (line.toLowerCase().startsWith("checklist:")) {
      parsed.checklist = line.slice("Checklist:".length).trim();
    } else if (line.toLowerCase().startsWith("coach:")) {
      parsed.coach = line.slice("Coach:".length).trim();
    } else if (line.toLowerCase().startsWith("prompt:")) {
      parsed.prompt = line.slice("Prompt:".length).trim();
    }
  }

  if (!parsed.checklist || !parsed.coach || !parsed.prompt) {
    return null;
  }

  return parsed as ParsedModeratorGuidance;
}
