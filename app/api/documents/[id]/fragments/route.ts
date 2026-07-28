import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document || document.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const fragments = await prisma.fragment.findMany({
    where: { documentId: id },
    orderBy: { orderIndex: "asc" },
    include: {
      answers: { where: { userId: session.user.id } },
    },
  });

  const result = fragments.map((fragment) => {
    const answer = fragment.answers[0];
    return {
      id: fragment.id,
      orderIndex: fragment.orderIndex,
      page: fragment.page,
      lineStart: fragment.lineStart,
      lineEnd: fragment.lineEnd,
      text: fragment.text,
      question: fragment.question,
      options: fragment.options ? (JSON.parse(fragment.options) as string[]) : null,
      correctOptionIndex: fragment.correctOptionIndex,
      answer: answer
        ? {
            answerText: answer.answerText,
            selectedOptionIndex: answer.selectedOptionIndex,
            isCorrect: answer.isCorrect,
            feedback: answer.feedback,
            skipped: answer.skipped,
            submittedAt: answer.submittedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ fragments: result });
}
