import { MODERATOR_POLL_INTERVAL_S } from "../config";
import type { ModeratorGuidanceResponse, ModeratorTranscriptSegment } from "../types";
import { apiClient } from "./apiClient";

export interface ModeratorStartOptions {
  sessionId: string;
  getTranscript: () => ModeratorTranscriptSegment[];
  dispatchInstruction?: (guidance: ModeratorGuidanceResponse) => Promise<void> | void;
}

export class ModeratorClient {
  private timer: number | null = null;
  private running = false;
  private options: ModeratorStartOptions | null = null;

  constructor(private readonly onGuidance: (guidance: ModeratorGuidanceResponse) => void) {}

  start(options: ModeratorStartOptions) {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.options = options;
    this.running = true;
    const initialDelayMs = Math.max(MODERATOR_POLL_INTERVAL_S, 5) * 1000;
    this.scheduleNext(initialDelayMs);
  }

  stop() {
    this.running = false;
    this.options = null;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number) {
    if (!this.running) {
      return;
    }
    this.timer = window.setTimeout(() => this.cycle(), delayMs);
  }

  private async cycle() {
    if (!this.running || !this.options) {
      return;
    }

    const transcript = this.options.getTranscript();

    try {
      const response = await apiClient.post<ModeratorGuidanceResponse>("/api/moderator/guidance", {
        session_id: this.options.sessionId,
        transcript,
      });
      this.onGuidance(response);
      if (this.options.dispatchInstruction) {
        try {
          await this.options.dispatchInstruction(response);
        } catch (dispatchError) {
          console.warn("Moderator instruction dispatch failed", dispatchError);
        }
      }
      const nextInterval = Math.max(MODERATOR_POLL_INTERVAL_S, 5);
      this.scheduleNext(nextInterval * 1000);
    } catch (error) {
      console.warn("Moderator poll failed", error);
      this.scheduleNext(Math.max(MODERATOR_POLL_INTERVAL_S, 5) * 1000);
    }
  }
}
