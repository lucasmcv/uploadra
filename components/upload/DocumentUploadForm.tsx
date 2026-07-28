"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DocumentUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [questionMode, setQuestionMode] = useState<"open" | "mcq">("open");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Elegí un archivo .txt primero.");
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) formData.append("title", title.trim());
    formData.append("questionMode", questionMode);

    const res = await fetch("/api/documents", { method: "POST", body: formData });

    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "No se pudo subir el documento.");
      return;
    }

    const { document } = await res.json();
    router.push(`/documents/${document.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
      <p className="text-sm text-gray-600">
        Por ahora solo se admiten archivos <code>.txt</code> (PDF/DOCX próximamente). Como el texto
        plano no tiene páginas reales, todas las referencias usan la página 1 y números de línea
        reales del archivo.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor="doc-file" className="text-sm font-medium">
          Archivo de texto (.txt)
        </label>
        <input
          id="doc-file"
          type="file"
          accept=".txt,text/plain"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="doc-title" className="text-sm font-medium">
          Título (opcional)
        </label>
        <input
          id="doc-title"
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
            name="doc-questionMode"
            value="open"
            checked={questionMode === "open"}
            onChange={() => setQuestionMode("open")}
          />
          Preguntas abiertas (escribís la respuesta)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="doc-questionMode"
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
        {uploading ? "Procesando… (puede tardar según el tamaño del texto)" : "Subir"}
      </button>
    </form>
  );
}
