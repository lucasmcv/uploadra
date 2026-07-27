"use client";

import type { AnswerState, PracticeSegment } from "@/hooks/usePracticePlayback";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SegmentProgressList({
  segments,
  answers,
  onJump,
}: {
  segments: PracticeSegment[];
  answers: Record<string, AnswerState>;
  onJump: (index: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {segments.map((seg, index) => {
        const answer = answers[seg.id];
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
          <li key={seg.id}>
            <button
              type="button"
              onClick={() => onJump(index)}
              className="w-full text-left border rounded px-2 py-1 flex justify-between items-center hover:bg-gray-50"
            >
              <span>{formatTime(seg.startTime)}</span>
              <span className={statusClass}>{statusLabel}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
