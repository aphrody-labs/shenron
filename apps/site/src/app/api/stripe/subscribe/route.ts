import { NextRequest, NextResponse } from "next/server";
import {
  checkoutIntegrationIdentifier,
  getStripe,
  isStripeConfigured,
  stripePriceId,
} from "@/lib/stripe";
import { STRIPE_PLANS } from "@/lib/billing-catalog";
import { hostAuthUrl, hostGetSession } from "@/lib/host-auth";
import { db } from "@/lib/db";
import { baUser } from "@/db/schema";
import { SITE_URL } from "@/lib/config";
import { eq } from "drizzle-orm";
import {
  releaseSubscriptionCheckout,
  reserveSubscriptionCheckout,
} from "@/lib/subscription-reservation";
import { isSameOriginPaymentRequest, paymentProviderUnavailable } from "@/lib/payment-request";

export async function POST(req: NextRequest) {
  if (!isSameOriginPaymentRequest(req)) {
    return NextResponse.json({ error: "Requête de paiement invalide" }, { status: 403 });
  }
  if (!isStripeConfigured()) return paymentProviderUnavailable("stripe");
  let reservationId: string | undefined;
  let userId: string | undefined;
  try {
    const authHost = hostAuthUrl();
    if (!authHost) {
      return NextResponse.json({ error: "Authentification indisponible" }, { status: 503 });
    }
    const session = await hostGetSession(authHost, req.headers);
    if (!session?.user.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    userId = session.user.id;
    const [authUser] = await db
      .select({ email: baUser.email })
      .from(baUser)
      .where(eq(baUser.id, session.user.id))
      .limit(1);
    if (!authUser) {
      return NextResponse.json({ error: "Compte introuvable" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const planKey = (body.plan || "vip_monthly") as keyof typeof STRIPE_PLANS;
    const plan = STRIPE_PLANS[planKey];

    if (!plan) {
      return NextResponse.json({ error: "Plan d'abonnement inconnu" }, { status: 400 });
    }

    const stripe = getStripe();
    const priceId = stripePriceId(plan.id);

    const createdReservationId = await reserveSubscriptionCheckout({
      userId: session.user.id,
      provider: "stripe",
      plan: plan.id,
    });
    if (!createdReservationId) {
      return NextResponse.json(
        { error: "Un abonnement ou un paiement est déjà en cours pour ce compte." },
        { status: 409 },
      );
    }
    reservationId = createdReservationId;

    const origin = SITE_URL;

    const sessionParams: any = {
      mode: "subscription",
      integration_identifier: checkoutIntegrationIdentifier("vip", reservationId),
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/vip?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/vip?canceled=true`,
      metadata: {
        type: "vip_subscription",
        planKey: plan.id,
        userId: session.user.id,
      },
    };

    if (authUser.email) sessionParams.customer_email = authUser.email;

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `dbfr-vip-${reservationId}`,
    });

    return NextResponse.json({ url: checkoutSession.url, sessionId: checkoutSession.id });
  } catch (err: any) {
    if (
      reservationId &&
      userId &&
      typeof err?.statusCode === "number" &&
      err.statusCode >= 400 &&
      err.statusCode < 500
    ) {
      try {
        await releaseSubscriptionCheckout({ userId, provider: "stripe", reservationId });
      } catch {
        console.error("Failed to release rejected Stripe checkout reservation");
      }
    }
    console.error("Stripe subscription checkout failed", {
      code: typeof err?.code === "string" ? err.code : "unclassified",
    });
    return NextResponse.json(
      {
        error: "Impossible de démarrer le paiement de l'abonnement.",
        code: "payment_checkout_failed",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
