import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useAudioLevel } from "../../hooks/useAudioLevel";
import styles from "./VoiceStatusDot.module.css";

interface VoiceStatusDotProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  active: boolean;
}

type VoiceState = "idle" | "human" | "agent";

const SPEECH_START_THRESHOLD = 0.08;
const SPEECH_STOP_THRESHOLD = 0.04;
const HOLD_MS = 450;

const STATUS_LABEL: Record<VoiceState, string> = {
  idle: "No one is speaking",
  human: "You are speaking",
  agent: "AI is speaking",
};

export function VoiceStatusDot({
  localStream,
  remoteStream,
  active,
}: VoiceStatusDotProps) {
  const localLevel = useAudioLevel(localStream, active);
  const remoteLevel = useAudioLevel(remoteStream, active);

  const [state, setState] = useState<VoiceState>("idle");
  const stateRef = useRef<VoiceState>("idle");
  const lastHumanRef = useRef<number | null>(null);
  const lastAgentRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!active) {
      lastHumanRef.current = null;
      lastAgentRef.current = null;
      if (stateRef.current !== "idle") {
        setState("idle");
      }
      return;
    }

    const now = performance.now();
    const previousState = stateRef.current;

    const humanStrongEnough =
      localLevel >= SPEECH_START_THRESHOLD ||
      (previousState === "human" && localLevel >= SPEECH_STOP_THRESHOLD);
    const agentStrongEnough =
      remoteLevel >= SPEECH_START_THRESHOLD ||
      (previousState === "agent" && remoteLevel >= SPEECH_STOP_THRESHOLD);

    if (humanStrongEnough) {
      lastHumanRef.current = now;
    }
    if (agentStrongEnough) {
      lastAgentRef.current = now;
    }

    const humanHolding =
      lastHumanRef.current !== null && now - lastHumanRef.current < HOLD_MS;
    const agentHolding =
      lastAgentRef.current !== null && now - lastAgentRef.current < HOLD_MS;

    let nextState: VoiceState = "idle";

    if (humanHolding && agentHolding) {
      nextState = localLevel >= remoteLevel ? "human" : "agent";
    } else if (humanHolding) {
      nextState = "human";
    } else if (agentHolding) {
      nextState = "agent";
    }

    if (stateRef.current !== nextState) {
      setState(nextState);
    }
  }, [active, localLevel, remoteLevel]);

  const intensity =
    state === "human"
      ? Math.min(localLevel, 1)
      : state === "agent"
        ? Math.min(remoteLevel, 1)
        : 0;

  const toneClass =
    state === "human"
      ? styles.human
      : state === "agent"
        ? styles.agent
        : styles.idle;
  const glowColor =
    state === "human"
      ? "59, 130, 246"
      : state === "agent"
        ? "34, 197, 94"
        : "148, 163, 184";
  const scaled = Math.min(intensity * 2.8, 1.2);
  const scale = 1 + scaled * 0.4;
  const glowBlur = 32 + scaled * 24;
  const glowOpacity = 0.18 + scaled * 0.45;

  return (
    <div className={styles.wrapper}>
      <div
        className={clsx(styles.dot, toneClass)}
        style={{
          transform: `scale(${scale})`,
          boxShadow: `0 0 ${glowBlur}px rgba(${glowColor}, ${glowOpacity})`,
        }}
        aria-hidden="true"
      />
      <p className={styles.caption} aria-hidden="true">
        {STATUS_LABEL[state]}
      </p>
      <span className={styles.srOnly} aria-live="polite">
        {STATUS_LABEL[state]}
      </span>
    </div>
  );
}
