import { apiClient } from "./apiClient";
import type { WebRTCClient } from "./webrtcClient";
import type { TranscriptSegment } from "../types";
import type { ChecklistKey } from "../utils/surveyConfig";
import type {
  ModeratorGuidanceResponse,
  ModeratorTranscriptSegment,
} from "../types/moderator";

interface ModeratorOrchestratorOptions {
  sessionId: string;
  getTranscript: () => TranscriptSegment[];
  webrtc: WebRTCClient;
  pollIntervalSeconds: number;
  onGuidance: (guidance: ModeratorGuidanceResponse) => void;
  onChecklistUpdate: (keys: ChecklistKey[]) => void;
}

const MAX_SEGMENTS = 400;
const DEFAULT_INTERVAL_MS = 5_000;
const POST_SPEECH_DELAY_MS = 250;
const DELIVERY_RETRY_DELAY_MS = 1_500;

export class ModeratorOrchestrator {
  private readonly sessionId: string;
  private readonly getTranscript: () => TranscriptSegment[];
  private readonly webrtc: WebRTCClient;
  private readonly intervalMs: number;
  private readonly onGuidance: (guidance: ModeratorGuidanceResponse) => void;
  private readonly onChecklistUpdate: (keys: ChecklistKey[]) => void;

  private destroyed = false;
  private running = false;
  private microphoneMuted = false;

  private timerId: number | null = null;
  private pendingRequest = false;

  private agentSpeaking = false;
  private userSpeaking = false;

  private latestGuidance: ModeratorGuidanceResponse | null = null;
  private pendingGuidance: ModeratorGuidanceResponse | null = null;
  private lastDeliveredGuidanceId: string | null = null;

  private turnCounter = 0;
  private activeTurnToken: number | null = null;
  private postSpeechTimer: number | null = null;
  private retryTimer: number | null = null;
  private retryTimerToken: number | null = null;

  private readonly handleRealtimeEvent = (event: any) => {
    if (!event || typeof event.type !== "string" || this.destroyed) {
      return;
    }

    switch (event.type) {
      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
      case "response.output_text.delta":
      case "output_audio_buffer.started":
      case "response.output_audio_buffer.started":
        this.agentSpeaking = true;
        this.clearRetryTimer();
        break;
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done":
      case "response.output_text.done":
      case "response.done":
      case "output_audio_buffer.stopped":
      case "response.output_audio_buffer.stopped":
        this.agentSpeaking = false;
        this.attemptAgentResponse();
        break;
      case "input_audio_buffer.speech_started":
        this.onUserSpeechStarted();
        break;
      case "input_audio_buffer.speech_stopped":
        this.onUserSpeechStopped();
        break;
      case "conversation.item.input_audio_transcription.completed":
        // Treat server transcription commit as end of a user turn
        this.onUserSpeechStopped();
        break;
      case "local_audio.mute_changed":
        this.onMicrophoneMuted(Boolean(event.muted));
        break;
      default:
        break;
    }
  };

  constructor(options: ModeratorOrchestratorOptions) {
    this.sessionId = options.sessionId;
    this.getTranscript = options.getTranscript;
    this.webrtc = options.webrtc;
    this.intervalMs = Math.max(
      Math.floor(options.pollIntervalSeconds * 1000),
      DEFAULT_INTERVAL_MS,
    );
    this.onGuidance = options.onGuidance;
    this.onChecklistUpdate = options.onChecklistUpdate;

    this.webrtc.addEventListener(this.handleRealtimeEvent);
    this.microphoneMuted = this.readMicrophoneMuted();
  }

  start() {
    if (this.running || this.destroyed) {
      return;
    }
    this.running = true;
    if (this.microphoneMuted) {
      return;
    }
    this.scheduleNext(1_500);
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.running = false;
    this.clearTimer();
    this.clearPostSpeechTimer();
    this.clearRetryTimer();
    this.webrtc.removeEventListener(this.handleRealtimeEvent);

    this.latestGuidance = null;
    this.pendingGuidance = null;
    this.microphoneMuted = false;
  }

  private scheduleNext(delayMs?: number) {
    if (!this.running || this.destroyed) {
      return;
    }

    if (this.microphoneMuted) {
      this.clearTimer();
      return;
    }

    this.clearTimer();
    const wait =
      typeof delayMs === "number" && delayMs >= 0 ? delayMs : this.intervalMs;
    this.timerId = window.setTimeout(() => {
      this.timerId = null;
      void this.runCycle();
    }, wait);
  }

