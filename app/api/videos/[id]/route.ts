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
  const video = await prisma.video.findUnique({
    where: { id },
    include: { _count: { select: { segments: true } } },
  });

  if (!video || video.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const staleMessage = getStaleFailureMessage(video.status, video.updatedAt);
  if (staleMessage) {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "failed", errorMessage: staleMessage },
    });
    video.status = "failed";
    video.errorMessage = staleMessage;
  }

  return NextResponse.json({ video });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const body = await req.json();
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Falta el campo 'enabled'." }, { status: 400 });
  }

  const updated = await prisma.video.update({
    where: { id },
    data: { enabled: body.enabled },
  });

  return NextResponse.json({ video: updated });
}
