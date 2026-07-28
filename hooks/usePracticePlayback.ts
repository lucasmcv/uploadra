import { useCallback, useState, type RefObject } from "react";
import type { AnswerState, MinimalPlayer } from "@/lib/types";

export type { AnswerState };

export interface PracticeSegment {
  id: string;
  orderIndex: number;
  startTime: number;
  endTime: number;
  transcriptText: string;
  question: string | null;
  options: string[] | null;
  correctOptionIndex: number | null;
}

function findActiveIndex(segments: PracticeSegment[], time: number): number | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (time >= segments[i].startTime) return i;
  }
  return null;
}

function postAnswer(segmentId: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`/api/segments/${segmentId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function usePracticePlayback(
  segments: PracticeSegment[],
  initialAnswers: Record<string, AnswerState>,
  videoRef: RefObject<MinimalPlayer | null>,
  autoPauseEnabled: boolean = true
) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(initialAnswers);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const idx = findActiveIndex(segments, video.currentTime);
    if (idx === null) return;

    setActiveIndex(idx);

    if (!autoPauseEnabled) return;

    const seg = segments[idx];
    const existing = answers[seg.id];
    // Force a pause the first time we reach a segment that hasn't been
    // answered or skipped yet — once it has an answer, later ticks within
    // the same segment (after "Continuar") won't re-trigger this.
    if (!existing && !video.paused) {
      video.pause();
    }
  }, [segments, answers, videoRef, autoPauseEnabled]);

  const jumpToSegment = useCallback(
    (index: number) => {
      const video = videoRef.current;
      const seg = segments[index];
      if (!video || !seg) return;

      video.currentTime = seg.startTime;
      video.pause();
      setActiveIndex(index);
    },
    [segments, videoRef]
  );

  const submitOpenAnswer = useCallback(
    async (segmentId: string, answerText: string) => {
      setAnswers((prev) => ({ ...prev, [segmentId]: { answerText, selectedOptionIndex: null, skipped: false } }));
      await postAnswer(segmentId, { answerText, skipped: false });
      videoRef.current?.play();
    },
    [videoRef]
  );

  const editAnswer = useCallback(async (segmentId: string, answerText: string) => {
    setAnswers((prev) => ({
      ...prev,
      [segmentId]: { answerText, selectedOptionIndex: null, skipped: false },
    }));
    await postAnswer(segmentId, { answerText, skipped: false });
  }, []);

  const selectOption = useCallback(
    async (segmentId: string, optionIndex: number) => {
      setAnswers((prev) => ({
        ...prev,
        [segmentId]: { answerText: null, selectedOptionIndex: optionIndex, skipped: false },
      }));
      await postAnswer(segmentId, { selectedOptionIndex: optionIndex, skipped: false });
      videoRef.current?.play();
    },
    [videoRef]
  );

  const skipSegment = useCallback(
    async (segmentId: string) => {
      setAnswers((prev) => ({
        ...prev,
        [segmentId]: { answerText: null, selectedOptionIndex: null, skipped: true },
      }));
      await postAnswer(segmentId, { skipped: true });
      videoRef.current?.play();
    },
    [videoRef]
  );

  const isFinished = segments.length > 0 && segments.every((s) => !!answers[s.id]);

  return {
    answers,
    activeIndex,
    handleTimeUpdate,
    jumpToSegment,
    submitOpenAnswer,
    editAnswer,
    selectOption,
    skipSegment,
    isFinished,
  };
}