  private clearTimer() {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private async runCycle() {
    if (this.destroyed || !this.running || this.pendingRequest) {
      return;
    }

    if (this.microphoneMuted) {
      this.scheduleNext();
      return;
    }

    const transcript = this.buildTranscriptPayload();
    if (transcript.length === 0) {
      this.scheduleNext();
      return;
    }

    this.pendingRequest = true;

    try {
      const guidance = await apiClient.post<ModeratorGuidanceResponse>(
        "/api/moderator/guidance",
        {
          session_id: this.sessionId,
          transcript,
        },
      );

      if (!guidance || !guidance.guidance_text) {
        this.scheduleNext();
        return;
      }

      this.latestGuidance = guidance;
      this.pendingGuidance = guidance;
      this.onGuidance(guidance);
      this.onChecklistUpdate(guidance.missing_items ?? []);
      this.attemptAgentResponse();

      const next =
        guidance.next_poll_seconds && guidance.next_poll_seconds > 0
          ? Math.floor(guidance.next_poll_seconds * 1000)
          : undefined;
      this.scheduleNext(next);
    } catch (error) {
      console.warn("Moderator guidance request failed", error);
      this.scheduleNext();
    } finally {
      this.pendingRequest = false;
    }
  }

  private onUserSpeechStarted() {
    this.userSpeaking = true;
    this.activeTurnToken = null;
    this.clearPostSpeechTimer();
    this.clearRetryTimer();
  }

  private onUserSpeechStopped() {
    this.userSpeaking = false;
    const token = ++this.turnCounter;
    this.activeTurnToken = token;
    this.schedulePostSpeechCheck(token);
  }

  private schedulePostSpeechCheck(turnToken: number) {
    this.clearPostSpeechTimer();
    this.postSpeechTimer = window.setTimeout(() => {
      this.postSpeechTimer = null;
      if (this.destroyed || this.activeTurnToken !== turnToken) {
        return;
      }
      this.attemptAgentResponse(turnToken);
    }, POST_SPEECH_DELAY_MS);
  }

  private attemptAgentResponse(turnToken?: number) {
    if (this.destroyed || !this.running) {
      return;
    }

    const activeToken = turnToken ?? this.activeTurnToken;
    if (activeToken === null) {
      return;
    }

    if (this.postSpeechTimer !== null) {
      return;
    }

    if (!this.webrtc.isDataChannelReady()) {
      this.scheduleRetry(activeToken);
      return;
    }

    if (this.webrtc.isUserAudioActive() || this.userSpeaking) {
      this.scheduleRetry(activeToken);
      return;
    }

    if (this.webrtc.isAgentAudioActive() || this.agentSpeaking) {
      this.scheduleRetry(activeToken);
      return;
    }

    if (
      this.pendingGuidance &&
      this.pendingGuidance.guidance_id !== this.lastDeliveredGuidanceId
    ) {
      this.deliverGuidance(activeToken, this.pendingGuidance);
      return;
    }

    this.triggerAgentResponse(activeToken);
  }

  private deliverGuidance(
    turnToken: number,
    guidance: ModeratorGuidanceResponse,
  ) {
    try {
      console.info("Forwarding moderator guidance to agent", {
        guidanceId: guidance.guidance_id,
        guidance: guidance.guidance_text,
      });
      this.webrtc.sendModeratorInstruction(guidance.guidance_text);
      this.webrtc.triggerAgentTurn();
      this.lastDeliveredGuidanceId = guidance.guidance_id;
      this.pendingGuidance = null;
      this.onTurnCompleted(turnToken);
    } catch (error) {
      console.warn("Failed to deliver moderator guidance", error);
      this.scheduleRetry(turnToken);
    }
  }

  private triggerAgentResponse(turnToken: number) {
    try {
      this.webrtc.triggerAgentTurn();
      this.onTurnCompleted(turnToken);
    } catch (error) {
      console.warn("Failed to trigger agent response", error);
      this.scheduleRetry(turnToken);
    }
  }

  private onTurnCompleted(turnToken: number) {
    if (this.activeTurnToken !== turnToken) {
      return;
    }
    this.activeTurnToken = null;
    this.clearRetryTimer();
    this.pendingGuidance = null;
  }

  private scheduleRetry(turnToken: number) {
    if (this.retryTimer !== null && this.retryTimerToken === turnToken) {
      return;
    }
    this.clearRetryTimer();
    this.retryTimerToken = turnToken;
    this.retryTimer = window.setTimeout(() => {
      if (this.retryTimerToken !== turnToken || this.destroyed) {
        return;
      }
      this.retryTimer = null;
      this.retryTimerToken = null;
      this.attemptAgentResponse(turnToken);
    }, DELIVERY_RETRY_DELAY_MS);
  }

  private clearPostSpeechTimer() {
    if (this.postSpeechTimer !== null) {
      window.clearTimeout(this.postSpeechTimer);
      this.postSpeechTimer = null;
    }
  }

  private clearRetryTimer() {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryTimerToken = null;
  }

  private onMicrophoneMuted(muted: boolean) {
    this.microphoneMuted = muted;
    if (muted) {
      this.clearTimer();
    } else if (this.running && !this.pendingRequest) {
      this.scheduleNext(250);
    }
  }

  private readMicrophoneMuted(): boolean {
    const candidate =
      (this.webrtc as any).isMicrophoneMuted || (this.webrtc as any).isMuted;
    if (typeof candidate === "function") {
      try {
        return Boolean(candidate.call(this.webrtc));
      } catch (error) {
        console.warn("[Moderator] Failed to read microphone mute state", error);
        return false;
      }
    }
    return false;
  }

  private buildTranscriptPayload(): ModeratorTranscriptSegment[] {
    const segments = this.getTranscript();
    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }
    const sliceStart = Math.max(0, segments.length - MAX_SEGMENTS);
    return segments.slice(sliceStart).map((segment) => ({
      actor: segment.actor,
      text: segment.text,
      timestamp:
        typeof segment.timestamp === "string"
          ? segment.timestamp
          : new Date(segment.timestamp).toISOString(),
    }));
  }
}
