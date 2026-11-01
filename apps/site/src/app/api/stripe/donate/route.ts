import { NextRequest, NextResponse } from "next/server";
import { checkoutIntegrationIdentifier, getStripe } from "@/lib/stripe";
import { DONATION_TIERS } from "@/lib/billing-catalog";
import { db } from "@/lib/db";
import { siteDonations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { SITE_URL } from "@/lib/config";
import { isSameOriginPaymentRequest } from "@/lib/payment-request";

export async function POST(req: NextRequest) {
  if (!isSameOriginPaymentRequest(req)) {
    return NextResponse.json({ error: "Requête de paiement invalide" }, { status: 403 });
  }
  let donationId: string | null = null;
  try {
    const user = await getCurrentUser();

    const body = await req.json().catch(() => ({}));
    let amount = Number(body.amount); // en centimes d'EUR
    const tierId = body.tierId as string | undefined;
    const donorName =
      (body.donorName as string)?.trim() || user?.user?.username || "Guerrier Z Anonyme";
    const donorEmail = (body.donorEmail as string)?.trim() || undefined;
    const message = (body.message as string)?.trim() || "";
    const isAnonymous = Boolean(body.isAnonymous);

    if (tierId) {
      const tier = DONATION_TIERS.find((t) => t.id === tierId);
      if (!tier) return NextResponse.json({ error: "Palier de don inconnu." }, { status: 400 });
      amount = tier.amount;
    }

    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 500_000) {
      return NextResponse.json(
        { error: "Le montant doit être compris entre 1,00 € et 5 000,00 €." },
        { status: 400 },
      );
    }

    if (donorName.length > 120 || message.length > 500 || (donorEmail && donorEmail.length > 254)) {
      return NextResponse.json(
        { error: "Les informations du don dépassent les limites autorisées." },
        { status: 400 },
      );
    }

    const origin = SITE_URL;

    donationId = `don_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    await db.insert(siteDonations).values({
      id: donationId,
      userId:
        user?.sessionUserId && user.sessionUserId !== "token-admin" ? user.sessionUserId : null,
      donorName,
      donorEmail: donorEmail || null,
      amount,
      currency: "eur",
      message: message || null,
      isAnonymous,
      status: "pending",
      tier: tierId || "custom",
    });

    const checkoutSession = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        integration_identifier: checkoutIntegrationIdentifier("donation"),
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: amount,
              product_data: {
                name: `Don de Soutien DBFR ${tierId ? `(${tierId})` : ""}`,
                description:
                  message || "Contribution au maintien et au développement de dragonballfr.com",
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/donations?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/donations?canceled=true`,
        customer_email: donorEmail || undefined,
        metadata: {
          type: "donation",
          donationId,
          tierId: tierId || "custom",
          userId:
            user?.sessionUserId && user.sessionUserId !== "token-admin" ? user.sessionUserId : "",
          donorName,
          isAnonymous: isAnonymous ? "true" : "false",
        },
      },
      { idempotencyKey: `donation:${donationId}` },
    );

    await db
      .update(siteDonations)
      .set({ stripeCheckoutSessionId: checkoutSession.id, updatedAt: new Date() })
      .where(eq(siteDonations.id, donationId));

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      donationId,
    });
  } catch (err: any) {
    if (donationId) {
      await db
        .update(siteDonations)
        .set({ status: "failed", updatedAt: new Date() })
        .where(and(eq(siteDonations.id, donationId), eq(siteDonations.status, "pending")))
        .catch(() => undefined);
    }
    console.error("Stripe donation checkout failed", {
      code: typeof err?.code === "string" ? err.code : "unclassified",
    });
    return NextResponse.json(
      { error: "Impossible de démarrer le paiement du don." },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const recentDonations = await db.query.siteDonations.findMany({
      where: eq(siteDonations.status, "succeeded"),
      orderBy: (donations, { desc }) => [desc(donations.createdAt)],
      limit: 20,
    });

    const publicList = recentDonations.map((d) => ({
      id: d.id,
      donorName: d.isAnonymous ? "Guerrier Z Anonyme" : d.donorName,
      amount: d.amount,
      message: d.message,
      tier: d.tier,
      createdAt: d.createdAt,
    }));

    return NextResponse.json({ donations: publicList });
  } catch (err: any) {
    console.error("Erreur lecture donations:", err);
    return NextResponse.json({ error: "Impossible de récupérer les dons" }, { status: 500 });
  }
}
