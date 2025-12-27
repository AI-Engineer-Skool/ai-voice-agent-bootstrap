import clsx from "clsx";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";
import styles from "./Controls.module.css";

export interface ControlsProps {
  status: "idle" | "connecting" | "live" | "ended" | "error";
  onStart: () => void;
  onStop: () => void;
  canStart: boolean;
  canStop: boolean;
  muted: boolean;
  onToggleMute: () => void;
}

export function Controls({
  status,
  onStart,
  onStop,
  canStart,
  canStop,
  muted,
  onToggleMute,
}: ControlsProps) {
  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={clsx(
          styles.button,
          status === "idle" ? null : styles.secondary
        )}
        onClick={onStart}
        disabled={!canStart || status === "connecting"}
      >
        {status === "connecting" ? "Connecting…" : "Start Survey"}
      </button>
      <button
        type="button"
        className={clsx(styles.button, styles.danger)}
        onClick={onStop}
        disabled={!canStop}
      >
        End Survey
      </button>
      <button
        type="button"
        className={clsx(
          styles.button,
          styles.muteToggle,
          styles.secondary,
          muted ? styles.muted : null
        )}
        onClick={onToggleMute}
      >
        {muted ? (
          <FaMicrophoneSlash
            className={clsx(styles.muteIcon, styles.muteIconMuted)}
          />
        ) : (
          <FaMicrophone
            className={clsx(styles.muteIcon, styles.muteIconActive)}
          />
        )}
        <span>{muted ? "Unmute" : "Mute"}</span>
      </button>
    </div>
  );
}
