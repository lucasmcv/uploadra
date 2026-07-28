import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStaleFailureMessage } from "@/lib/processing-watchdog";
import { VideoList } from "@/components/videos/VideoList";

export default async function VideosPage() {
  const session = await auth();
  const videos = await prisma.video.findMany({
    where: { ownerId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  for (const video of videos) {
    const staleMessage = getStaleFailureMessage(video.status, video.updatedAt);
    if (staleMessage) {
      await prisma.video.update({
        where: { id: video.id },
        data: { status: "failed", errorMessage: staleMessage },
      });
      video.status = "failed";
      video.errorMessage = staleMessage;
    }
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-gray-600">Todavía no subiste ningún video o audio.</p>
        <Link href="/upload" className="bg-black text-white rounded px-4 py-2">
          Subir tu primer video
        </Link>
      </div>
    );
  }

  return (
    <VideoList
      videos={videos.map((v) => ({
        id: v.id,
        title: v.title,
        status: v.status,
      }))}
    />
  );
}
