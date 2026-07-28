import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentPracticeView } from "@/components/document/DocumentPracticeView";
import type { AnswerState } from "@/lib/types";

export default async function DocumentPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      fragments: {
        orderBy: { orderIndex: "asc" },
        include: { answers: { where: { userId: session!.user.id } } },
      },
    },
  });

  if (!document || document.ownerId !== session!.user.id) {
    notFound();
  }

  if (document.status !== "ready") {
    redirect(`/documents/${id}`);
  }

  const fragments = document.fragments.map((f) => ({
    id: f.id,
    orderIndex: f.orderIndex,
    page: f.page,
    lineStart: f.lineStart,
    lineEnd: f.lineEnd,
    text: f.text,
    question: f.question,
    options: f.options ? (JSON.parse(f.options) as string[]) : null,
    correctOptionIndex: f.correctOptionIndex,
  }));

  const initialAnswers: Record<string, AnswerState> = {};
  for (const f of document.fragments) {
    const answer = f.answers[0];
    if (answer) {
      initialAnswers[f.id] = {
        answerText: answer.answerText,
        selectedOptionIndex: answer.selectedOptionIndex,
        skipped: answer.skipped,
      };
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-4">{document.title} — Práctica</h1>
      <DocumentPracticeView fragments={fragments} initialAnswers={initialAnswers} />
    </div>
  );
}
