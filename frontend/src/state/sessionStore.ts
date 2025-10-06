import { create } from "zustand";
import { WebRTCClient } from "../services/webrtcClient";
import { TranscriptBuffer } from "../services/transcriptBuffer";
import { apiClient } from "../services/apiClient";
import type { SessionResponse, TranscriptSegment } from "../types";
import type { ChecklistKey } from "../utils/surveyConfig";

const BASELINE_CHECKLIST: ChecklistKey[] = [
  "greeting",
  "rating",
  "highlight",
  "pain_point",
  "suggestion",
  "closing",
];

interface SessionState {
  status: "idle" | "connecting" | "live" | "ended" | "error";
  session?: SessionResponse;
  webrtc?: WebRTCClient;
  transcript: TranscriptSegment[];
  recentTranscript: TranscriptSegment[];
  missingChecklist: ChecklistKey[];
  errorMessage: string | null;
  startSession: (mediaStream: MediaStream) => Promise<void>;
  finishSession: () => Promise<void>;
  setMissingChecklist: (keys: ChecklistKey[]) => void;
  appendTranscript: (segment: TranscriptSegment) => void;
}

const buffer = new TranscriptBuffer();

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "idle",
  transcript: [],
  recentTranscript: [],
  missingChecklist: BASELINE_CHECKLIST,
  errorMessage: null,

  startSession: async (mediaStream: MediaStream) => {
    if (get().status === "live" || get().status === "connecting") {
      return;
    }

    set({ status: "connecting", errorMessage: null });

    try {
      const session = await apiClient.post<SessionResponse>("/api/sessions", {});
      const client = new WebRTCClient();

      await client.connect({
        provider: session.provider,
        model: session.model,
        webrtcUrl: session.webrtc_url,
        ephemeralKey: session.ephemeral_key,
        voiceName: session.voice_name,
        mediaStream,
        onTranscript: (segment) => get().appendTranscript(segment),
        onConnectionStateChange: (state) => {
          if (state === "connected") {
            set({ status: "live" });
          }
        },
      });

      set({
        status: "live",
        session,
        webrtc: client,
        missingChecklist: session.checklist,
      });
    } catch (error) {
      console.error("Failed to start session", error);
      set({
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Failed to start session",
      });
    }
  },

  finishSession: async () => {
    const webrtc = get().webrtc;
    await webrtc?.disconnect();
    buffer.clear();
    set({
      status: "ended",
      session: undefined,
      webrtc: undefined,
      transcript: [],
      recentTranscript: [],
      missingChecklist: BASELINE_CHECKLIST,
    });
  },

  appendTranscript: (segment: TranscriptSegment) => {
    buffer.append(segment);
    set({ transcript: buffer.getAll(), recentTranscript: buffer.getRecent() });
  },

  setMissingChecklist: (keys: ChecklistKey[]) => {
    set({ missingChecklist: keys.length ? keys : [] });
  },
}));
