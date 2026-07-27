import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const segments = await prisma.segment.findMany({
    where: { videoId: id },
    orderBy: { orderIndex: "asc" },
    include: {
      answers: { where: { userId: session.user.id } },
    },
  });

  const result = segments.map((segment) => {
    const answer = segment.answers[0];
    return {
      id: segment.id,
      orderIndex: segment.orderIndex,
      startTime: segment.startTime,
      endTime: segment.endTime,
      transcriptText: segment.transcriptText,
      question: segment.question,
      options: segment.options ? (JSON.parse(segment.options) as string[]) : null,
      correctOptionIndex: segment.correctOptionIndex,
      answer: answer
        ? {
            answerText: answer.answerText,
            selectedOptionIndex: answer.selectedOptionIndex,
            skipped: answer.skipped,
            submittedAt: answer.submittedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ segments: result });
}
