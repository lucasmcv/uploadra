"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const router = useRouter();
  const [source, setSource] = useState<"file" | "youtube">("file");
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTranscript, setYoutubeTranscript] = useState("");
  const [showManualTranscript, setShowManualTranscript] = useState(false);
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
    if (source === "youtube" && showManualTranscript && !youtubeTranscript.trim()) {
      setError("Pegá el texto de la transcripción de YouTube primero.");
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    if (source === "file") {
      formData.append("file", file!);
    } else {
      formData.append("youtubeUrl", youtubeUrl.trim());
      if (showManualTranscript) {
        formData.append("youtubeTranscript", youtubeTranscript);
      }
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
        <div className="flex flex-col gap-3">
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
              Se transcribe automáticamente con IA; el reproductor sigue siendo el embed oficial de
              YouTube (no se descarga ni se re-aloja nada).
            </p>
          </div>

          {!showManualTranscript ? (
            <button
              type="button"
              onClick={() => setShowManualTranscript(true)}
              className="text-xs text-gray-500 underline self-start"
            >
              ¿Falló la transcripción automática? Pegarla manualmente
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setShowManualTranscript(false)}
                className="text-xs text-gray-500 underline self-start"
              >
                Volver a la transcripción automática
              </button>
              <div className="text-xs text-gray-600 bg-gray-50 border rounded p-3 flex flex-col gap-1">
                <p className="font-medium text-gray-700">Cómo conseguir el texto (1 minuto):</p>
                <ol className="list-decimal list-inside flex flex-col gap-0.5">
                  <li>Abrí el video en YouTube, en otra pestaña.</li>
                  <li>
                    Debajo del video, buscá el botón <strong>&quot;Mostrar transcripción&quot;</strong>{" "}
                    (si no lo ves, desplegá primero &quot;Más&quot;).
                  </li>
                  <li>Hacé clic ahí para abrir el panel con el texto y los tiempos.</li>
                  <li>
                    Hacé clic dentro del panel, seleccioná todo (Ctrl+A) y copialo (Ctrl+C).
                  </li>
                  <li>Pegalo (Ctrl+V) en el cuadro de abajo.</li>
                </ol>
              </div>
              <label htmlFor="youtubeTranscript" className="text-sm font-medium">
                Transcripción pegada
              </label>
              <textarea
                id="youtubeTranscript"
                value={youtubeTranscript}
                onChange={(e) => setYoutubeTranscript(e.target.value)}
                rows={8}
                placeholder={"0:00\ntexto del primer segmento\n0:15\ntexto del segmento siguiente..."}
                className="border rounded px-3 py-2 font-mono text-xs"
              />
            </div>
          )}
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
