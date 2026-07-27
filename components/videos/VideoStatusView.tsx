"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface VideoData {
  id: string;
  title: string;
  status: string;
  errorMessage: string | null;
  _count?: { segments: number };
}

const STATUS_LABELS: Record<string, string> = {
  uploading: "Subiendo…",
  transcribing: "Transcribiendo…",
  ready: "Listo",
  failed: "Falló",
};

export function VideoStatusView({ initialVideo }: { initialVideo: VideoData }) {
  const [video, setVideo] = useState(initialVideo);

  useEffect(() => {
    if (video.status !== "uploading" && video.status !== "transcribing") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/videos/${video.id}`);
      if (!res.ok) return;
      const { video: updated } = await res.json();
      setVideo(updated);
    }, 3000);

    return () => clearInterval(interval);
  }, [video.id, video.status]);

  const isProcessing = video.status === "uploading" || video.status === "transcribing";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{video.title}</h1>
      <p className="text-sm text-gray-600 flex items-center gap-2">
        Estado: {STATUS_LABELS[video.status] ?? video.status}
        {isProcessing && (
          <span className="inline-block h-3 w-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        )}
      </p>
      {video.status === "failed" && video.errorMessage && (
        <p className="text-sm text-red-600">{video.errorMessage}</p>
      )}
      {video.status === "ready" && (
        <div className="flex gap-3">
          <Link href={`/videos/${video.id}/practice`} className="bg-black text-white rounded px-3 py-2">
            Practicar
          </Link>
          <Link href={`/videos/${video.id}/review`} className="border rounded px-3 py-2">
            Repasar
          </Link>
        </div>
      )}
    </div>
  );
}
