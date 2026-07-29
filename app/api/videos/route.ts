import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage";
import { QuestionMode, VideoSourceType, VideoStatus } from "@/lib/types";
import { triggerTranscription } from "@/lib/worker-client";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { billingBlockResponse } from "@/lib/billing";

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
  const billingBlock = await billingBlockResponse(session.user.id);
  if (billingBlock) return billingBlock;

  const formData = await req.formData();
  const titleOverride = formData.get("title");
  const questionModeInput = formData.get("questionMode");
  const questionMode =
    questionModeInput === QuestionMode.Mcq ? QuestionMode.Mcq : QuestionMode.Open;

  const youtubeUrlInput = formData.get("youtubeUrl");
  if (typeof youtubeUrlInput === "string" && youtubeUrlInput.trim()) {
    return handleYouTubeUpload(youtubeUrlInput.trim(), session.user.id, titleOverride, questionMode);
  }

  return handleFileUpload(formData, session.user.id, titleOverride, questionMode);
}

async function handleYouTubeUpload(
  youtubeUrl: string,
  ownerId: string,
  titleOverride: FormDataEntryValue | null,
  questionMode: QuestionMode
) {
  const youtubeVideoId = extractYouTubeVideoId(youtubeUrl);
  if (!youtubeVideoId) {
    return NextResponse.json(
      { error: "No se pudo reconocer un ID de video de YouTube en ese link." },
      { status: 400 }
    );
  }

  const videoId = randomUUID();
  const video = await prisma.video.create({
    data: {
      id: videoId,
      ownerId,
      title:
        typeof titleOverride === "string" && titleOverride.trim()
          ? titleOverride
          : `Video de YouTube (${youtubeVideoId})`,
      sourceType: VideoSourceType.YouTube,
      youtubeVideoId,
      status: VideoStatus.Transcribing,
      questionMode,
    },
  });

  try {
    await triggerTranscription(video.id, { youtubeVideoId });
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
      { error: "No se pudo iniciar la transcripción del video de YouTube." },
      { status: 502 }
    );
  }

  return NextResponse.json({ video }, { status: 201 });
}

async function handleFileUpload(
  formData: FormData,
  ownerId: string,
  titleOverride: FormDataEntryValue | null,
  questionMode: QuestionMode
) {
  const file = formData.get("file");

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
  const storageKey = `videos/${ownerId}/${videoId}/source.${extension}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const video = await prisma.video.create({
    data: {
      id: videoId,
      ownerId,
      title: typeof titleOverride === "string" && titleOverride.trim() ? titleOverride : file.name,
      sourceType: VideoSourceType.Upload,
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
    await triggerTranscription(video.id, { storageKey });
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
