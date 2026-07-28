"use client";

import type { AnswerState } from "@/lib/types";
import type { PracticeFragment } from "@/hooks/useDocumentPracticePlayback";

export function FragmentProgressList({
  fragments,
  answers,
  activeIndex,
  onJump,
}: {
  fragments: PracticeFragment[];
  answers: Record<string, AnswerState>;
  activeIndex: number;
  onJump: (index: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {fragments.map((fragment, index) => {
        const answer = answers[fragment.id];
        const status = !answer ? "pending" : answer.skipped ? "skipped" : "answered";
        const statusLabel = { pending: "Pendiente", skipped: "Saltado", answered: "Respondido" }[
          status
        ];
        const statusClass = {
          pending: "text-gray-500",
          skipped: "text-amber-600",
          answered: "text-green-600",
        }[status];

        return (
          <li key={fragment.id}>
            <button
              type="button"
              onClick={() => onJump(index)}
              className={`w-full text-left border rounded px-2 py-1 flex justify-between items-center hover:bg-gray-50 ${
                index === activeIndex ? "ring-2 ring-black" : ""
              }`}
            >
              <span>
                {index + 1}. (p.{fragment.page}, l.{fragment.lineStart}-{fragment.lineEnd})
              </span>
              <span className={statusClass}>{statusLabel}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
