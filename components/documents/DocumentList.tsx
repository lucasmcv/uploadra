"use client";

import { useState } from "react";
import Link from "next/link";

export interface DocumentListItem {
  id: string;
  title: string;
  status: string;
  enabled: boolean;
}

export function DocumentList({ documents: initialDocuments }: { documents: DocumentListItem[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [showDisabled, setShowDisabled] = useState(false);

  async function toggleEnabled(id: string, enabled: boolean) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, enabled } : d)));
    await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  const visibleDocuments = documents.filter((d) => showDisabled || d.enabled);
  const disabledCount = documents.filter((d) => !d.enabled).length;

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
        {visibleDocuments.map((document) => (
          <li
            key={document.id}
            className={`border rounded px-4 py-3 flex items-center justify-between ${
              document.enabled ? "" : "opacity-50"
            }`}
          >
            <div>
              <p className="font-medium">{document.title}</p>
              <p className="text-sm text-gray-500">{document.status}</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={document.enabled}
                  onChange={(e) => toggleEnabled(document.id, e.target.checked)}
                />
                {document.enabled ? "Encendido" : "Apagado"}
              </label>
              <Link href={`/documents/${document.id}`} className="underline text-sm">
                Ver
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
