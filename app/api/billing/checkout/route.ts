import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { getRequiredTierCents } from "@/lib/billing";
import { getTierPriceData } from "@/lib/billing-tiers";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const requiredTierCents = await getRequiredTierCents();
  if (requiredTierCents === 0) {
    return NextResponse.json(
      { error: "La plataforma todavía está en su etapa gratuita, no hay nada que suscribir." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const stripe = getStripeClient();
  // NEXT_PUBLIC_APP_URL is the internal Docker-network address the worker
  // uses to call back — not resolvable by the browser. PUBLIC_APP_URL is
  // the one the browser actually gets redirected to after Checkout.
  const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price_data: getTierPriceData(requiredTierCents), quantity: 1 }],
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=cancelled`,
    metadata: { userId: user.id },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
