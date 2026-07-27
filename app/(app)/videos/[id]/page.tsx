import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { VideoStatusView } from "@/components/videos/VideoStatusView";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const video = await prisma.video.findUnique({
    where: { id },
    include: { _count: { select: { segments: true } } },
  });
  if (!video || video.ownerId !== session!.user.id) {
    notFound();
  }

  return (
    <div className="max-w-lg">
      <VideoStatusView initialVideo={video} />
    </div>
  );
}
