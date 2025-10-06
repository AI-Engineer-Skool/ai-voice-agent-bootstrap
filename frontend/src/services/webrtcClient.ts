/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ProviderName, TranscriptSegment } from "../types";

export interface WebRTCConnectConfig {
  provider: ProviderName;
  webrtcUrl: string;
  model: string;
  ephemeralKey: string;
  voiceName: string;
  mediaStream: MediaStream;
  onTranscript?: (segment: TranscriptSegment) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

interface RealtimeEventListener {
  (event: any): void;
}

export class WebRTCClient {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private remoteStream: MediaStream | null = null;
  private listeners = new Set<RealtimeEventListener>();
  private provider: ProviderName | null = null;
  private agentTranscriptParts: string[] = [];
  private agentTranscriptTimestamp: number | null = null;
  private agentTranscriptLastDelivered: string | null = null;
  private agentTranscriptLastDeliveredAt: number | null = null;
  private userTranscriptTimestamp: number | null = null;
  private agentAudioActive = false;
  private userAudioActive = false;

  addEventListener(listener: RealtimeEventListener) {
    this.listeners.add(listener);
  }

  removeEventListener(listener: RealtimeEventListener) {
    this.listeners.delete(listener);
  }

  private emit(event: any) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async connect(config: WebRTCConnectConfig): Promise<void> {
    if (this.pc) {
      await this.disconnect();
    }

    this.audioElement = new Audio();
    this.audioElement.autoplay = true;

    this.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    this.provider = config.provider;
    this.resetTranscriptState();

    this.pc.onconnectionstatechange = () => {
      config.onConnectionStateChange?.(this.pc!.connectionState);
    };

    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.remoteStream = stream;
        this.emit({ type: "remote_stream.update", stream });
        if (this.audioElement) {
          this.audioElement.srcObject = stream;
        }
      }
    };

    this.dataChannel = this.pc.createDataChannel("oai-events", { ordered: true });

    this.dataChannel.onmessage = (event) => this.handleDataChannelMessage(event.data, config.onTranscript);

    this.dataChannel.onopen = () => {
      this.emit({ type: "data_channel.open" });
      this.triggerAgentTurn();
    };

