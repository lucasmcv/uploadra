// Pure, no-I/O tier calculation — the single source of truth for "what
// should every user currently be paying", driven only by the total count
// of registered accounts. Free below 100 users; from 100 on, everyone pays
// the same amount, which steps up by 1 USD every additional 100 users,
// capped at 30 USD/month (reached at 3000+ users).
//
// Priced in USD (not ARS) specifically to avoid Argentine peso devaluation
// risk: hosting/proxy/Stripe costs are all USD-denominated, so a fixed ARS
// price could stop covering real costs after enough inflation, while a USD
// price tracks them directly.

export const FREE_THRESHOLD_USERS = 100;
export const STEP_USERS = 100;
export const STEP_PRICE_CENTS = 100; // 1 USD
export const MAX_PRICE_CENTS = 3_000; // 30 USD

export function getCurrentRequiredTierCents(userCount: number): number {
  if (userCount < FREE_THRESHOLD_USERS) return 0;
  const steps = Math.floor(userCount / STEP_USERS);
  return Math.min(steps * STEP_PRICE_CENTS, MAX_PRICE_CENTS);
}

export interface StripeTierPriceData {
  currency: "usd";
  unit_amount: number;
  recurring: { interval: "month" };
  product: string;
}

/**
 * The Stripe `price_data` shape for a given tier — used both when creating
 * a Checkout Session and when reconciling an existing subscription's price,
 * so there's exactly one definition of "what a tier looks like to Stripe".
 * Requires STRIPE_PRODUCT_ID (a single Product created once, by hand, in
 * the Stripe dashboard — see docs/DEPLOYMENT.md).
 */
export function getTierPriceData(cents: number): StripeTierPriceData {
  const productId = process.env.STRIPE_PRODUCT_ID;
  if (!productId) {
    throw new Error("STRIPE_PRODUCT_ID no está configurado.");
  }
  return {
    currency: "usd",
    unit_amount: cents,
    recurring: { interval: "month" },
    product: productId,
  };
}
