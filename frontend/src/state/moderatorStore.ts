import { create } from "zustand";
import { MODERATOR_POLL_INTERVAL_S } from "../config";
import type { TranscriptSegment } from "../types";
import type { ModeratorGuidanceResponse } from "../types";
import type { ChecklistKey } from "../utils/surveyConfig";
import { useSessionStore } from "./sessionStore";
import { ModeratorOrchestrator } from "../services/moderatorOrchestrator";

interface ModeratorState {
  guidance?: ModeratorGuidanceResponse;
  isActive: boolean;
  start: (
    sessionId: string,
    transcriptGetter: () => TranscriptSegment[],
  ) => void;
  stop: () => void;
  updateChecklist: (keys: ChecklistKey[]) => void;
}

let orchestrator: ModeratorOrchestrator | null = null;

const MIN_POLL_SECONDS = 5;

export const useModeratorStore = create<ModeratorState>((set) => ({
  isActive: false,

  start: (sessionId: string, transcriptGetter: () => TranscriptSegment[]) => {
    const { webrtc } = useSessionStore.getState();
    if (!webrtc) {
      console.warn("Cannot start moderator without an active WebRTC client");
      return;
    }

    orchestrator?.destroy();

    const pollIntervalSeconds = Math.max(
      MODERATOR_POLL_INTERVAL_S,
      MIN_POLL_SECONDS,
    );

    orchestrator = new ModeratorOrchestrator({
      sessionId,
      getTranscript: () =>
        transcriptGetter().map((segment) => ({
          actor: segment.actor,
          text: segment.text,
          timestamp: segment.timestamp,
        })),
      webrtc,
      pollIntervalSeconds,
      onGuidance: (guidance) => {
        set({ guidance, isActive: true });
        useSessionStore
          .getState()
          .setMissingChecklist(guidance.missing_items ?? []);
      },
      onChecklistUpdate: (keys) => {
        useSessionStore.getState().setMissingChecklist(keys ?? []);
      },
    });

    orchestrator.start();
    set({ isActive: true });
  },

  stop: () => {
    orchestrator?.destroy();
    orchestrator = null;
    set({ isActive: false, guidance: undefined });
  },

  updateChecklist: (keys: ChecklistKey[]) => {
    useSessionStore.getState().setMissingChecklist(keys);
  },
}));
