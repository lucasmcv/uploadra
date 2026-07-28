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

async function postAnswer(
  segmentId: string,
  body: Record<string, unknown>
): Promise<{ isCorrect: boolean | null; feedback: string | null }> {
  const res = await fetch(`/api/segments/${segmentId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { isCorrect: null, feedback: null };
  const { answer } = await res.json();
  return { isCorrect: answer?.isCorrect ?? null, feedback: answer?.feedback ?? null };
}

export function usePracticePlayback(
  segments: PracticeSegment[],
  initialAnswers: Record<string, AnswerState>,
  videoRef: RefObject<MinimalPlayer | null>
) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(initialAnswers);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const idx = findActiveIndex(segments, video.currentTime);
    if (idx === null) return;

    setActiveIndex(idx);

    const seg = segments[idx];
    const existing = answers[seg.id];
    // Force a pause the first time we reach a segment that hasn't been
    // answered or skipped yet — once it has an answer, later ticks within
    // the same segment (after "Continuar") won't re-trigger this.
    if (!existing && !video.paused) {
      video.pause();
    }
  }, [segments, answers, videoRef]);

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
      setAnswers((prev) => ({
        ...prev,
        [segmentId]: { answerText, selectedOptionIndex: null, skipped: false, isCorrect: null, feedback: null },
      }));
      videoRef.current?.play();

      const { isCorrect, feedback } = await postAnswer(segmentId, { answerText, skipped: false });
      setAnswers((prev) => ({ ...prev, [segmentId]: { ...prev[segmentId], isCorrect, feedback } }));
    },
    [videoRef]
  );

  const editAnswer = useCallback(async (segmentId: string, answerText: string) => {
    setAnswers((prev) => ({
      ...prev,
      [segmentId]: { answerText, selectedOptionIndex: null, skipped: false, isCorrect: null, feedback: null },
    }));

    const { isCorrect, feedback } = await postAnswer(segmentId, { answerText, skipped: false });
    setAnswers((prev) => ({ ...prev, [segmentId]: { ...prev[segmentId], isCorrect, feedback } }));
  }, []);

  const selectOption = useCallback(
    async (segmentId: string, optionIndex: number) => {
      setAnswers((prev) => ({
        ...prev,
        [segmentId]: {
          answerText: null,
          selectedOptionIndex: optionIndex,
          skipped: false,
          isCorrect: null,
          feedback: null,
        },
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
        [segmentId]: {
          answerText: null,
          selectedOptionIndex: null,
          skipped: true,
          isCorrect: null,
          feedback: null,
        },
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
