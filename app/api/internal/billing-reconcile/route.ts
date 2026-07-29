import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequiredTierCents, reconcileUserPriceIfStale } from "@/lib/billing";

/**
 * Backstop sweep for subscribers who keep paying but don't actively use
 * the app — the lazy reconciliation in billingBlockResponse only fires
 * when a user hits a gated route. Meant to be hit periodically by an
 * external cron (Fly.io has no native cron; see docs/DEPLOYMENT.md).
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.BILLING_RECONCILE_SECRET;
  if (expectedSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  const requiredTierCents = await getRequiredTierCents();
  if (requiredTierCents === 0) {
    return NextResponse.json({ reconciled: 0 });
  }

  const staleUsers = await prisma.user.findMany({
    where: {
      subscriptionStatus: { in: ["active", "trialing"] },
      OR: [{ subscribedPriceCents: null }, { subscribedPriceCents: { lt: requiredTierCents } }],
    },
    select: { id: true },
  });

  for (const user of staleUsers) {
    await reconcileUserPriceIfStale(user.id, requiredTierCents).catch((err) => {
      console.error(`[billing-reconcile] Falló para ${user.id}:`, err);
    });
  }

  return NextResponse.json({ reconciled: staleUsers.length });
}
