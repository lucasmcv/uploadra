import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { geminiApiKeyEncrypted: true },
  });

  return NextResponse.json({ configured: Boolean(user?.geminiApiKeyEncrypted) });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { apiKey } = await req.json();
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "Pegá tu clave de Gemini." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { geminiApiKeyEncrypted: encrypt(apiKey.trim()) },
  });

  return NextResponse.json({ configured: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { geminiApiKeyEncrypted: null },
  });

  return NextResponse.json({ configured: false });
}
