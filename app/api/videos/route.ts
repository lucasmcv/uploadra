import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage";
import { QuestionMode, VideoSourceType, VideoStatus } from "@/lib/types";
import { triggerTranscription } from "@/lib/worker-client";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { parseYoutubeTranscript, type ParsedTranscriptSegment } from "@/lib/youtube-transcript";
import { transcribeYoutubeWithGemini, normalizeTranscriptWithGemini } from "@/lib/gemini-video-transcript";
import { backfillMissingQuestions, generateQuestions, verifyQuestionCorrespondence } from "@/lib/questions";
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
    const transcriptInput = formData.get("youtubeTranscript");
    if (typeof transcriptInput === "string" && transcriptInput.trim()) {
      return handleYouTubeTranscriptUpload(
        youtubeUrlInput.trim(),
        transcriptInput,
        session.user.id,
        titleOverride,
        questionMode
      );
    }
    return handleYouTubeAutoTranscribeUpload(
      youtubeUrlInput.trim(),
      session.user.id,
      titleOverride,
      questionMode
    );
  }

  return handleFileUpload(formData, session.user.id, titleOverride, questionMode);
}

/** Shared by both YouTube ingestion paths: generate+verify questions for the
 * given segments, then persist them and flip the video to Ready — or to
 * Failed with the underlying error message if anything in there throws. */
async function persistSegmentsAndFinish(
  videoId: string,
  questionMode: QuestionMode,
  segments: ParsedTranscriptSegment[],
  failureMessage: string
): Promise<void> {
  try {
    const fragmentsForQuestions = segments.map((s, i) => ({ orderIndex: i, text: s.text }));
    const questions = await generateQuestions(fragmentsForQuestions, questionMode);
    backfillMissingQuestions(fragmentsForQuestions, questions);
    await verifyQuestionCorrespondence(fragmentsForQuestions, questions, questionMode);

    await prisma.$transaction([
      prisma.segment.createMany({
        data: segments.map((s, i) => {
          const generated = questions.get(i);
          return {
            videoId,
            orderIndex: i,
            startTime: s.startTime,
            endTime: s.endTime,
            transcriptText: s.text,
            question: generated?.question ?? null,
            options: generated?.options ? JSON.stringify(generated.options) : null,
            correctOptionIndex: generated?.correctOptionIndex ?? null,
          };
        }),
      }),
      prisma.video.update({ where: { id: videoId }, data: { status: VideoStatus.Ready } }),
    ]);
  } catch (err) {
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: VideoStatus.Failed,
        errorMessage: err instanceof Error ? err.message : failureMessage,
      },
    });
  }
}

async function handleYouTubeTranscriptUpload(
  youtubeUrl: string,
  transcriptText: string,
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

  let parsedSegments = parseYoutubeTranscript(transcriptText);

  if (parsedSegments.length === 0) {
    try {
      parsedSegments = await normalizeTranscriptWithGemini(transcriptText);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            "No pudimos reconocer texto con marcas de tiempo en lo que pegaste. Asegúrate de pegar " +
            "exactamente lo que copiaste de: (1) el panel 'Mostrar transcripción' de YouTube (con tiempos incluidos), " +
            "o (2) la salida de TurboScribe con tiempos entre paréntesis como '(0:15) texto...'. " +
            `Detalles: ${err instanceof Error ? err.message : "Error desconocido"}`,
        },
        { status: 400 }
      );
    }
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

  await persistSegmentsAndFinish(
    video.id,
    questionMode,
    parsedSegments,
    "El video se guardó, pero falló la generación de preguntas a partir de la transcripción."
  );

  const ready = await prisma.video.findUnique({ where: { id: video.id } });
  return NextResponse.json({ video: ready }, { status: 201 });
}

/**
 * Automatic path: Gemini's API accepts a public YouTube URL directly as
 * video input (Google's own infrastructure fetches it, not our server), so
 * this transcribes the video without ever touching YouTube ourselves —
 * unlike the old worker/yt-dlp path, which datacenter IPs get blocked from.
 * Transcription can take a while for long videos (chunked into several
 * sequential Gemini calls — see lib/gemini-video-transcript.ts), so this
 * responds immediately with the video in "Transcribing" status and finishes
 * the work in the background; the frontend already polls for status.
 */
async function handleYouTubeAutoTranscribeUpload(
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

  transcribeYoutubeWithGemini(youtubeUrl)
    .then((segments) =>
      persistSegmentsAndFinish(
        video.id,
        questionMode,
        segments,
        "No se pudo transcribir este video automáticamente."
      )
    )
    .catch((err) =>
      prisma.video.update({
        where: { id: video.id },
        data: {
          status: VideoStatus.Failed,
          errorMessage:
            err instanceof Error ? err.message : "No se pudo transcribir este video automáticamente.",
        },
      })
    );

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
