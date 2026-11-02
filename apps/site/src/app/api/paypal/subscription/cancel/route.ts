import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { sitePaypalSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { paypalRequest } from "@/lib/paypal";
import { isSameOriginPaymentRequest } from "@/lib/payment-request";

export async function POST(request: NextRequest) {
  if (!isSameOriginPaymentRequest(request)) {
    return NextResponse.json(
      { error: "invalid_origin", message: "Requête de paiement invalide" },
      { status: 403 },
    );
  }
  const user = await getCurrentUser();
  if (!user?.sessionUserId || user.sessionUserId === "token-admin") {
    return NextResponse.json(
      { error: "unauthenticated", message: "Authentification requise" },
      { status: 401 },
    );
  }
  const body = await request.json().catch(() => null);
  const subscriptionId = body?.subscriptionId;
  if (typeof subscriptionId !== "string" || !/^[A-Z0-9-]{8,64}$/.test(subscriptionId)) {
    return NextResponse.json(
      { error: "invalid_subscription", message: "Abonnement PayPal invalide" },
      { status: 400 },
    );
  }

  const [subscription] = await db
    .select()
    .from(sitePaypalSubscriptions)
    .where(
      and(
        eq(sitePaypalSubscriptions.userId, user.sessionUserId),
        eq(sitePaypalSubscriptions.paypalSubscriptionId, subscriptionId),
        inArray(sitePaypalSubscriptions.status, [
          "APPROVAL_PENDING",
          "APPROVED",
          "ACTIVE",
          "SUSPENDED",
        ]),
      ),
    )
    .limit(1);
  if (!subscription)
    return NextResponse.json(
      { error: "subscription_not_found", message: "Abonnement introuvable" },
      { status: 404 },
    );

  try {
    await paypalRequest<void>(
      `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      { method: "POST", body: JSON.stringify({ reason: "Cancelled by subscriber" }) },
    );
    await db
      .update(sitePaypalSubscriptions)
      .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(sitePaypalSubscriptions.id, subscription.id));
    return NextResponse.json({ status: "cancelled" });
  } catch {
    return NextResponse.json(
      { error: "provider_unavailable", message: "Annulation PayPal indisponible" },
      { status: 503 },
    );
  }
}
