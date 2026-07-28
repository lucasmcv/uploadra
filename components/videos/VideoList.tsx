"use client";

import { useState } from "react";
import Link from "next/link";

export interface VideoListItem {
  id: string;
  title: string;
  status: string;
}

export function VideoList({ videos: initialVideos }: { videos: VideoListItem[] }) {
  const [videos, setVideos] = useState(initialVideos);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteVideo(id: string, title: string) {
    if (!window.confirm(`¿Borrar "${title}" definitivamente? Se elimina el archivo, la transcripción, las preguntas y tus respuestas. No se puede deshacer.`)) {
      return;
    }
    setDeletingId(id);
    await fetch(`/api/videos/${id}`, { method: "DELETE" });
    setVideos((prev) => prev.filter((v) => v.id !== id));
    setDeletingId(null);
  }

  return (
    <ul className="flex flex-col gap-3 max-w-2xl">
      {videos.map((video) => (
        <li key={video.id} className="border rounded px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-medium">{video.title}</p>
            <p className="text-sm text-gray-500">{video.status}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href={`/videos/${video.id}`} className="underline text-sm">
              Ver
            </Link>
            <button
              type="button"
              onClick={() => deleteVideo(video.id, video.title)}
              disabled={deletingId === video.id}
              className="text-sm text-red-600 underline disabled:opacity-50"
            >
              {deletingId === video.id ? "Borrando..." : "Borrar"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
