export type TranscriptActor = "agent" | "customer";

export interface TranscriptSegment {
  actor: TranscriptActor;
  text: string;
  timestamp: string;
}
