import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function DocumentsPage() {
  const session = await auth();
  const documents = await prisma.document.findMany({
    where: { ownerId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

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
    <ul className="flex flex-col gap-3 max-w-2xl">
      {documents.map((document) => (
        <li key={document.id} className="border rounded px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-medium">{document.title}</p>
            <p className="text-sm text-gray-500">{document.status}</p>
          </div>
          <Link href={`/documents/${document.id}`} className="underline text-sm">
            Ver
          </Link>
        </li>
      ))}
    </ul>
  );
}
