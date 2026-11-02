import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteDonations } from "@/db/schema";
import { DONATION_TIERS } from "@/lib/billing-catalog";
import { getCurrentUser } from "@/lib/session";
import { SITE_URL } from "@/lib/config";
import { isPayPalConfigured, paypalRequest } from "@/lib/paypal";
import { env } from "@/lib/env";
import { isSameOriginPaymentRequest, paymentProviderUnavailable } from "@/lib/payment-request";

export const dynamic = "force-dynamic";

type PayPalOrder = {
  id: string;
  status: string;
  links?: { href: string; rel: string }[];
  purchase_units?: {
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: { id: string; status: string }[] };
  }[];
};

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500_000;

export async function POST(request: NextRequest) {
  if (!isSameOriginPaymentRequest(request)) {
    return NextResponse.json(
      { error: "invalid_origin", message: "Requête de paiement invalide" },
      { status: 403 },
    );
  }
  // No credentials, no pending row: an explicit 503 before anything is written.
  if (!isPayPalConfigured()) return paymentProviderUnavailable("paypal");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "invalid_request", message: "Données du don invalides" },
      { status: 400 },
    );
  }

  let amount = Number(body.amount);
  const tierId = typeof body.tierId === "string" ? body.tierId : undefined;
  if (tierId) {
    const tier = DONATION_TIERS.find((item) => item.id === tierId);
    if (!tier)
      return NextResponse.json(
        { error: "unknown_tier", message: "Palier de don inconnu" },
        { status: 400 },
      );
    amount = tier.amount;
  }
  const donorName =
    typeof body.donorName === "string" ? body.donorName.trim() : "Guerrier Z Anonyme";
  const donorEmail = typeof body.donorEmail === "string" ? body.donorEmail.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const isAnonymous = body.isAnonymous === true;
  if (!Number.isSafeInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    return NextResponse.json(
      { error: "invalid_amount", message: "Montant de don hors limites" },
      { status: 400 },
    );
  }
  if (donorName.length > 120 || donorEmail.length > 254 || message.length > 500) {
    return NextResponse.json(
      { error: "payload_too_large", message: "Informations du don trop longues" },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const ownerId =
    user?.sessionUserId && user.sessionUserId !== "token-admin" ? user.sessionUserId : null;
  const donationId = `don_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const value = (amount / 100).toFixed(2);

  try {
    await db.insert(siteDonations).values({
      id: donationId,
      userId: ownerId,
      donorName: donorName || user?.user?.username || "Guerrier Z Anonyme",
      donorEmail: donorEmail || null,
      amount,
      currency: "eur",
      message: message || null,
      isAnonymous,
      paymentProvider: "paypal",
      status: "pending",
      tier: tierId ?? "custom",
    });

    const order = await paypalRequest<PayPalOrder>("/v2/checkout/orders", {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `dbfr-donation-${donationId}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: donationId,
            description: "Soutien à Dragon Ball France",
            amount: { currency_code: "EUR", value },
          },
        ],
        application_context: {
          brand_name: "Dragon Ball France",
          locale: "fr-FR",
          user_action: "PAY_NOW",
          return_url: `${SITE_URL}/donations?provider=paypal&result=approved`,
          cancel_url: `${SITE_URL}/donations?provider=paypal&result=cancelled`,
        },
      }),
    });
    const approvalUrl = order.links?.find(
      (link) => link.rel === "approve" || link.rel === "payer-action",
    )?.href;
    const expectedOrigin =
      env.PAYPAL_ENV === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
    if (!order.id || !approvalUrl || new URL(approvalUrl).origin !== expectedOrigin) {
      return NextResponse.json(
        { error: "checkout_failed", message: "PayPal n'a pas créé le paiement" },
        { status: 502 },
      );
    }

    await db
      .update(siteDonations)
      .set({ paypalOrderId: order.id, updatedAt: new Date() })
      .where(eq(siteDonations.id, donationId));

    return NextResponse.json({ orderId: order.id, url: approvalUrl });
  } catch {
    return NextResponse.json(
      { error: "checkout_failed", message: "Création du paiement PayPal indisponible" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
