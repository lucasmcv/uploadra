export const VideoStatus = {
  Uploading: "uploading",
  Transcribing: "transcribing",
  Ready: "ready",
  Failed: "failed",
} as const;

export type VideoStatus = (typeof VideoStatus)[keyof typeof VideoStatus];

export const QuestionMode = {
  Open: "open",
  Mcq: "mcq",
} as const;

export type QuestionMode = (typeof QuestionMode)[keyof typeof QuestionMode];

export interface SegmentDTO {
  id: string;
  orderIndex: number;
  startTime: number;
  endTime: number;
  transcriptText: string;
  question: string | null;
  options: string[] | null;
  correctOptionIndex: number | null;
}

export interface AnswerDTO {
  segmentId: string;
  answerText: string | null;
  selectedOptionIndex: number | null;
  isCorrect: boolean | null;
  feedback: string | null;
  skipped: boolean;
  submittedAt: string | null;
}

export interface AnswerState {
  answerText: string | null;
  selectedOptionIndex: number | null;
  skipped: boolean;
  /** open mode only: LLM judgment vs. the correct text. Null = mcq, skipped, or not yet graded. */
  isCorrect: boolean | null;
  feedback: string | null;
}

/** Minimal shape needed to render a question prompt (open or mcq). */
export interface QuestionLike {
  question: string | null;
  options: string[] | null;
  correctOptionIndex: number | null;
}

/**
 * The subset of a native HTMLVideoElement's interface that the playback
 * hooks (usePracticePlayback, useSegmentSync) actually need. A real
 * <video> element satisfies this structurally with no adapter. A YouTube
 * IFrame-backed player implements it explicitly (see
 * components/player/YouTubePlayer.tsx) so both sources can drive the same
 * pause-at-boundary / segment-sync logic.
 */
export interface MinimalPlayer {
  currentTime: number;
  readonly paused: boolean;
  play(): void | Promise<void>;
  pause(): void;
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

