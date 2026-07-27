import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage";
import { QuestionMode, VideoStatus } from "@/lib/types";
import { triggerTranscription } from "@/lib/worker-client";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const videos = await prisma.video.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ videos });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const titleOverride = formData.get("title");
  const questionModeInput = formData.get("questionMode");
  const questionMode =
    questionModeInput === QuestionMode.Mcq ? QuestionMode.Mcq : QuestionMode.Open;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo de video/audio." }, { status: 400 });
  }

  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
    return NextResponse.json(
      { error: "El archivo debe ser un video o audio." },
      { status: 400 }
    );
  }

  const videoId = randomUUID();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const storageKey = `videos/${session.user.id}/${videoId}/source.${extension}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const video = await prisma.video.create({
    data: {
      id: videoId,
      ownerId: session.user.id,
      title: typeof titleOverride === "string" && titleOverride.trim() ? titleOverride : file.name,
      originalFilename: file.name,
      storageKey,
      mimeType: file.type,
      status: VideoStatus.Uploading,
      questionMode,
    },
  });

  try {
    const storage = getStorageDriver();
    await storage.putObject(storageKey, buffer, file.type);
  } catch (err) {
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: VideoStatus.Failed,
        errorMessage: err instanceof Error ? err.message : "Error al guardar el archivo.",
      },
    });
    return NextResponse.json({ error: "No se pudo guardar el archivo." }, { status: 500 });
  }

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: { status: VideoStatus.Transcribing },
  });

  try {
    await triggerTranscription(video.id, storageKey);
  } catch (err) {
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: VideoStatus.Failed,
        errorMessage:
          err instanceof Error ? err.message : "No se pudo iniciar la transcripción.",
      },
    });
    return NextResponse.json(
      { error: "El archivo se guardó, pero no se pudo iniciar la transcripción." },
      { status: 502 }
    );
  }

  return NextResponse.json({ video: updated }, { status: 201 });
}
