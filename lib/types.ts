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
  skipped: boolean;
  submittedAt: string | null;
}
