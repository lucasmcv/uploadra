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

  const data = {
    answerText: skipped ? null : (answerText ?? null),
    selectedOptionIndex: skipped ? null : (selectedOptionIndex ?? null),
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
