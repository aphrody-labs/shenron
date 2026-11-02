import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteDonations } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { paypalRequest } from "@/lib/paypal";
import { isSameOriginPaymentRequest } from "@/lib/payment-request";

type PayPalOrder = {
  id: string;
  status: string;
  purchase_units?: {
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: { id: string; status: string }[] };
  }[];
};

export async function POST(request: NextRequest) {
  if (!isSameOriginPaymentRequest(request)) {
    return NextResponse.json(
      { error: "invalid_origin", message: "Requête de paiement invalide" },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => null);
  const orderId = body?.orderId;
  if (typeof orderId !== "string" || !/^[A-Z0-9-]{8,64}$/.test(orderId)) {
    return NextResponse.json(
      { error: "invalid_order", message: "Commande PayPal invalide" },
      { status: 400 },
    );
  }

  try {
    const order = await paypalRequest<PayPalOrder>(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    );
    const purchase = order.purchase_units?.[0];
    const donationId = purchase?.custom_id;
    if (
      order.id !== orderId ||
      typeof donationId !== "string" ||
      purchase?.amount?.currency_code !== "EUR"
    ) {
      return NextResponse.json(
        { error: "invalid_order", message: "Paiement PayPal non reconnu" },
        { status: 400 },
      );
    }

    const [donation] = await db
      .select()
      .from(siteDonations)
      .where(
        and(
          eq(siteDonations.id, donationId),
          eq(siteDonations.paypalOrderId, orderId),
          eq(siteDonations.paymentProvider, "paypal"),
        ),
      )
      .limit(1);
    if (!donation)
      return NextResponse.json(
        { error: "donation_not_found", message: "Don non trouvé" },
        { status: 404 },
      );

    const user = await getCurrentUser();
    if (donation.userId && user?.sessionUserId !== donation.userId) {
      return NextResponse.json({ error: "forbidden", message: "Accès refusé" }, { status: 403 });
    }
    if (!donation.userId && !user?.sessionUserId && donation.status !== "pending") {
      return NextResponse.json({ error: "forbidden", message: "Accès refusé" }, { status: 403 });
    }
    if (purchase.amount?.value !== (donation.amount / 100).toFixed(2)) {
      return NextResponse.json(
        { error: "amount_mismatch", message: "Montant PayPal incohérent" },
        { status: 409 },
      );
    }
    if (donation.status === "succeeded") return NextResponse.json({ status: "succeeded" });

    let completedOrder = order;
    if (order.status === "APPROVED") {
      completedOrder = await paypalRequest<PayPalOrder>(
        `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        {
          method: "POST",
          headers: { "PayPal-Request-Id": `dbfr-capture-${orderId}` },
          body: "{}",
        },
      );
    }

    const capture = completedOrder.purchase_units?.[0]?.payments?.captures?.find(
      (item) => item.status === "COMPLETED",
    );
    if (completedOrder.status !== "COMPLETED" || !capture) {
      return NextResponse.json(
        { error: "payment_not_confirmed", message: "Paiement PayPal non confirmé" },
        { status: 409 },
      );
    }

    const changed = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(siteDonations)
        .set({ status: "succeeded", paypalCaptureId: capture.id, updatedAt: new Date() })
        .where(and(eq(siteDonations.id, donation.id), eq(siteDonations.status, "pending")))
        .returning({ id: siteDonations.id });
      return Boolean(updated);
    });
    if (!changed) {
      const [current] = await db
        .select({ status: siteDonations.status })
        .from(siteDonations)
        .where(eq(siteDonations.id, donation.id))
        .limit(1);
      if (current?.status !== "succeeded")
        return NextResponse.json(
          { error: "state_changed", message: "État du don modifié" },
          { status: 409 },
        );
    }
    return NextResponse.json({ status: "succeeded" });
  } catch {
    return NextResponse.json(
      { error: "capture_unavailable", message: "Confirmation PayPal indisponible" },
      { status: 503 },
    );
  }
}
