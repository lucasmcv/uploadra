import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStaleFailureMessage } from "@/lib/processing-watchdog";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const document = await prisma.document.findUnique({
    where: { id },
    include: { _count: { select: { fragments: true } } },
  });

  if (!document || document.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const staleMessage = getStaleFailureMessage(document.status, document.updatedAt);
  if (staleMessage) {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "failed", errorMessage: staleMessage },
    });
    document.status = "failed";
    document.errorMessage = staleMessage;
  }

  return NextResponse.json({ document });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document || document.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const body = await req.json();
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Falta el campo 'enabled'." }, { status: 400 });
  }

  const updated = await prisma.document.update({
    where: { id },
    data: { enabled: body.enabled },
  });

  return NextResponse.json({ document: updated });
}
