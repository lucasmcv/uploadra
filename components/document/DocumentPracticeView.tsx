"use client";

import { QuestionCard } from "@/components/player/QuestionCard";
import { FragmentProgressList } from "./FragmentProgressList";
import {
  useDocumentPracticePlayback,
  type PracticeFragment,
} from "@/hooks/useDocumentPracticePlayback";
import type { AnswerState } from "@/lib/types";

export function DocumentPracticeView({
  fragments,
  initialAnswers,
}: {
  fragments: PracticeFragment[];
  initialAnswers: Record<string, AnswerState>;
}) {
  const {
    answers,
    activeIndex,
    jumpToFragment,
    goToNext,
    submitOpenAnswer,
    editAnswer,
    selectOption,
    skipFragment,
    isFinished,
  } = useDocumentPracticePlayback(fragments, initialAnswers);

  const activeFragment = fragments[activeIndex];
  const activeAnswer = activeFragment ? answers[activeFragment.id] : undefined;
  const isAnswered = Boolean(activeAnswer) && !activeAnswer!.skipped;
  const isLast = activeIndex >= fragments.length - 1;

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="flex-1 max-w-2xl">
        {activeFragment && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Fragmento {activeIndex + 1} de {fragments.length} — (p.{activeFragment.page}, l.
              {activeFragment.lineStart}-{activeFragment.lineEnd})
            </p>
            <QuestionCard
              key={activeFragment.id}
              segment={activeFragment}
              answer={activeAnswer}
              onSubmitOpen={(text) => submitOpenAnswer(activeFragment.id, text)}
              onSelectOption={(index) => selectOption(activeFragment.id, index)}
              onSkip={() => skipFragment(activeFragment.id)}
              onEditAnswer={(text) => editAnswer(activeFragment.id, text)}
              revealCorrectText={activeFragment.text}
            />
            {isAnswered && !isLast && (
              <button
                type="button"
                onClick={goToNext}
                className="mt-3 bg-black text-white rounded px-4 py-2"
              >
                Siguiente fragmento →
              </button>
            )}
          </>
        )}
        {isFinished && (
          <p className="mt-4 text-green-700 font-medium">
            Terminaste todos los fragmentos. Podés repasar tus respuestas.
          </p>
        )}
      </div>
      <div className="w-full md:w-72">
        <h2 className="text-sm font-semibold mb-2">Fragmentos</h2>
        <FragmentProgressList
          fragments={fragments}
          answers={answers}
          activeIndex={activeIndex}
          onJump={jumpToFragment}
        />
      </div>
    </div>
  );
}
