export const VideoStatus = {
  Ready: "ready",
  Failed: "failed",
} as const;

export type VideoStatus = (typeof VideoStatus)[keyof typeof VideoStatus];

// Text documents still use open/mcq practice mode; videos no longer do.
export const QuestionMode = {
  Open: "open",
  Mcq: "mcq",
} as const;

export type QuestionMode = (typeof QuestionMode)[keyof typeof QuestionMode];

export interface VideoSegmentDTO {
  id: string;
  orderIndex: number;
  startTime: number;
  endTime: number;
  transcriptText: string;
  question: string | null;
}

export interface AnswerState {
  answerText: string | null;
  selectedOptionIndex: number | null;
  skipped: boolean;
}

/** Minimal shape needed to render a question prompt (open or mcq) — used by
 * the text-document practice/review flow (components/player/QuestionCard.tsx). */
export interface QuestionLike {
  question: string | null;
  options: string[] | null;
  correctOptionIndex: number | null;
}

export const VideoSourceType = {
  Upload: "upload",
  YouTube: "youtube",
} as const;

export type VideoSourceType = (typeof VideoSourceType)[keyof typeof VideoSourceType];

export const DocumentStatus = {
  Processing: "processing",
  Ready: "ready",
  Failed: "failed",
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

