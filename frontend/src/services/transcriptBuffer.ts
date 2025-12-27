import {
  DISPLAY_TRANSCRIPT_SEGMENTS,
  MAX_TRANSCRIPT_SEGMENTS,
} from "../utils/surveyConfig";
import type { TranscriptSegment } from "../types";

export class TranscriptBuffer {
  private segments: TranscriptSegment[] = [];

  append(segment: TranscriptSegment): void {
    this.segments.push(segment);
    if (this.segments.length > MAX_TRANSCRIPT_SEGMENTS) {
      this.segments = this.segments.slice(-MAX_TRANSCRIPT_SEGMENTS);
    }
  }

  bulkAppend(newSegments: TranscriptSegment[]): void {
    for (const segment of newSegments) {
      this.append(segment);
    }
  }

  getAll(): TranscriptSegment[] {
    return [...this.segments];
  }

  getRecent(limit: number = DISPLAY_TRANSCRIPT_SEGMENTS): TranscriptSegment[] {
    return this.segments.slice(-limit);
  }

  clear(): void {
    this.segments = [];
  }
}
