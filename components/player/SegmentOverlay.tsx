"use client";

const OPTION_LETTERS = ["A", "B", "C", "D"];

export function SegmentOverlay({
  position = "bottom",
  question,
  transcriptText,
  options,
  correctOptionIndex,
  answerText,
  selectedOptionIndex,
  isCorrect,
  feedback,
  skipped,
}: {
  position?: "top" | "bottom";
  question: string | null;
  transcriptText: string;
  options: string[] | null;
  correctOptionIndex: number | null;
  answerText: string | null;
  selectedOptionIndex: number | null;
  isCorrect: boolean | null;
  feedback: string | null;
  skipped: boolean;
}) {
  const positionClass = position === "top" ? "top-4" : "bottom-4";

  return (
    <div
      className={`absolute left-4 right-4 ${positionClass} bg-black/80 text-white rounded p-3 flex flex-col gap-1`}
    >
      {question && <p className="text-sm font-medium">{question}</p>}
      <p className="text-sm">{transcriptText}</p>

      {options ? (
        <div className="flex flex-col gap-1 mt-1">
          {options.map((option, index) => {
            let className = "text-sm rounded px-2 py-1";
            if (index === correctOptionIndex) className += " bg-green-700/60";
            else if (index === selectedOptionIndex) className += " bg-red-700/60";
            return (
              <p key={index} className={className}>
                <span className="font-semibold mr-2">{OPTION_LETTERS[index]}</span>
                {option}
              </p>
            );
          })}
          {skipped && <p className="text-sm text-gray-300">Saltado</p>}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-300">
            {skipped ? "Saltado" : answerText ? `Tu respuesta: ${answerText}` : "Sin respuesta"}
          </p>
          {isCorrect !== null && (
            <p className={`text-xs ${isCorrect ? "text-green-400" : "text-amber-400"}`}>
              {isCorrect ? "✓ " : "✗ "}
              {feedback}
            </p>
          )}
        </>
      )}
    </div>
  );
}
