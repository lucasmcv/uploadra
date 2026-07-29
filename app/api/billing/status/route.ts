import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRequiredTierCents } from "@/lib/billing";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const requiredTierCents = await getRequiredTierCents();

  return NextResponse.json({
    subscriptionStatus: user.subscriptionStatus,
    subscribedPriceCents: user.subscribedPriceCents,
    currentPeriodEnd: user.currentPeriodEnd?.toISOString() ?? null,
    paymentGraceUntil: user.paymentGraceUntil?.toISOString() ?? null,
    requiredTierCents,
  });
}
