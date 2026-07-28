"use client";

import { useState } from "react";
import Link from "next/link";

export interface VideoListItem {
  id: string;
  title: string;
  status: string;
  enabled: boolean;
}

export function VideoList({ videos: initialVideos }: { videos: VideoListItem[] }) {
  const [videos, setVideos] = useState(initialVideos);
  const [showDisabled, setShowDisabled] = useState(false);

  async function toggleEnabled(id: string, enabled: boolean) {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, enabled } : v)));
    await fetch(`/api/videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  const visibleVideos = videos.filter((v) => showDisabled || v.enabled);
  const disabledCount = videos.filter((v) => !v.enabled).length;

  return (
    <div className="max-w-2xl">
      {disabledCount > 0 && (
        <label className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={(e) => setShowDisabled(e.target.checked)}
          />
          Mostrar apagados ({disabledCount})
        </label>
      )}
      <ul className="flex flex-col gap-3">
        {visibleVideos.map((video) => (
          <li
            key={video.id}
            className={`border rounded px-4 py-3 flex items-center justify-between ${
              video.enabled ? "" : "opacity-50"
            }`}
          >
            <div>
              <p className="font-medium">{video.title}</p>
              <p className="text-sm text-gray-500">{video.status}</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={video.enabled}
                  onChange={(e) => toggleEnabled(video.id, e.target.checked)}
                />
                {video.enabled ? "Encendido" : "Apagado"}
              </label>
              <Link href={`/videos/${video.id}`} className="underline text-sm">
                Ver
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
