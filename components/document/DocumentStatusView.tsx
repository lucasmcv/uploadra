import Link from "next/link";

interface DocumentData {
  id: string;
  title: string;
  status: string;
  errorMessage: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  processing: "Procesando…",
  ready: "Listo",
  failed: "Falló",
};

export function DocumentStatusView({ document }: { document: DocumentData }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{document.title}</h1>
      <p className="text-sm text-gray-600">Estado: {STATUS_LABELS[document.status] ?? document.status}</p>
      {document.status === "failed" && document.errorMessage && (
        <p className="text-sm text-red-600">{document.errorMessage}</p>
      )}
      {document.status === "ready" && (
        <div className="flex gap-3">
          <Link
            href={`/documents/${document.id}/practice`}
            className="bg-black text-white rounded px-3 py-2"
          >
            Practicar
          </Link>
          <Link href={`/documents/${document.id}/review`} className="border rounded px-3 py-2">
            Repasar
          </Link>
        </div>
      )}
    </div>
  );
}
