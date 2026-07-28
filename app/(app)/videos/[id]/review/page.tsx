import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ReviewPlayer } from "@/components/player/ReviewPlayer";

export default async function ReviewPage({
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

  const segments = video.segments.map((s) => {
    const answer = s.answers[0];
    return {
      id: s.id,
      orderIndex: s.orderIndex,
      startTime: s.startTime,
      endTime: s.endTime,
      transcriptText: s.transcriptText,
      question: s.question,
      options: s.options ? (JSON.parse(s.options) as string[]) : null,
      correctOptionIndex: s.correctOptionIndex,
      answer: answer
        ? {
            answerText: answer.answerText,
            selectedOptionIndex: answer.selectedOptionIndex,
            skipped: answer.skipped,
          }
        : null,
    };
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{video.title} — Repaso</h1>
      <ReviewPlayer
        videoSrc={video.sourceType === "youtube" ? undefined : `/api/videos/${id}/stream`}
        youtubeVideoId={video.sourceType === "youtube" ? (video.youtubeVideoId ?? undefined) : undefined}
        segments={segments}
      />
    </div>
  );
}
