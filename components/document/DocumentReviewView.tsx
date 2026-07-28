const OPTION_LETTERS = ["A", "B", "C", "D"];

export interface ReviewFragment {
  id: string;
  orderIndex: number;
  page: number;
  lineStart: number;
  lineEnd: number;
  text: string;
  question: string | null;
  options: string[] | null;
  correctOptionIndex: number | null;
  answer: { answerText: string | null; selectedOptionIndex: number | null; skipped: boolean } | null;
}

export function DocumentReviewView({ fragments }: { fragments: ReviewFragment[] }) {
  return (
    <ul className="flex flex-col gap-4 max-w-2xl">
      {fragments.map((fragment, index) => (
        <li key={fragment.id} className="border rounded p-4">
          <p className="text-xs text-gray-500 mb-1">
            {index + 1}. (p.{fragment.page}, l.{fragment.lineStart}-{fragment.lineEnd})
          </p>
          {fragment.question && <p className="text-sm font-medium mb-1">{fragment.question}</p>}
          <p className="text-sm mb-2">{fragment.text}</p>

          {fragment.options ? (
            <div className="flex flex-col gap-1">
              {fragment.options.map((option, i) => {
                let className = "text-sm rounded px-2 py-1";
                if (i === fragment.correctOptionIndex) className += " bg-green-100";
                else if (i === fragment.answer?.selectedOptionIndex) className += " bg-red-100";
                return (
                  <p key={i} className={className}>
                    <span className="font-semibold mr-2">{OPTION_LETTERS[i]}</span>
                    {option}
                  </p>
                );
              })}
              {fragment.answer?.skipped && <p className="text-sm text-amber-600">Saltado</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              {fragment.answer?.skipped
                ? "Saltado"
                : fragment.answer?.answerText
                  ? `Tu respuesta: ${fragment.answer.answerText}`
                  : "Sin respuesta"}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
