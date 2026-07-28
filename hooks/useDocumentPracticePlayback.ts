import { useCallback, useState } from "react";
import type { AnswerState } from "@/lib/types";

export interface PracticeFragment {
  id: string;
  orderIndex: number;
  page: number;
  lineStart: number;
  lineEnd: number;
  text: string;
  question: string | null;
  options: string[] | null;
  correctOptionIndex: number | null;
}

function firstUnansweredIndex(
  fragments: PracticeFragment[],
  answers: Record<string, AnswerState>
): number {
  const idx = fragments.findIndex((f) => !answers[f.id]);
  return idx === -1 ? 0 : idx;
}

export function useDocumentPracticePlayback(
  fragments: PracticeFragment[],
  initialAnswers: Record<string, AnswerState>
) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(initialAnswers);
  const [activeIndex, setActiveIndex] = useState(() => firstUnansweredIndex(fragments, initialAnswers));

  const jumpToFragment = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const goToNext = useCallback(() => {
    setActiveIndex((i) => Math.min(i + 1, fragments.length - 1));
  }, [fragments.length]);

  const submitOpenAnswer = useCallback(async (fragmentId: string, answerText: string) => {
    setAnswers((prev) => ({ ...prev, [fragmentId]: { answerText, selectedOptionIndex: null, skipped: false } }));
    await fetch(`/api/document-fragments/${fragmentId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerText, skipped: false }),
    });
  }, []);

  const editAnswer = useCallback(async (fragmentId: string, answerText: string) => {
    setAnswers((prev) => ({
      ...prev,
      [fragmentId]: { answerText, selectedOptionIndex: null, skipped: false },
    }));
    await fetch(`/api/document-fragments/${fragmentId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerText, skipped: false }),
    });
  }, []);

  const selectOption = useCallback(async (fragmentId: string, optionIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [fragmentId]: { answerText: null, selectedOptionIndex: optionIndex, skipped: false },
    }));
    await fetch(`/api/document-fragments/${fragmentId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedOptionIndex: optionIndex, skipped: false }),
    });
  }, []);

  const skipFragment = useCallback(
    async (fragmentId: string) => {
      setAnswers((prev) => ({
        ...prev,
        [fragmentId]: { answerText: null, selectedOptionIndex: null, skipped: true },
      }));
      await fetch(`/api/document-fragments/${fragmentId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped: true }),
      });
      goToNext();
    },
    [goToNext]
  );

  const isFinished = fragments.length > 0 && fragments.every((f) => !!answers[f.id]);

  return {
    answers,
    activeIndex,
    jumpToFragment,
    goToNext,
    submitOpenAnswer,
    editAnswer,
    selectOption,
    skipFragment,
    isFinished,
  };
}
