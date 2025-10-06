import type { ChecklistKey } from "../utils/surveyConfig";

export type ProviderName = "azure";

export interface SessionResponse {
  session_id: string;
  conversation_token: string;
  provider: ProviderName;
  model: string;
  webrtc_url: string;
  ephemeral_key: string;
  expires_at: string;
  voice_name: string;
  checklist: ChecklistKey[];
}

export interface SessionRequest {
  participant_name?: string;
}
