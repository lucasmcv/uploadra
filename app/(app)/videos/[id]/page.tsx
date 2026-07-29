import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { VideoQAView } from "@/components/videos/VideoQAView";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const video = await prisma.video.findUnique({
    where: { id },
    include: { segments: { orderBy: { orderIndex: "asc" } } },
  });
  if (!video || video.ownerId !== session!.user.id) {
    notFound();
  }

  return (
    <div className="max-w-2xl">
      <VideoQAView video={video} />
    </div>
  );
}
