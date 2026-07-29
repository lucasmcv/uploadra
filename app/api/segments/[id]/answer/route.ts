import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { billingBlockResponse } from "@/lib/billing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const billingBlock = await billingBlockResponse(session.user.id);
  if (billingBlock) return billingBlock;

  const { id: segmentId } = await params;
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
    include: { video: true },
  });

  if (!segment || segment.video.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const { answerText, selectedOptionIndex, skipped } = (await req.json()) as {
    answerText?: string | null;
    selectedOptionIndex?: number | null;
    skipped?: boolean;
  };

  const data = {
    answerText: skipped ? null : (answerText ?? null),
    selectedOptionIndex: skipped ? null : (selectedOptionIndex ?? null),
    skipped: Boolean(skipped),
    submittedAt: new Date(),
  };

  const answer = await prisma.answer.upsert({
    where: { segmentId_userId: { segmentId, userId: session.user.id } },
    create: { segmentId, userId: session.user.id, ...data },
    update: data,
  });

  return NextResponse.json({ answer });
}
