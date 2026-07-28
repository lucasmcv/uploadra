"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const router = useRouter();
  const [source, setSource] = useState<"file" | "youtube">("file");
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [questionMode, setQuestionMode] = useState<"open" | "mcq">("open");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (source === "file" && !file) {
      setError("Elegí un archivo de video o audio primero.");
      return;
    }
    if (source === "youtube" && !youtubeUrl.trim()) {
      setError("Pegá un link de YouTube primero.");
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    if (source === "file") {
      formData.append("file", file!);
    } else {
      formData.append("youtubeUrl", youtubeUrl.trim());
    }
    if (title.trim()) formData.append("title", title.trim());
    formData.append("questionMode", questionMode);

    const res = await fetch("/api/videos", { method: "POST", body: formData });

    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "No se pudo subir el video.");
      return;
    }

    const { video } = await res.json();
    router.push(`/videos/${video.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-1">Fuente</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="source"
            checked={source === "file"}
            onChange={() => setSource("file")}
          />
          Subir archivo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="source"
            checked={source === "youtube"}
            onChange={() => setSource("youtube")}
          />
          Link de YouTube
        </label>
      </fieldset>

      {source === "file" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="file" className="text-sm font-medium">
            Archivo de video o audio
          </label>
          <input
            id="file"
            type="file"
            accept="video/*,audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="border rounded px-3 py-2"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="youtubeUrl" className="text-sm font-medium">
            Link de YouTube
          </label>
          <input
            id="youtubeUrl"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-500">
            El video se reproduce embebido desde YouTube (no se descarga ni se re-aloja); solo el
            audio se procesa de forma transitoria para transcribirlo.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium">
          Título (opcional)
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-1">Tipo de pregunta</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="questionMode"
            value="open"
            checked={questionMode === "open"}
            onChange={() => setQuestionMode("open")}
          />
          Preguntas abiertas (escribís la respuesta)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="questionMode"
            value="mcq"
            checked={questionMode === "mcq"}
            onChange={() => setQuestionMode("mcq")}
          />
          Opción múltiple (A/B/C/D)
        </label>
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={uploading}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 w-fit"
      >
        {uploading ? "Subiendo…" : "Subir"}
      </button>
    </form>
  );
}
