interface TriggerTranscriptionSource {
  storageKey?: string;
  youtubeVideoId?: string;
}

export async function triggerTranscription(
  videoId: string,
  source: TriggerTranscriptionSource
): Promise<void> {
  const workerUrl = process.env.WORKER_URL ?? "http://localhost:8001";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const res = await fetch(`${workerUrl}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_id: videoId,
      storage_key: source.storageKey,
      youtube_video_id: source.youtubeVideoId,
      callback_url: `${appUrl}/api/internal/transcription-callback`,
    }),
  });

  if (!res.ok) {
    throw new Error(`El worker de transcripción respondió ${res.status}`);
  }
}
