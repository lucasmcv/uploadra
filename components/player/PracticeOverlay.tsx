"use client";

import type { AnswerState, QuestionLike } from "@/lib/types";
import { QuestionCard } from "./QuestionCard";

export function PracticeOverlay({
  position = "bottom",
  segment,
  answer,
  onSubmitOpen,
  onSelectOption,
  onSkip,
  onEditAnswer,
}: {
  position?: "top" | "bottom";
  segment: QuestionLike;
  answer: AnswerState | undefined;
  onSubmitOpen: (text: string) => void;
  onSelectOption: (index: number) => void;
  onSkip: () => void;
  onEditAnswer: (text: string) => void;
}) {
  const positionClass = position === "top" ? "top-4" : "bottom-4";

  return (
    <QuestionCard
      segment={segment}
      answer={answer}
      onSubmitOpen={onSubmitOpen}
      onSelectOption={onSelectOption}
      onSkip={onSkip}
      onEditAnswer={onEditAnswer}
      className={`absolute left-4 right-4 ${positionClass}`}
    />
  );
}
