import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { SITE_URL } from "@/lib/config";
import { db } from "@/lib/db";
import { sitePaypalSubscriptions, siteSubscriptionCheckoutReservations } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { env } from "@/lib/env";
import { ensurePayPalReady, PayPalApiError, paypalPlanId, paypalRequest } from "@/lib/paypal";
import { isSameOriginPaymentRequest } from "@/lib/payment-request";
import {
  releaseSubscriptionCheckout,
  reserveSubscriptionCheckout,
} from "@/lib/subscription-reservation";

type PayPalSubscription = {
  id: string;
  status: string;
  links?: { href: string; rel: string }[];
};

const PLAN_KEYS = ["vip_monthly", "vip_annual"] as const;

export async function POST(request: NextRequest) {
  if (!isSameOriginPaymentRequest(request)) {
    return NextResponse.json({ error: "Requête de paiement invalide" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user?.sessionUserId || user.sessionUserId === "token-admin") {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const planKey = body?.plan;
  if (!PLAN_KEYS.includes(planKey)) {
    return NextResponse.json({ error: "Plan d'abonnement inconnu" }, { status: 400 });
  }

  let planId: string;
  try {
    planId = paypalPlanId(planKey);
    await ensurePayPalReady();
  } catch {
    return NextResponse.json({ error: "Paiement PayPal indisponible" }, { status: 503 });
  }

  const reservationId = await reserveSubscriptionCheckout({
    userId: user.sessionUserId,
    provider: "paypal",
    plan: planKey,
  });
  if (!reservationId) {
    return NextResponse.json(
      { error: "Un abonnement ou un paiement est déjà en cours pour ce compte." },
      { status: 409 },
    );
  }

  try {
    const result = await paypalRequest<PayPalSubscription>("/v1/billing/subscriptions", {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `dbfr-${reservationId}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: user.sessionUserId,
        application_context: {
          brand_name: "Dragon Ball France",
          locale: "fr-FR",
          user_action: "SUBSCRIBE_NOW",
          return_url: `${SITE_URL}/vip?provider=paypal&result=approved`,
          cancel_url: `${SITE_URL}/vip?provider=paypal&result=cancelled`,
        },
      }),
    });

    const approvalUrl = result.links?.find((link) => link.rel === "approve")?.href;
    const expectedOrigin =
      env.PAYPAL_ENV === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
    if (!approvalUrl || new URL(approvalUrl).origin !== expectedOrigin) {
      return NextResponse.json({ error: "Lien d'approbation PayPal invalide" }, { status: 502 });
    }

    await db.transaction(async (tx) => {
      await tx.insert(sitePaypalSubscriptions).values({
        id: `pp_${result.id}`,
        userId: user.sessionUserId,
        plan: planKey,
        paypalSubscriptionId: result.id,
        status: result.status,
      });
      await tx
        .delete(siteSubscriptionCheckoutReservations)
        .where(eq(siteSubscriptionCheckoutReservations.userId, user.sessionUserId));
    });

    return NextResponse.json({ url: approvalUrl });
  } catch (error) {
    if (error instanceof PayPalApiError && error.status >= 400 && error.status < 500) {
      try {
        await releaseSubscriptionCheckout({
          userId: user.sessionUserId,
          provider: "paypal",
          reservationId,
        });
      } catch {
        console.error("Failed to release rejected PayPal checkout reservation");
      }
    }
    return NextResponse.json(
      { error: "Création de l'abonnement PayPal indisponible" },
      { status: 503 },
    );
  }
}
