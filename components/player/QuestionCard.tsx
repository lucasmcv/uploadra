"use client";

import { useState } from "react";
import type { AnswerState, QuestionLike } from "@/lib/types";

const OPTION_LETTERS = ["A", "B", "C", "D"];

export function QuestionCard({
  segment,
  answer,
  onSubmitOpen,
  onSelectOption,
  onSkip,
  onEditAnswer,
  revealCorrectText,
  className = "",
}: {
  segment: QuestionLike;
  answer: AnswerState | undefined;
  onSubmitOpen: (text: string) => void;
  onSelectOption: (index: number) => void;
  onSkip: () => void;
  onEditAnswer: (text: string) => void;
  /**
   * The literal source text (segment.transcriptText / fragment.text) to
   * display once an open answer is submitted, so the user can compare it
   * themselves — no AI judgment involved. Pass this for text documents,
   * where there's no other way to reveal the "correct answer". Omit for
   * video/audio: continuing playback plays the segment itself right after
   * answering, which already is the reveal (hearing/seeing it directly),
   * so no extra text display is needed there.
   */
  revealCorrectText?: string;
  className?: string;
}) {
  const isAnswered = Boolean(answer) && !answer!.skipped;
  const isMcq = segment.options !== null;

  return (
    <div className={`bg-white text-black rounded p-3 shadow-lg flex flex-col gap-2 ${className}`}>
      <p className="text-sm font-medium">{segment.question ?? "Escribí lo que escuchaste:"}</p>
      {isMcq ? (
        <McqBody
          segment={segment}
          answer={answer}
          isAnswered={isAnswered}
          onSelectOption={onSelectOption}
          onSkip={onSkip}
        />
      ) : (
        <OpenBody
          answer={answer}
          isAnswered={isAnswered}
          onSubmitOpen={onSubmitOpen}
          onSkip={onSkip}
          onEditAnswer={onEditAnswer}
          revealCorrectText={revealCorrectText}
        />
      )}
    </div>
  );
}

function OpenBody({
  answer,
  isAnswered,
  onSubmitOpen,
  onSkip,
  onEditAnswer,
  revealCorrectText,
}: {
  answer: AnswerState | undefined;
  isAnswered: boolean;
  onSubmitOpen: (text: string) => void;
  onSkip: () => void;
  onEditAnswer: (text: string) => void;
  revealCorrectText?: string;
}) {
  const [value, setValue] = useState(answer?.answerText ?? "");

  if (isAnswered) {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value !== answer?.answerText) onEditAnswer(value);
          }}
          className="border rounded px-2 py-1 text-sm"
          rows={2}
        />
        {revealCorrectText && (
          <p className="text-xs text-gray-600">
            <span className="font-medium">Texto correcto:</span> {revealCorrectText}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
        rows={2}
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onSkip} className="text-sm border rounded px-3 py-1">
          Saltar por ahora
        </button>
        <button
          type="button"
          onClick={() => onSubmitOpen(value)}
          disabled={value.trim() === ""}
          className="text-sm bg-black text-white rounded px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continuar
        </button>
      </div>
    </>
  );
}

function McqBody({
  segment,
  answer,
  isAnswered,
  onSelectOption,
  onSkip,
}: {
  segment: QuestionLike;
  answer: AnswerState | undefined;
  isAnswered: boolean;
  onSelectOption: (index: number) => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {(segment.options ?? []).map((option, index) => {
        let className = "text-left border rounded px-3 py-2 text-sm";
        if (isAnswered) {
          if (index === segment.correctOptionIndex) {
            className += " bg-green-100 border-green-600";
          } else if (index === answer?.selectedOptionIndex) {
            className += " bg-red-100 border-red-600";
          }
        }
        return (
          <button
            key={index}
            type="button"
            disabled={isAnswered}
            onClick={() => onSelectOption(index)}
            className={className}
          >
            <span className="font-semibold mr-2">{OPTION_LETTERS[index]}</span>
            {option}
          </button>
        );
      })}
      {!isAnswered && (
        <div className="flex justify-end">
          <button type="button" onClick={onSkip} className="text-sm border rounded px-3 py-1">
            Saltar por ahora
          </button>
        </div>
      )}
    </div>
  );
}
