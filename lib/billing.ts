import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { getCurrentRequiredTierCents, getTierPriceData } from "@/lib/billing-tiers";

const GRACE_PERIOD_DAYS = 7;

export async function getRequiredTierCents(): Promise<number> {
  const userCount = await prisma.user.count();
  return getCurrentRequiredTierCents(userCount);
}

/**
 * The gate every content-creating write route calls first (after the
 * existing session check, before any Prisma write) — mirrors the
 * `if (!session?.user) return 401` idiom already used everywhere. Returns
 * `null` when the request should proceed, or a 402 response to return
 * immediately.
 *
 * A stale subscribed price never blocks access by itself — that's a
 * billing-correctness problem (see reconcileUserPriceIfStale), not an
 * access problem. Access depends only on being active/trialing, or still
 * inside this specific user's own grace window, which starts the first
 * time they're found liable-but-unsubscribed rather than from one global
 * "the platform crossed 100 users" timestamp.
 */
export async function billingBlockResponse(userId: string): Promise<NextResponse | null> {
  const requiredTierCents = await getRequiredTierCents();
  if (requiredTierCents === 0) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const isActive = user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing";
  if (isActive) {
    reconcileUserPriceIfStale(user.id, requiredTierCents).catch((err) => {
      console.error("[billing] Falló la reconciliación de precio:", err);
    });
    return null;
  }

  const inGrace = user.paymentGraceUntil !== null && user.paymentGraceUntil.getTime() > Date.now();
  if (inGrace) return null;

  if (!user.paymentGraceUntil) {
    const graceUntil = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    await prisma.user.update({ where: { id: user.id }, data: { paymentGraceUntil: graceUntil } });
    return null;
  }

  return NextResponse.json(
    { error: "Se requiere una suscripción activa para seguir subiendo contenido.", code: "PAYMENT_REQUIRED" },
    { status: 402 }
  );
}

/**
 * If Stripe is currently charging this user less than the live required
 * tier, bumps their subscription item to the new price. `proration_behavior:
 * "none"` means the new price takes effect at the next renewal — no
 * surprise mid-cycle charge.
 */
export async function reconcileUserPriceIfStale(userId: string, requiredTierCents: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.stripeSubscriptionId) return;
  if ((user.subscribedPriceCents ?? 0) >= requiredTierCents) return;

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const item = subscription.items.data[0];
  if (!item) return;

  await stripe.subscriptionItems.update(item.id, {
    price_data: getTierPriceData(requiredTierCents),
    proration_behavior: "none",
  });

  await prisma.user.update({
    where: { id: userId },
    data: { subscribedPriceCents: requiredTierCents },
  });
}
