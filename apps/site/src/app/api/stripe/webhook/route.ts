import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { db } from "@/lib/db";
import { baSubscription, siteDonations, baUser } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Signature Stripe manquante" }, { status: 400 });
  }

  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Erreur validation webhook Stripe:", err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = session.metadata || {};

        if (metadata.type === "donation") {
          const donationId = metadata.donationId;
          if (donationId) {
            await db
              .update(siteDonations)
              .set({
                status: "succeeded",
                stripePaymentIntentId: session.payment_intent as string,
                updatedAt: new Date(),
              })
              .where(eq(siteDonations.id, donationId));
          }
        } else if (metadata.type === "vip_subscription") {
          const userId = metadata.userId;
          const stripeCustomerId = session.customer as string;
          const stripeSubscriptionId = session.subscription as string;

          if (userId && userId !== "guest" && stripeCustomerId) {
            await db.update(baUser).set({ stripeCustomerId }).where(eq(baUser.id, userId));
          }

          if (stripeSubscriptionId) {
            const sub: any = await stripe.subscriptions.retrieve(stripeSubscriptionId);
            const periodStart = sub.current_period_start
              ? new Date(sub.current_period_start * 1000)
              : null;
            const periodEnd = sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null;

            await db
              .insert(baSubscription)
              .values({
                id: `sub_${sub.id.slice(-16)}`,
                plan: metadata.planKey || "vip_monthly",
                referenceId: userId || "guest",
                stripeCustomerId: stripeCustomerId || (sub.customer as string),
                stripeSubscriptionId: sub.id,
                status: sub.status,
                periodStart,
                periodEnd,
                cancelAtPeriodEnd: sub.cancel_at_period_end,
              })
              .onConflictDoUpdate({
                target: baSubscription.stripeSubscriptionId,
                set: {
                  status: sub.status,
                  periodStart,
                  periodEnd,
                  cancelAtPeriodEnd: sub.cancel_at_period_end,
                  updatedAt: new Date(),
                },
              });
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub: any = event.data.object;
        const periodStart = sub.current_period_start
          ? new Date(sub.current_period_start * 1000)
          : null;
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

        await db
          .update(baSubscription)
          .set({
            status: sub.status,
            periodStart,
            periodEnd,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            updatedAt: new Date(),
          })
          .where(eq(baSubscription.stripeSubscriptionId, sub.id));
        break;
      }

      default:
        // Événement ignoré
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Erreur traitement webhook Stripe:", err);
    return NextResponse.json({ error: "Erreur traitement webhook" }, { status: 500 });
  }
}
