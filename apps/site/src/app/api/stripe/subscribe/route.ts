import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_PLANS } from "@/lib/stripe";
import { buildAuthOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { purgeAccountData } from "@/lib/account-data";
import { invalidateCurrentUser } from "@/lib/current-user-cache";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";

export async function POST(req: NextRequest) {
  try {
    const authOptions = buildAuthOptions({
      env: env as any,
      db,
      purgeAccountData,
      invalidateCurrentUser,
    });
    const authInstance = betterAuth(authOptions);
    const session = await authInstance.api.getSession({
      headers: await headers(),
    });

    const body = await req.json().catch(() => ({}));
    const planKey = (body.plan || "vip_monthly") as keyof typeof STRIPE_PLANS;
    const plan = STRIPE_PLANS[planKey];

    if (!plan) {
      return NextResponse.json({ error: "Plan d'abonnement inconnu" }, { status: 400 });
    }

    const host = req.headers.get("host") || "dragonballfr.com";
    const protocol = req.headers.get("x-forwarded-proto") || "https";
    const origin = `${protocol}://${host}`;

    const sessionParams: any = {
      mode: "subscription",
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/vip?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/vip?canceled=true`,
      automatic_tax: {
        enabled: true,
      },
      metadata: {
        type: "vip_subscription",
        planKey: plan.id,
        userId: session?.user?.id || "guest",
      },
    };

    if (session?.user?.email) {
      sessionParams.customer_email = session.user.email;
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: checkoutSession.url, sessionId: checkoutSession.id });
  } catch (err: any) {
    console.error("Erreur Checkout Subscription Stripe:", err);
    return NextResponse.json(
      { error: err.message || "Erreur lors de la création de la session d'abonnement" },
      { status: 500 },
    );
  }
}
