import styles from "./ModeratorCard.module.css";
import { parseModeratorGuidance } from "../../utils/moderatorGuidance";

export interface ModeratorCardProps {
  guidanceText?: string;
  tone?: string | null;
  checklistComplete: boolean;
}

export function ModeratorCard({ guidanceText, tone, checklistComplete }: ModeratorCardProps) {
  const parsed = guidanceText ? parseModeratorGuidance(guidanceText) : null;
  const toneLabel = tone && tone !== "neutral" ? tone : null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Moderator Guidance</span>
        <span className={styles.pill}>Debug helper</span>
      </div>

      <p className={styles.description}>Use this panel while testing to debug how the moderator keeps the agent on track.</p>

      {parsed ? (
        <div className={styles.guidanceLines}>
          <div className={styles.guidanceLine}>
            <span className={styles.lineLabel}>Checklist</span>
            <span className={styles.lineText}>{parsed.checklist}</span>
          </div>
          <div className={styles.guidanceLine}>
            <span className={styles.lineLabel}>Coach</span>
            <span className={styles.lineText}>{parsed.coach}</span>
          </div>
          <div className={styles.guidanceLine}>
            <span className={styles.lineLabel}>Prompt</span>
            <span className={styles.lineText}>{parsed.prompt}</span>
          </div>
        </div>
      ) : (
        <div className={styles.guidance}>{guidanceText ?? "Moderator will post reminders here."}</div>
      )}

      <div className={styles.status}>Checklist status: {checklistComplete ? "complete" : "in progress"}</div>
      {toneLabel ? <div className={styles.tone}>Customer tone: {toneLabel}</div> : null}
    </div>
  );
}
