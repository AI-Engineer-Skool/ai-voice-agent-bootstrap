import { CHECKLIST_LABELS, type ChecklistKey } from "../../utils/surveyConfig";
import styles from "./SurveyChecklist.module.css";

export interface SurveyChecklistProps {
  missing: ChecklistKey[];
}

export function SurveyChecklist({ missing }: SurveyChecklistProps) {
  return (
    <div className={styles.container}>
      <div className={styles.title}>Survey Checklist</div>
      {Object.entries(CHECKLIST_LABELS).map(([key, value]) => {
        const checklistKey = key as ChecklistKey;
        const isComplete = !missing.includes(checklistKey);
        return (
          <div key={key} className={`${styles.item} ${isComplete ? styles.itemComplete : ""}`}>
            <div className={styles.itemTitle}>{value.title}</div>
            <div className={styles.itemDescription}>{value.description}</div>
          </div>
        );
      })}
    </div>
  );
}