    for (const track of config.mediaStream.getTracks()) {
      this.pc.addTrack(track, config.mediaStream);
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const response = await fetch(`${config.webrtcUrl}?model=${encodeURIComponent(config.model)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        Authorization: `Bearer ${config.ephemeralKey}`,
      },
      body: offer.sdp ?? "",
    });

    if (!response.ok) {
      throw new Error(`Failed to create realtime session: ${response.status}`);
    }

    const answerSdp = await response.text();
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  sendModeratorInstruction(message: string) {
    if (!this.isDataChannelReady()) {
      throw new Error("Data channel not ready");
    }
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    const openTag = "<MODERATOR_GUIDANCE>";
    const closeTag = "</MODERATOR_GUIDANCE>";
    const tagged =
      trimmed.startsWith(openTag) && trimmed.endsWith(closeTag)
        ? trimmed
        : `${openTag}\n${trimmed}\n${closeTag}`;

    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: tagged,
          },
        ],
      },
    };

    this.dataChannel!.send(JSON.stringify(event));
  }

  triggerAgentTurn() {
    if (!this.isDataChannelReady()) {
      return;
    }

    const event: Record<string, unknown> = { type: "response.create" };
    if (this.provider === "azure") {
      event.response = { modalities: ["text", "audio"] };
    }

    this.dataChannel!.send(JSON.stringify(event));
  }

  isDataChannelReady(): boolean {
    return !!this.dataChannel && this.dataChannel.readyState === "open";
  }

  isAgentAudioActive(): boolean {
    return this.agentAudioActive;
  }

  isUserAudioActive(): boolean {
    return this.userAudioActive;
  }

  async disconnect(): Promise<void> {
    this.dataChannel?.close();
    this.pc?.close();
    this.dataChannel = null;
    this.pc = null;
    this.provider = null;
    this.resetTranscriptState();
    if (this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }
    if (this.remoteStream) {
      this.emit({ type: "remote_stream.ended" });
    }
    this.remoteStream = null;
  }

  private resetTranscriptState() {
    this.agentTranscriptParts = [];
    this.agentTranscriptTimestamp = null;
    this.agentTranscriptLastDelivered = null;
    this.agentTranscriptLastDeliveredAt = null;
    this.userTranscriptTimestamp = null;
    this.agentAudioActive = false;
    this.userAudioActive = false;
  }

  private appendAgentTranscript(delta: string) {
    if (typeof delta !== "string" || !delta) {
      return;
    }
    if (this.agentTranscriptParts.length === 0) {
      this.agentTranscriptTimestamp = Date.now();
      this.agentTranscriptLastDelivered = null;
      this.agentTranscriptLastDeliveredAt = null;
    }
    this.agentTranscriptParts.push(delta);
  }

  private flushAgentTranscript(
    onTranscript?: (segment: TranscriptSegment) => void,
    finalText?: string
  ) {
    const buffered = this.agentTranscriptParts.join("");
    const textSource = finalText ?? buffered;
    const text = textSource.trim();
    const timestampMs = this.agentTranscriptTimestamp ?? Date.now();
    this.agentTranscriptParts = [];
    this.agentTranscriptTimestamp = null;

    if (!text) {
      return;
    }

    const now = Date.now();
    if (
      this.agentTranscriptLastDelivered === text &&
      this.agentTranscriptLastDeliveredAt !== null &&
      now - this.agentTranscriptLastDeliveredAt < 500
    ) {
      return;
    }

    this.agentTranscriptLastDelivered = text;
    this.agentTranscriptLastDeliveredAt = now;

    if (!onTranscript) {
      return;
    }

    onTranscript({
      actor: "agent",
      text,
      timestamp: new Date(timestampMs).toISOString(),
    });
  }

  private markUserSpeechStart() {
    this.userTranscriptTimestamp = Date.now();
  }

  private flushUserTranscript(
    onTranscript?: (segment: TranscriptSegment) => void,
    transcript?: string
  ) {
    const text = (transcript ?? "").trim();
    const timestampMs = this.userTranscriptTimestamp ?? Date.now();
    this.userTranscriptTimestamp = null;

    if (!text || !onTranscript) {
      return;
    }

    onTranscript({
      actor: "customer",
      text,
      timestamp: new Date(timestampMs).toISOString(),
    });
  }

  private handleDataChannelMessage(raw: string, onTranscript?: (segment: TranscriptSegment) => void) {
    try {
      const event = JSON.parse(raw);
      this.emit(event);

      switch (event.type) {
        case "response.output_text.delta":
        case "response.audio_transcript.delta":
        case "response.output_audio_transcript.delta":
          this.agentAudioActive = true;
          if (typeof event.delta === "string") {
            this.appendAgentTranscript(event.delta);
          }
          break;
        case "response.output_text.done":
        case "response.audio_transcript.done":
        case "response.output_audio_transcript.done":
          this.agentAudioActive = false;
          this.flushAgentTranscript(onTranscript);
          break;
        case "response.completed":
          this.agentAudioActive = false;
          if (typeof event.transcript === "string" && event.transcript.trim()) {
            this.flushAgentTranscript(onTranscript, event.transcript);
          } else {
            this.flushAgentTranscript(onTranscript);
          }
          break;
        case "response.done":
        case "output_audio_buffer.stopped":
        case "response.output_audio_buffer.stopped":
          this.agentAudioActive = false;
          this.flushAgentTranscript(onTranscript);
          break;
        case "conversation.item.input_audio_transcription.completed":
          this.userAudioActive = false;
          if (typeof event.transcript === "string") {
            this.flushUserTranscript(onTranscript, event.transcript);
          }
          break;
        case "input_audio_buffer.speech_started":
          this.userAudioActive = true;
          this.markUserSpeechStart();
          break;
        case "input_audio_buffer.speech_stopped":
          this.userAudioActive = false;
          this.flushUserTranscript(onTranscript);
          break;
        case "output_audio_buffer.started":
        case "response.output_audio_buffer.started":
          this.agentAudioActive = true;
          break;
        default:
          break;
      }
    } catch (error) {
      console.warn("Failed to parse realtime event", error);
    }
  }

}
