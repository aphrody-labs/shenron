import "server-only";
import StripeClient from "stripe";
import { env } from "@/lib/env";
import { STRIPE_PLANS } from "@/lib/billing-catalog";

export { STRIPE_PLANS, DONATION_TIERS } from "@/lib/billing-catalog";

/** True when a Stripe secret key is configured (checkout can be attempted). */
export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new StripeClient(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-09-30.endive",
    appInfo: {
      name: "Dragon Ball FR",
      version: "2.0.0",
      url: "https://dragonballfr.com",
    },
  });
}

export function stripeWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  return env.STRIPE_WEBHOOK_SECRET;
}

export function checkoutIntegrationIdentifier(flow: "vip" | "donation", seed?: string): string {
  const suffix = seed
    ? Array.from(seed.slice(-8), (character) => character.charCodeAt(0))
    : Array.from(crypto.getRandomValues(new Uint8Array(8)));
  const letters = suffix.map((value) => String.fromCharCode(97 + (value % 26))).join("");
  return `dbfr-${flow}-${letters}`;
}

export function stripePriceId(planKey: keyof typeof STRIPE_PLANS): string {
  const priceId =
    planKey === "vip_monthly" ? env.STRIPE_PRICE_VIP_MONTHLY : env.STRIPE_PRICE_VIP_ANNUAL;
  if (!priceId) throw new Error("Stripe plan Price ID is not configured.");
  return priceId;
}
