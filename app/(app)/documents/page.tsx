import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStaleFailureMessage } from "@/lib/processing-watchdog";
import { DocumentList } from "@/components/documents/DocumentList";

export default async function DocumentsPage() {
  const session = await auth();
  const documents = await prisma.document.findMany({
    where: { ownerId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  for (const document of documents) {
    const staleMessage = getStaleFailureMessage(document.status, document.updatedAt);
    if (staleMessage) {
      await prisma.document.update({
        where: { id: document.id },
        data: { status: "failed", errorMessage: staleMessage },
      });
      document.status = "failed";
      document.errorMessage = staleMessage;
    }
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-gray-600">Todavía no subiste ningún documento.</p>
        <Link href="/documents/upload" className="bg-black text-white rounded px-4 py-2">
          Subir tu primer documento
        </Link>
      </div>
    );
  }

  return (
    <DocumentList
      documents={documents.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        enabled: d.enabled,
      }))}
    />
  );
}
