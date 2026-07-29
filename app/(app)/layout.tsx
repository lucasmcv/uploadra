import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b flex items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-4">
          <Link href="/videos" className="font-semibold">
            Mis videos y audios
          </Link>
          <Link href="/upload" className="text-sm underline">
            Subir video
          </Link>
          <Link href="/documents" className="font-semibold">
            Mis documentos
          </Link>
          <Link href="/documents/upload" className="text-sm underline">
            Subir documento
          </Link>
          <Link href="/billing" className="text-sm underline">
            Facturación
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          {session?.user?.email && <span>{session.user.email}</span>}
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
