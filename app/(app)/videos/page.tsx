import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function VideosPage() {
  const session = await auth();
  const videos = await prisma.video.findMany({
    where: { ownerId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-gray-600">Todavía no subiste ningún video.</p>
        <Link href="/upload" className="bg-black text-white rounded px-4 py-2">
          Subir tu primer video
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3 max-w-2xl">
      {videos.map((video) => (
        <li key={video.id} className="border rounded px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-medium">{video.title}</p>
            <p className="text-sm text-gray-500">{video.status}</p>
          </div>
          <Link href={`/videos/${video.id}`} className="underline text-sm">
            Ver
          </Link>
        </li>
      ))}
    </ul>
  );
}
