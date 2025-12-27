import styles from "./StatusBanner.module.css";

export interface StatusBannerProps {
  status: "idle" | "connecting" | "live" | "ended" | "error";
  provider?: string;
  model?: string;
}

function renderStatusCopy(status: StatusBannerProps["status"]): string {
  switch (status) {
    case "idle":
      return "Ready to connect";
    case "connecting":
      return "Connecting…";
    case "live":
      return "Live";
    case "ended":
      return "Ended";
    case "error":
      return "Error";
    default:
      return "";
  }
}

export function StatusBanner({ status, provider, model }: StatusBannerProps) {
  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <span className={styles.title}>Customer Survey Session</span>
        <span className={styles.subtitle}>
          {provider ? `${provider} · ${model}` : "Offline"}
        </span>
      </div>
      <span className={styles.status}>{renderStatusCopy(status)}</span>
    </div>
  );
}
