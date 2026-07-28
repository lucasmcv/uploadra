import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentReviewView } from "@/components/document/DocumentReviewView";

export default async function DocumentReviewPage({
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

  const fragments = document.fragments.map((f) => {
    const answer = f.answers[0];
    return {
      id: f.id,
      orderIndex: f.orderIndex,
      page: f.page,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      text: f.text,
      question: f.question,
      options: f.options ? (JSON.parse(f.options) as string[]) : null,
      correctOptionIndex: f.correctOptionIndex,
      answer: answer
        ? {
            answerText: answer.answerText,
            selectedOptionIndex: answer.selectedOptionIndex,
            isCorrect: answer.isCorrect,
            feedback: answer.feedback,
            skipped: answer.skipped,
          }
        : null,
    };
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{document.title} — Repaso</h1>
      <DocumentReviewView fragments={fragments} />
    </div>
  );
}
