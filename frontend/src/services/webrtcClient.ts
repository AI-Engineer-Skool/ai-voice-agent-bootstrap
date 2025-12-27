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
  private localStream: MediaStream | null = null;
  private agentTranscriptParts: string[] = [];
  private agentTranscriptTimestamp: number | null = null;
  private agentTranscriptLastDelivered: string | null = null;
  private agentTranscriptLastDeliveredAt: number | null = null;
  private userTranscriptTimestamp: number | null = null;
  private agentAudioActive = false;
  private userAudioActive = false;
  private userAudioActiveLocal = false;
  private userAudioActiveServer = false;
  private muted = false;
  private localAudioContext: AudioContext | null = null;
  private localAudioAnalyser: AnalyserNode | null = null;
  private localAudioSource: MediaStreamAudioSourceNode | null = null;
  private localAudioMonitorId: number | null = null;
  private localAudioSilenceTimerId: number | null = null;

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

    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.provider = config.provider;
    this.resetTranscriptState();
    this.localStream = config.mediaStream;
    this.muted = false;

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

    this.dataChannel = this.pc.createDataChannel("oai-events", {
      ordered: true,
    });

    this.dataChannel.onmessage = (event) =>
      this.handleDataChannelMessage(event.data, config.onTranscript);

    this.dataChannel.onopen = () => {
      this.emit({ type: "data_channel.open" });
      this.triggerAgentTurn();
    };

    for (const track of config.mediaStream.getTracks()) {
      this.pc.addTrack(track, config.mediaStream);
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const response = await fetch(
      `${config.webrtcUrl}?model=${encodeURIComponent(config.model)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Authorization: `Bearer ${config.ephemeralKey}`,
        },
        body: offer.sdp ?? "",
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to create realtime session: ${response.status}`);
    }

    const answerSdp = await response.text();
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    this.startLocalUserAudioMonitor(config.mediaStream);
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
    this.localStream = null;
    this.muted = false;
    if (this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }
    if (this.remoteStream) {
      this.emit({ type: "remote_stream.ended" });
    }
    this.remoteStream = null;

    this.stopLocalUserAudioMonitor();
  }

  private resetTranscriptState() {
    this.agentTranscriptParts = [];
    this.agentTranscriptTimestamp = null;
    this.agentTranscriptLastDelivered = null;
    this.agentTranscriptLastDeliveredAt = null;
    this.userTranscriptTimestamp = null;
    this.agentAudioActive = false;
    this.userAudioActiveLocal = false;
    this.userAudioActiveServer = false;
    this.muted = false;
    this.updateUserAudioActive();
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
    finalText?: string,
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
    transcript?: string,
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

  private handleDataChannelMessage(
    raw: string,
    onTranscript?: (segment: TranscriptSegment) => void,
  ) {
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
          this.setServerUserAudioActive(false);
          if (typeof event.transcript === "string") {
            this.flushUserTranscript(onTranscript, event.transcript);
          }
          break;
        case "input_audio_buffer.speech_started":
          this.setServerUserAudioActive(true);
          this.markUserSpeechStart();
          break;
        case "input_audio_buffer.speech_stopped":
          this.setServerUserAudioActive(false);
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

  private startLocalUserAudioMonitor(stream: MediaStream) {
    this.stopLocalUserAudioMonitor();

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    let context: AudioContext;
    try {
      context = new AudioContextClass();
    } catch (error) {
      console.warn(
        "Failed to create audio context for local speech monitor",
        error,
      );
      return;
    }

    let source: MediaStreamAudioSourceNode;
    try {
      source = context.createMediaStreamSource(stream);
    } catch (error) {
      console.warn("Failed to bind media stream for speech monitor", error);
      void context.close().catch(() => undefined);
      return;
    }

    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;

    try {
      source.connect(analyser);
    } catch (error) {
      console.warn("Failed to connect analyser for speech monitor", error);
      try {
        source.disconnect();
      } catch {
        // ignore disconnect errors
      }
      void context.close().catch(() => undefined);
      return;
    }

    this.localAudioContext = context;
    this.localAudioSource = source;
    this.localAudioAnalyser = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const USER_SPEECH_THRESHOLD = 25;
    const REQUIRED_CONSECUTIVE_FRAMES = 15;
    const SILENCE_DEBOUNCE_MS = 1500;

    let consecutiveAboveThreshold = 0;

    const monitor = () => {
      if (!this.localAudioAnalyser) {
        return;
      }

      this.localAudioAnalyser.getByteFrequencyData(dataArray);
      const average =
        dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

      if (average > USER_SPEECH_THRESHOLD) {
        consecutiveAboveThreshold += 1;
        if (
          consecutiveAboveThreshold >= REQUIRED_CONSECUTIVE_FRAMES &&
          !this.muted
        ) {
          this.clearLocalSilenceTimer();
          this.setLocalUserAudioActive(true);
        }
      } else {
        consecutiveAboveThreshold = 0;
        if (
          this.userAudioActiveLocal &&
          this.localAudioSilenceTimerId === null
        ) {
          this.localAudioSilenceTimerId = window.setTimeout(() => {
            this.localAudioSilenceTimerId = null;
            this.setLocalUserAudioActive(false);
          }, SILENCE_DEBOUNCE_MS);
        }
      }

      this.localAudioMonitorId = window.requestAnimationFrame(monitor);
    };

    this.localAudioMonitorId = window.requestAnimationFrame(monitor);
  }

  private stopLocalUserAudioMonitor() {
    if (this.localAudioMonitorId !== null) {
      window.cancelAnimationFrame(this.localAudioMonitorId);
      this.localAudioMonitorId = null;
    }

    this.clearLocalSilenceTimer();

    if (this.localAudioSource) {
      try {
        this.localAudioSource.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.localAudioSource = null;
    }

    if (this.localAudioAnalyser) {
      try {
        this.localAudioAnalyser.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.localAudioAnalyser = null;
    }

    if (this.localAudioContext) {
      this.localAudioContext.close().catch(() => undefined);
      this.localAudioContext = null;
    }

    this.setLocalUserAudioActive(false);
  }

  private clearLocalSilenceTimer() {
    if (this.localAudioSilenceTimerId !== null) {
      window.clearTimeout(this.localAudioSilenceTimerId);
      this.localAudioSilenceTimerId = null;
    }
  }

  private setLocalUserAudioActive(active: boolean) {
    if (this.userAudioActiveLocal === active) {
      return;
    }
    this.userAudioActiveLocal = active;
    this.updateUserAudioActive();
  }

  private setServerUserAudioActive(active: boolean) {
    if (this.userAudioActiveServer === active) {
      return;
    }
    this.userAudioActiveServer = active;
    this.updateUserAudioActive();
  }

  private updateUserAudioActive() {
    if (this.localAudioAnalyser) {
      this.userAudioActive = this.userAudioActiveLocal;
      return;
    }
    this.userAudioActive = this.userAudioActiveServer;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }

    if (muted) {
      this.clearLocalSilenceTimer();
      this.setLocalUserAudioActive(false);
    }

    this.emit({ type: "local_audio.mute_changed", muted });
  }

  isMicrophoneMuted(): boolean {
    return this.muted;
  }
}
