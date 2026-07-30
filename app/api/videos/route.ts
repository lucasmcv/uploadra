import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage";
import { QuestionMode, VideoStatus } from "@/lib/types";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { parseYoutubeTranscript, type ParsedTranscriptSegment } from "@/lib/youtube-transcript";
import { normalizeTranscriptWithGemini } from "@/lib/gemini-video-transcript";
import { generateQuestions, verifyQuestionCorrespondence } from "@/lib/questions";
import { billingBlockResponse } from "@/lib/billing";
import { getGeminiApiKeyForUser } from "@/lib/gemini-key";
import { isDailyQuotaExhausted, quotaExhaustedMessage } from "@/lib/gemini-retry";

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

/**
 * A video/audio "study sheet": source (YouTube link or an uploaded file) +
 * a pasted transcript with timestamps (from YouTube's own panel,
 * TurboScribe, etc. — nothing is transcribed server-side anymore). Each
 * segment gets an LLM-generated question, and the whole thing is created
 * synchronously — there's no long-running transcription job left to make
 * this async, so the response already contains the finished video.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const billingBlock = await billingBlockResponse(session.user.id);
  if (billingBlock) return billingBlock;

  const formData = await req.formData();
  const titleOverride = formData.get("title");
  const transcriptInput = formData.get("transcript");
  const youtubeUrlInput = formData.get("youtubeUrl");
  const fileInput = formData.get("file");

  if (typeof transcriptInput !== "string" || !transcriptInput.trim()) {
    return NextResponse.json({ error: "Pegá la transcripción con tiempos." }, { status: 400 });
  }

  const apiKey = await getGeminiApiKeyForUser(session.user.id);

  let parsedSegments = parseYoutubeTranscript(transcriptInput);
  if (parsedSegments.length === 0) {
    try {
      parsedSegments = await normalizeTranscriptWithGemini(transcriptInput, apiKey);
    } catch (err) {
      if (isDailyQuotaExhausted(err)) {
        return NextResponse.json({ error: quotaExhaustedMessage() }, { status: 429 });
      }
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

  if (typeof youtubeUrlInput === "string" && youtubeUrlInput.trim()) {
    return handleYoutubeCreate(youtubeUrlInput.trim(), parsedSegments, session.user.id, titleOverride, apiKey);
  }

  if (fileInput instanceof File) {
    return handleUploadCreate(fileInput, parsedSegments, session.user.id, titleOverride, apiKey);
  }

  return NextResponse.json(
    { error: "Falta el link de YouTube o el archivo de video/audio." },
    { status: 400 }
  );
}

/** Shared by both sources: generate a question per segment, then persist
 * video + segments in one shot (already "ready" — nothing async left).
 * A segment can legitimately end up with no question at all — e.g. a
 * personal anecdote with no factual content — see allowSkipping on
 * generateQuestions. Segments without a question just don't show up as
 * a Q&A item (see components/videos/VideoQAView.tsx). */
async function buildSegmentsWithQuestions(segments: ParsedTranscriptSegment[], apiKey: string | null) {
  const fragmentsForQuestions = segments.map((s, i) => ({ orderIndex: i, text: s.text }));
  const questions = await generateQuestions(fragmentsForQuestions, QuestionMode.Open, apiKey, {
    allowSkipping: true,
  });
  await verifyQuestionCorrespondence(fragmentsForQuestions, questions, QuestionMode.Open, apiKey);

  return segments.map((s, i) => ({
    orderIndex: i,
    startTime: s.startTime,
    endTime: s.endTime,
    transcriptText: s.text,
    question: questions.get(i)?.question ?? null,
  }));
}

async function handleYoutubeCreate(
  youtubeUrl: string,
  segments: ParsedTranscriptSegment[],
  ownerId: string,
  titleOverride: FormDataEntryValue | null,
  apiKey: string | null
) {
  const youtubeVideoId = extractYouTubeVideoId(youtubeUrl);
  if (!youtubeVideoId) {
    return NextResponse.json(
      { error: "No se pudo reconocer un ID de video de YouTube en ese link." },
      { status: 400 }
    );
  }

  const segmentsData = await buildSegmentsWithQuestions(segments, apiKey);

  const video = await prisma.video.create({
    data: {
      id: randomUUID(),
      ownerId,
      title:
        typeof titleOverride === "string" && titleOverride.trim()
          ? titleOverride
          : `Video de YouTube (${youtubeVideoId})`,
      sourceType: "youtube",
      youtubeVideoId,
      status: VideoStatus.Ready,
      segments: { create: segmentsData },
    },
  });

  return NextResponse.json({ video }, { status: 201 });
}

async function handleUploadCreate(
  file: File,
  segments: ParsedTranscriptSegment[],
  ownerId: string,
  titleOverride: FormDataEntryValue | null,
  apiKey: string | null
) {
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
    return NextResponse.json({ error: "El archivo debe ser un video o audio." }, { status: 400 });
  }

  const videoId = randomUUID();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const storageKey = `videos/${ownerId}/${videoId}/source.${extension}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await getStorageDriver().putObject(storageKey, buffer, file.type);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo guardar el archivo." },
      { status: 500 }
    );
  }

  const segmentsData = await buildSegmentsWithQuestions(segments, apiKey);

  const video = await prisma.video.create({
    data: {
      id: videoId,
      ownerId,
      title: typeof titleOverride === "string" && titleOverride.trim() ? titleOverride : file.name,
      sourceType: "upload",
      storageKey,
      mimeType: file.type,
      status: VideoStatus.Ready,
      segments: { create: segmentsData },
    },
  });

  return NextResponse.json({ video }, { status: 201 });
}
