import { NextRequest, NextResponse } from "next/server";
import { stripe, DONATION_TIERS } from "@/lib/stripe";
import { db } from "@/lib/db";
import { siteDonations } from "@/db/schema";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { authDatabaseConfig, buildAuthOptions } from "@/lib/auth";
import { env } from "@/lib/env";
import { purgeAccountData } from "@/lib/account-data";
import { invalidateCurrentUser } from "@/lib/current-user-cache";

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
    let amount = Number(body.amount); // en centimes d'EUR
    const tierId = body.tierId as string | undefined;
    const donorName =
      (body.donorName as string)?.trim() || session?.user?.name || "Guerrier Z Anonyme";
    const donorEmail = (body.donorEmail as string)?.trim() || session?.user?.email;
    const message = (body.message as string)?.trim() || "";
    const isAnonymous = Boolean(body.isAnonymous);

    if (tierId) {
      const tier = DONATION_TIERS.find((t) => t.id === tierId);
      if (tier) {
        amount = tier.amount;
      }
    }

    if (!amount || isNaN(amount) || amount < 100) {
      return NextResponse.json(
        { error: "Le montant minimum de don est de 1,00 € (100 centimes)." },
        { status: 400 },
      );
    }

    const host = req.headers.get("host") || "dragonballfr.com";
    const protocol = req.headers.get("x-forwarded-proto") || "https";
    const origin = `${protocol}://${host}`;

    const donationId = `don_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
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
        userId: session?.user?.id || "",
        donorName,
        isAnonymous: isAnonymous ? "true" : "false",
      },
    });

    // Enregistrer le don en attente en base
    await db.insert(siteDonations).values({
      id: donationId,
      userId: session?.user?.id || null,
      donorName,
      donorEmail: donorEmail || null,
      amount,
      currency: "eur",
      message: message || null,
      isAnonymous,
      stripeCheckoutSessionId: checkoutSession.id,
      status: "pending",
      tier: tierId || "custom",
    });

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      donationId,
    });
  } catch (err: any) {
    console.error("Erreur Checkout Donation Stripe:", err);
    return NextResponse.json(
      { error: err.message || "Erreur lors de la création du don" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const recentDonations = await db.query.siteDonations.findMany({
      where: (donations, { eq }) => eq(donations.status, "succeeded"),
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
