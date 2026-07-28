import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PracticePlayer } from "@/components/player/PracticePlayer";
import type { AnswerState } from "@/hooks/usePracticePlayback";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const video = await prisma.video.findUnique({
    where: { id },
    include: {
      segments: {
        orderBy: { orderIndex: "asc" },
        include: { answers: { where: { userId: session!.user.id } } },
      },
    },
  });

  if (!video || video.ownerId !== session!.user.id) {
    notFound();
  }

  if (video.status !== "ready") {
    redirect(`/videos/${id}`);
  }

  const segments = video.segments.map((s) => ({
    id: s.id,
    orderIndex: s.orderIndex,
    startTime: s.startTime,
    endTime: s.endTime,
    transcriptText: s.transcriptText,
    question: s.question,
    options: s.options ? (JSON.parse(s.options) as string[]) : null,
    correctOptionIndex: s.correctOptionIndex,
  }));

  const initialAnswers: Record<string, AnswerState> = {};
  for (const s of video.segments) {
    const answer = s.answers[0];
    if (answer) {
      initialAnswers[s.id] = {
        answerText: answer.answerText,
        selectedOptionIndex: answer.selectedOptionIndex,
        skipped: answer.skipped,
      };
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-4">{video.title} — Práctica</h1>
      <PracticePlayer
        videoSrc={video.sourceType === "youtube" ? undefined : `/api/videos/${id}/stream`}
        youtubeVideoId={video.sourceType === "youtube" ? (video.youtubeVideoId ?? undefined) : undefined}
        segments={segments}
        initialAnswers={initialAnswers}
      />
    </div>
  );
}
