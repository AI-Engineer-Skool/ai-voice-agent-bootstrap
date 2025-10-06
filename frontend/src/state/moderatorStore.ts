import { create } from "zustand";
import { ModeratorClient } from "../services/moderatorClient";
import type { TranscriptSegment } from "../types";
import type { ModeratorGuidanceResponse } from "../types";
import type { ChecklistKey } from "../utils/surveyConfig";
import type { WebRTCClient } from "../services/webrtcClient";
import { useSessionStore } from "./sessionStore";

interface ModeratorState {
  guidance?: ModeratorGuidanceResponse;
  isActive: boolean;
  start: (sessionId: string, transcriptGetter: () => TranscriptSegment[]) => void;
  stop: () => void;
  updateChecklist: (keys: ChecklistKey[]) => void;
}

let moderatorClient: ModeratorClient | null = null;
let lastDeliveredGuidanceId: string | null = null;
let pendingGuidance: ModeratorGuidanceResponse | null = null;
let deliveryTimer: number | null = null;
let attachedWebRTC: WebRTCClient | null = null;

const DELIVERY_RETRY_DELAY_MS = 400;

const realtimeEventListener = (event: any) => {
  if (!event || typeof event.type !== "string") {
    return;
  }

  switch (event.type) {
    case "input_audio_buffer.speech_stopped":
    case "conversation.item.input_audio_transcription.completed":
    case "response.audio_transcript.done":
    case "response.output_audio_transcript.done":
    case "response.completed":
    case "response.done":
    case "output_audio_buffer.stopped":
    case "response.output_audio_buffer.stopped":
    case "data_channel.open":
      scheduleDeliveryAttempt(150);
      break;
    default:
      break;
  }
};

function attachWebRTCListener() {
  const { webrtc } = useSessionStore.getState();
  if (!webrtc) {
    return;
  }
  if (attachedWebRTC === webrtc) {
    return;
  }
  detachWebRTCListener();
  attachedWebRTC = webrtc;
  attachedWebRTC.addEventListener(realtimeEventListener);
}

function detachWebRTCListener() {
  if (!attachedWebRTC) {
    return;
  }
  attachedWebRTC.removeEventListener(realtimeEventListener);
  attachedWebRTC = null;
}

function clearDeliveryTimer() {
  if (deliveryTimer !== null) {
    window.clearTimeout(deliveryTimer);
    deliveryTimer = null;
  }
}

function scheduleDeliveryAttempt(delayMs = DELIVERY_RETRY_DELAY_MS) {
  if (!pendingGuidance) {
    clearDeliveryTimer();
    return;
  }
  if (deliveryTimer !== null) {
    return;
  }
  const wait = Math.max(delayMs, 100);
  deliveryTimer = window.setTimeout(() => {
    deliveryTimer = null;
    attemptGuidanceDelivery();
  }, wait);
}

function attemptGuidanceDelivery() {
  if (!pendingGuidance) {
    return;
  }

  attachWebRTCListener();

  const { webrtc } = useSessionStore.getState();
  if (!webrtc) {
    scheduleDeliveryAttempt();
    return;
  }

  if (!webrtc.isDataChannelReady()) {
    scheduleDeliveryAttempt();
    return;
  }

  const userAudioActive = typeof webrtc.isUserAudioActive === "function" && webrtc.isUserAudioActive();
  if (userAudioActive) {
    scheduleDeliveryAttempt();
    return;
  }

  const agentAudioActive = typeof webrtc.isAgentAudioActive === "function" && webrtc.isAgentAudioActive();
  if (agentAudioActive) {
    scheduleDeliveryAttempt();
    return;
  }

  try {
    webrtc.sendModeratorInstruction(pendingGuidance.guidance_text);
    webrtc.triggerAgentTurn();
    lastDeliveredGuidanceId = pendingGuidance.guidance_id;
    pendingGuidance = null;
    clearDeliveryTimer();
  } catch (error) {
    console.warn("Failed to forward moderator guidance to agent", error);
    scheduleDeliveryAttempt();
  }
}

function queueGuidanceForDelivery(guidance: ModeratorGuidanceResponse) {
  if (guidance.guidance_id === lastDeliveredGuidanceId) {
    return;
  }

  const trimmed = guidance.guidance_text?.trim();
  if (!trimmed) {
    return;
  }

  pendingGuidance = { ...guidance, guidance_text: trimmed };
  clearDeliveryTimer();
  attachWebRTCListener();
  attemptGuidanceDelivery();
}

export const useModeratorStore = create<ModeratorState>((set) => ({
  isActive: false,

  start: (sessionId: string, transcriptGetter: () => TranscriptSegment[]) => {
    lastDeliveredGuidanceId = null;
    pendingGuidance = null;
    clearDeliveryTimer();
    if (moderatorClient) {
      moderatorClient.stop();
    }

    moderatorClient = new ModeratorClient((guidance) => {
      set({ guidance, isActive: true });
      useSessionStore.getState().setMissingChecklist(guidance.missing_items ?? []);
    });

    moderatorClient.start({
      sessionId,
      getTranscript: () =>
        transcriptGetter().map((segment) => ({
          actor: segment.actor,
          text: segment.text,
          timestamp: segment.timestamp,
        })),
      dispatchInstruction: async (guidance) => {
        queueGuidanceForDelivery(guidance);
      },
    });

    attachWebRTCListener();
    attemptGuidanceDelivery();

    set({ isActive: true });
  },

  stop: () => {
    moderatorClient?.stop();
    moderatorClient = null;
    lastDeliveredGuidanceId = null;
    pendingGuidance = null;
    clearDeliveryTimer();
    detachWebRTCListener();
    set({ isActive: false, guidance: undefined });
  },

  updateChecklist: (keys: ChecklistKey[]) => {
    useSessionStore.getState().setMissingChecklist(keys);
  },
}));
