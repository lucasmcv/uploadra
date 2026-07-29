"use client";

import { useRef } from "react";
import Link from "next/link";

interface SegmentData {
  id: string;
  orderIndex: number;
  startTime: number;
  endTime: number;
  transcriptText: string;
  question: string | null;
}

interface VideoData {
  id: string;
  title: string;
  sourceType: string;
  youtubeVideoId: string | null;
  storageKey: string | null;
  mimeType: string | null;
  status: string;
  errorMessage: string | null;
  segments: SegmentData[];
}

function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoQAView({ video }: { video: VideoData }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  if (video.status === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{video.title}</h1>
        <p className="text-sm text-red-600">{video.errorMessage ?? "Falló el procesamiento."}</p>
      </div>
    );
  }

  const isYoutube = video.sourceType === "youtube" && Boolean(video.youtubeVideoId);
  const isUpload = video.sourceType === "upload" && Boolean(video.storageKey);
  const isAudioUpload = isUpload && video.mimeType?.startsWith("audio/");

  function seekTo(startTime: number) {
    const el = videoRef.current ?? audioRef.current;
    if (!el) return;
    el.currentTime = startTime;
    el.play();
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/videos" className="text-sm text-gray-500 underline self-start">
        ← Mis videos
      </Link>
      <h1 className="text-xl font-semibold">{video.title}</h1>

      {isYoutube && (
        <div className="aspect-video w-full">
          <iframe
            className="w-full h-full rounded"
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeVideoId}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {isUpload && isAudioUpload && (
        <audio ref={audioRef} controls src={`/api/videos/${video.id}/stream`} className="w-full" />
      )}
      {isUpload && !isAudioUpload && (
        <video ref={videoRef} controls src={`/api/videos/${video.id}/stream`} className="w-full rounded" />
      )}

      <ol className="flex flex-col gap-3">
        {video.segments.map((segment) => (
          <li key={segment.id} className="border rounded p-3 flex flex-col gap-1">
            <p className="text-sm font-medium">{segment.question ?? "¿Qué se dice en este fragmento?"}</p>
            <p className="text-sm text-gray-600">
              {formatTimestamp(segment.startTime)} -{" "}
              {isYoutube ? (
                <a
                  href={`https://www.youtube.com/watch?v=${video.youtubeVideoId}&t=${Math.floor(segment.startTime)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  youtube.com/watch?v={video.youtubeVideoId}&amp;t={Math.floor(segment.startTime)}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => seekTo(segment.startTime)}
                  className="text-blue-600 underline"
                >
                  ▶ Escuchar este fragmento
                </button>
              )}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
