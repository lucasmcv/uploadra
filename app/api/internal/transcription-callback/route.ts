import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { VideoStatus } from "@/lib/types";
import { backfillMissingQuestions, generateQuestions, verifyQuestionCorrespondence } from "@/lib/questions";

interface SegmentPayload {
  order_index: number;
  start_time: number;
  end_time: number;
  transcript_text: string;
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.INTERNAL_CALLBACK_SECRET;
  if (expectedSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  const body = await req.json();
  const { video_id, status, segments, error } = body as {
    video_id: string;
    status: "ready" | "failed";
    segments?: SegmentPayload[];
    error?: string;
  };

  if (!video_id || !status) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const video = await prisma.video.findUnique({ where: { id: video_id } });
  if (!video) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  if (status === "failed") {
    await prisma.video.update({
      where: { id: video_id },
      data: { status: VideoStatus.Failed, errorMessage: error ?? "La transcripción falló." },
    });
    return NextResponse.json({ ok: true });
  }

  const fragmentsForQuestions = (segments ?? []).map((s) => ({
    orderIndex: s.order_index,
    text: s.transcript_text,
  }));
  const questionMode = video.questionMode as "open" | "mcq";
  const questions = await generateQuestions(fragmentsForQuestions, questionMode);
  backfillMissingQuestions(fragmentsForQuestions, questions);
  await verifyQuestionCorrespondence(fragmentsForQuestions, questions, questionMode);

  await prisma.$transaction([
    prisma.segment.deleteMany({ where: { videoId: video_id } }),
    prisma.segment.createMany({
      data: (segments ?? []).map((s) => {
        const generated = questions.get(s.order_index);
        return {
          videoId: video_id,
          orderIndex: s.order_index,
          startTime: s.start_time,
          endTime: s.end_time,
          transcriptText: s.transcript_text,
          question: generated?.question ?? null,
          options: generated?.options ? JSON.stringify(generated.options) : null,
          correctOptionIndex: generated?.correctOptionIndex ?? null,
        };
      }),
    }),
    prisma.video.update({
      where: { id: video_id },
      data: { status: VideoStatus.Ready },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
