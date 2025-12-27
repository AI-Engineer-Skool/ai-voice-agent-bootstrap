import { useEffect, useState } from "react";
import { Controls } from "../Controls/Controls";
import { ModeratorCard } from "../ModeratorCard/ModeratorCard";
import { StatusBanner } from "../StatusBanner/StatusBanner";
import { VoiceStatusDot } from "../VoiceActivity/VoiceStatusDot";
import { useSessionStore } from "../../state/sessionStore";
import { useModeratorStore } from "../../state/moderatorStore";
import styles from "./SessionLayout.module.css";
import type { TranscriptSegment } from "../../types";

export function SessionLayout() {
  const {
    status,
    startSession,
    finishSession,
    session,
    missingChecklist,
    errorMessage,
    webrtc,
  } = useSessionStore();
  const guidance = useModeratorStore((state) => state.guidance);
  const startModerator = useModeratorStore((state) => state.start);
  const stopModerator = useModeratorStore((state) => state.stop);
  const moderatorActive = useModeratorStore((state) => state.isActive);

  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (status === "live" && session && !moderatorActive) {
      startModerator(
        session.session_id,
        () => useSessionStore.getState().transcript as TranscriptSegment[],
      );
      return;
    }

    if (status !== "live" && moderatorActive) {
      stopModerator();
    }
  }, [status, session, startModerator, stopModerator, moderatorActive]);

  useEffect(() => {
    if (!webrtc) {
      setRemoteStream(null);
      return;
    }

    const existingStream = webrtc.getRemoteStream();
    setRemoteStream(existingStream ?? null);

    const listener = (event: unknown) => {
      const payload = event as { type?: string; stream?: MediaStream | null };
      if (payload.type === "remote_stream.update") {
        setRemoteStream(payload.stream ?? null);
      } else if (payload.type === "remote_stream.ended") {
        setRemoteStream(null);
      }
    };

    webrtc.addEventListener(listener);

    return () => {
      webrtc.removeEventListener(listener);
    };
  }, [webrtc]);

  useEffect(() => {
    if (webrtc) {
      webrtc.setMuted(muted);
    }
  }, [webrtc, muted]);

  const requestMediaStream = async () => {
    if (mediaStream) {
      return mediaStream;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setMediaStream(stream);
    return stream;
  };

  const handleStart = async () => {
    try {
      const stream = await requestMediaStream();
      await startSession(stream);
    } catch (error) {
      console.error("Unable to start session", error);
    }
  };

  const handleStop = async () => {
    await finishSession();
    mediaStream?.getTracks().forEach((track) => track.stop());
    setMediaStream(null);
    setRemoteStream(null);
  };

  const toggleMute = () => {
    const nextState = !muted;
    if (webrtc) {
      webrtc.setMuted(nextState);
    } else {
      mediaStream?.getAudioTracks().forEach((track) => {
        track.enabled = !nextState;
      });
    }
    setMuted(nextState);
  };

  return (
    <div className={styles.container}>
      <div className={styles.shell}>
        <div className={styles.topRow}>
          <StatusBanner
            status={status}
            provider={session?.provider}
            model={session?.model}
          />
          <Controls
            status={status}
            onStart={handleStart}
            onStop={handleStop}
            canStart={
              status === "idle" || status === "ended" || status === "error"
            }
            canStop={status === "live"}
            muted={muted}
            onToggleMute={toggleMute}
          />
          {errorMessage ? <div role="alert">{errorMessage}</div> : null}
        </div>

        <div className={styles.mainContent}>
          <div className={styles.dotWrapper}>
            <VoiceStatusDot
              localStream={mediaStream}
              remoteStream={remoteStream}
              active={status === "connecting" || status === "live"}
            />
          </div>
          <div className={styles.sideColumn}>
            <ModeratorCard
              guidanceText={guidance?.guidance_text}
              tone={guidance?.tone_alert}
              checklistComplete={missingChecklist.length === 0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
