"use client";

import { useState } from "react";
import Link from "next/link";

export interface DocumentListItem {
  id: string;
  title: string;
  status: string;
}

export function DocumentList({ documents: initialDocuments }: { documents: DocumentListItem[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteDocument(id: string, title: string) {
    if (!window.confirm(`¿Borrar "${title}" definitivamente? Se eliminan los fragmentos, las preguntas y tus respuestas. No se puede deshacer.`)) {
      return;
    }
    setDeletingId(id);
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setDeletingId(null);
  }

  return (
    <ul className="flex flex-col gap-3 max-w-2xl">
      {documents.map((document) => (
        <li key={document.id} className="border rounded px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-medium">{document.title}</p>
            <p className="text-sm text-gray-500">{document.status}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href={`/documents/${document.id}`} className="underline text-sm">
              Ver
            </Link>
            <button
              type="button"
              onClick={() => deleteDocument(document.id, document.title)}
              disabled={deletingId === document.id}
              className="text-sm text-red-600 underline disabled:opacity-50"
            >
              {deletingId === document.id ? "Borrando..." : "Borrar"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
