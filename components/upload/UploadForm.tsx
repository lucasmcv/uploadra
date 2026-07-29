"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const router = useRouter();
  const [source, setSource] = useState<"youtube" | "file">("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (source === "youtube" && !youtubeUrl.trim()) {
      setError("Pegá un link de YouTube primero.");
      return;
    }
    if (source === "file" && !file) {
      setError("Elegí un archivo de video o audio primero.");
      return;
    }
    if (!transcript.trim()) {
      setError("Pegá la transcripción con tiempos primero.");
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    if (source === "youtube") {
      formData.append("youtubeUrl", youtubeUrl.trim());
    } else {
      formData.append("file", file!);
    }
    formData.append("transcript", transcript);
    if (title.trim()) formData.append("title", title.trim());

    const res = await fetch("/api/videos", { method: "POST", body: formData });

    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "No se pudo crear el video.");
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
            checked={source === "youtube"}
            onChange={() => setSource("youtube")}
          />
          Link de YouTube
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="source"
            checked={source === "file"}
            onChange={() => setSource("file")}
          />
          Subir archivo de video/audio
        </label>
      </fieldset>

      {source === "youtube" ? (
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
        </div>
      ) : (
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
      )}

      <div className="flex flex-col gap-1">
        <div className="text-sm text-gray-700 bg-gray-50 border rounded p-4 flex flex-col gap-2">
          <p className="font-semibold text-gray-800">
            Paso a paso para conseguir la transcripción (no hace falta saber de tecnología, son 5 pasos):
          </p>
          <button
            type="button"
            onClick={() => window.open("https://turboscribe.ai/", "_blank")}
            className="bg-blue-600 text-white rounded px-4 py-2 font-medium self-start"
          >
            1. Abrir TurboScribe en una ventana nueva
          </button>
          <ol start={2} className="list-decimal list-inside flex flex-col gap-1.5 ml-1">
            <li>
              En esa pestaña nueva, pegá el link de YouTube o subí el mismo archivo que vas a usar acá,
              y esperá a que termine (tarda entre 1 y 3 minutos — vas a ver aparecer el texto solo).
            </li>
            <li>
              Hacé clic con el mouse en cualquier parte del texto que apareció, y después apretá al
              mismo tiempo las teclas <strong>Ctrl</strong> y <strong>A</strong> (esto selecciona todo el
              texto — se va a ver marcado/resaltado).
            </li>
            <li>
              Con el texto todavía seleccionado, apretá al mismo tiempo <strong>Ctrl</strong> y{" "}
              <strong>C</strong> (esto lo copia — no vas a ver ningún cambio en la pantalla, es normal).
            </li>
            <li>
              Volvé a esta página, hacé clic dentro del cuadro de abajo (&quot;Transcripción
              pegada&quot;) y apretá al mismo tiempo <strong>Ctrl</strong> y <strong>V</strong> (esto
              pega el texto copiado).
            </li>
          </ol>
          <p className="text-gray-600 text-xs">
            No hace falta revisar ni corregir nada del texto — se pega tal cual aparece en TurboScribe.
          </p>
        </div>
        <label htmlFor="transcript" className="text-sm font-medium">
          Transcripción pegada
        </label>
        <textarea
          id="transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={8}
          placeholder="Hacé clic acá y pegá con Ctrl+V el texto que copiaste de TurboScribe..."
          className="border rounded px-3 py-2 font-mono text-xs"
        />
      </div>

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

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={uploading}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 w-fit"
      >
        {uploading ? "Creando…" : "Crear"}
      </button>
    </form>
  );
}
