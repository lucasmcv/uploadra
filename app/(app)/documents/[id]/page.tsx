import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentStatusView } from "@/components/document/DocumentStatusView";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document || document.ownerId !== session!.user.id) {
    notFound();
  }

  return (
    <div className="max-w-lg">
      <DocumentStatusView document={document} />
    </div>
  );
}
