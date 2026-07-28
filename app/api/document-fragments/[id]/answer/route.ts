import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateOpenAnswer } from "@/lib/grading";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id: fragmentId } = await params;
  const fragment = await prisma.fragment.findUnique({
    where: { id: fragmentId },
    include: { document: true },
  });

  if (!fragment || fragment.document.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const { answerText, selectedOptionIndex, skipped } = (await req.json()) as {
    answerText?: string | null;
    selectedOptionIndex?: number | null;
    skipped?: boolean;
  };

  let grading: { isCorrect: boolean; feedback: string } | null = null;
  if (!skipped && selectedOptionIndex == null && answerText) {
    grading = await evaluateOpenAnswer(fragment.text, answerText);
  }

  const data = {
    answerText: skipped ? null : (answerText ?? null),
    selectedOptionIndex: skipped ? null : (selectedOptionIndex ?? null),
    isCorrect: skipped ? null : (grading?.isCorrect ?? null),
    feedback: skipped ? null : (grading?.feedback ?? null),
    skipped: Boolean(skipped),
    submittedAt: new Date(),
  };

  const answer = await prisma.docAnswer.upsert({
    where: { fragmentId_userId: { fragmentId, userId: session.user.id } },
    create: { fragmentId, userId: session.user.id, ...data },
    update: data,
  });

  return NextResponse.json({ answer });
}
