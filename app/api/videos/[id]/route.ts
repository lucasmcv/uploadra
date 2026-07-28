import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStaleFailureMessage } from "@/lib/processing-watchdog";
import { getStorageDriver } from "@/lib/storage";

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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  // uploads store the source file in object storage; youtube videos never
  // do (playback is via the embedded player, audio was only ever transient)
  if (video.storageKey) {
    await getStorageDriver().deleteObject(video.storageKey);
  }

  // segments/answers cascade via the DB foreign keys
  await prisma.video.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
