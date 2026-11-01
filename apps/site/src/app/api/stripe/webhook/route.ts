import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeWebhookSecret, STRIPE_PLANS } from "@/lib/stripe";
import { db } from "@/lib/db";
import {
  baSubscription,
  siteBillingWebhookEvents,
  siteDonations,
  siteEmailOutbox,
  siteSubscriptionCheckoutReservations,
  baUser,
} from "@/db/schema";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { closedDisputeDonationState, refundedDonationState } from "@/lib/stripe-donation-status";

const emailText = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
const formatAmount = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount / 100);

export async function POST(req: NextRequest) {
  let webhookSecret: string;
  try {
    webhookSecret = stripeWebhookSecret();
  } catch {
    return NextResponse.json({ error: "Webhook Stripe non configuré" }, { status: 503 });
  }

  const stripe = getStripe();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Signature Stripe manquante" }, { status: 400 });
  }

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Signature webhook invalide" }, { status: 400 });
  }

  // Fetch provider state before opening the database transaction. The event receipt
  // and all corresponding local writes are then committed or rolled back together.
  let checkoutSubscription: any = null;
  let subscriptionSnapshot: any = null;
  let invoiceSubscriptionSnapshot: any = null;
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    if (session.metadata?.type === "vip_subscription" && typeof session.subscription === "string") {
      try {
        checkoutSubscription = await stripe.subscriptions.retrieve(session.subscription);
      } catch {
        return NextResponse.json({ error: "État abonnement indisponible" }, { status: 503 });
      }
    }
  }

  const t = await getTranslations({ locale: "fr", namespace: "billingEmail" });
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    const subscriptionId = invoice.parent?.subscription_details?.subscription;
    if (typeof subscriptionId === "string") {
      try {
        invoiceSubscriptionSnapshot = await stripe.subscriptions.retrieve(subscriptionId);
      } catch {
        return NextResponse.json({ error: "État abonnement indisponible" }, { status: 503 });
      }
    }
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    try {
      subscriptionSnapshot = await stripe.subscriptions.retrieve(event.data.object.id);
    } catch {
      return NextResponse.json({ error: "État abonnement indisponible" }, { status: 503 });
    }
  }

  try {
    const processed = await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(siteBillingWebhookEvents)
        .values({
          id: `stripe_${event.id}`,
          provider: "stripe",
          eventId: event.id,
          eventType: event.type,
        })
        .onConflictDoNothing({
          target: [siteBillingWebhookEvents.provider, siteBillingWebhookEvents.eventId],
        })
        .returning({ id: siteBillingWebhookEvents.id });

      if (!receipt) return false;

      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object;
          const metadata = session.metadata ?? {};

          if (metadata.type === "donation") {
            const donationId = metadata.donationId;
            if (donationId && session.payment_status === "paid") {
              const [donation] = await tx
                .update(siteDonations)
                .set({
                  status: "succeeded",
                  stripePaymentIntentId:
                    typeof session.payment_intent === "string" ? session.payment_intent : null,
                  updatedAt: new Date(),
                })
                .where(eq(siteDonations.id, donationId))
                .returning();
              if (!donation) throw new Error("stripe_donation_intent_missing");
              const recipient = donation?.donorEmail || session.customer_details?.email;
              if (recipient) {
                await tx
                  .insert(siteEmailOutbox)
                  .values({
                    dedupeKey: `donation:${donation.id}:confirmed`,
                    recipient,
                    subject: t("donationSubject"),
                    textBody: emailText(t("donationBody"), {
                      name: donation.donorName,
                      amount: formatAmount(donation.amount),
                      reference: donation.id,
                    }),
                  })
                  .onConflictDoNothing({ target: siteEmailOutbox.dedupeKey });
              }
            }
          } else if (metadata.type === "vip_subscription" && checkoutSubscription) {
            const userId = metadata.userId;
            const stripeCustomerId =
              typeof session.customer === "string"
                ? session.customer
                : (checkoutSubscription.customer as string);
            if (userId && userId !== "guest" && stripeCustomerId) {
              await tx.update(baUser).set({ stripeCustomerId }).where(eq(baUser.id, userId));
            }

            const sub = checkoutSubscription;
            await tx
              .insert(baSubscription)
              .values({
                id: `sub_${sub.id.slice(-16)}`,
                plan: metadata.planKey || "vip_monthly",
                referenceId: userId || "guest",
                stripeCustomerId,
                stripeSubscriptionId: sub.id,
                status: sub.status,
                periodStart: sub.current_period_start
                  ? new Date(sub.current_period_start * 1000)
                  : null,
                periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
                cancelAtPeriodEnd: sub.cancel_at_period_end,
              })
              .onConflictDoUpdate({
                target: baSubscription.stripeSubscriptionId,
                set: {
                  status: sub.status,
                  periodStart: sub.current_period_start
                    ? new Date(sub.current_period_start * 1000)
                    : null,
                  periodEnd: sub.current_period_end
                    ? new Date(sub.current_period_end * 1000)
                    : null,
                  cancelAtPeriodEnd: sub.cancel_at_period_end,
                  updatedAt: new Date(),
                },
              });
            if (userId && userId !== "guest") {
              await tx
                .delete(siteSubscriptionCheckoutReservations)
                .where(eq(siteSubscriptionCheckoutReservations.userId, userId));
            }
            if (
              userId &&
              userId !== "guest" &&
              (sub.status === "active" || sub.status === "trialing")
            ) {
              const [account] = await tx
                .select({ email: baUser.email, name: baUser.name })
                .from(baUser)
                .where(eq(baUser.id, userId))
                .limit(1);
              const plan =
                metadata.planKey === "vip_annual"
                  ? STRIPE_PLANS.vip_annual
                  : STRIPE_PLANS.vip_monthly;
              if (account) {
                await tx
                  .insert(siteEmailOutbox)
                  .values({
                    dedupeKey: `subscription:${sub.id}:activated`,
                    recipient: account.email,
                    subject: t("subscriptionSubject"),
                    textBody: emailText(t("subscriptionBody"), {
                      name: account.name,
                      plan: plan.name,
                      amount: formatAmount(plan.amount),
                      interval: plan.interval === "year" ? "an" : "mois",
                      billingUrl: "https://dragonballfr.com/account/billing",
                      reference: sub.id,
                    }),
                  })
                  .onConflictDoNothing({ target: siteEmailOutbox.dedupeKey });
              }
            }
          }
          break;
        }

        case "checkout.session.async_payment_failed": {
          const session = event.data.object;
          const donationId =
            session.metadata?.type === "donation" ? session.metadata.donationId : null;
          if (donationId) {
            const [donation] = await tx
              .update(siteDonations)
              .set({ status: "failed", updatedAt: new Date() })
              .where(eq(siteDonations.id, donationId))
              .returning({ id: siteDonations.id });
            if (!donation) throw new Error("stripe_donation_intent_missing");
          }
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object;
          const paymentIntentId =
            typeof charge.payment_intent === "string" ? charge.payment_intent : null;
          if (paymentIntentId) {
            await tx
              .update(siteDonations)
              .set({
                ...refundedDonationState(charge.amount, charge.amount_refunded),
                updatedAt: new Date(),
              })
              .where(eq(siteDonations.stripePaymentIntentId, paymentIntentId));
          }
          break;
        }

        case "charge.dispute.created": {
          const dispute = event.data.object;
          const paymentIntentId =
            typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
          if (paymentIntentId) {
            await tx
              .update(siteDonations)
              .set({ status: "disputed", updatedAt: new Date() })
              .where(eq(siteDonations.stripePaymentIntentId, paymentIntentId));
          }
          break;
        }

        case "charge.dispute.closed": {
          const dispute = event.data.object;
          const paymentIntentId =
            typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
          if (paymentIntentId) {
            const [donation] = await tx
              .select({
                amount: siteDonations.amount,
                refundedAmount: siteDonations.refundedAmount,
              })
              .from(siteDonations)
              .where(eq(siteDonations.stripePaymentIntentId, paymentIntentId))
              .limit(1);
            if (donation) {
              await tx
                .update(siteDonations)
                .set({
                  ...closedDisputeDonationState(
                    dispute.status,
                    donation.amount,
                    donation.refundedAmount,
                  ),
                  updatedAt: new Date(),
                })
                .where(eq(siteDonations.stripePaymentIntentId, paymentIntentId));
            }
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = subscriptionSnapshot;
          await tx
            .update(baSubscription)
            .set({
              status: sub.status,
              periodStart: sub.current_period_start
                ? new Date(sub.current_period_start * 1000)
                : null,
              periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              updatedAt: new Date(),
            })
            .where(eq(baSubscription.stripeSubscriptionId, sub.id));
          break;
        }

        case "invoice.paid":
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const invoiceReason = invoice.billing_reason;
          const subscriptionId = invoiceSubscriptionSnapshot?.id;
          if (!subscriptionId) break;
          const [localSubscription] = await tx
            .select({
              userId: baSubscription.referenceId,
              plan: baSubscription.plan,
            })
            .from(baSubscription)
            .where(eq(baSubscription.stripeSubscriptionId, subscriptionId))
            .limit(1);
          if (!localSubscription) throw new Error("stripe_subscription_intent_missing");
          const [account] = await tx
            .select({ email: baUser.email, name: baUser.name })
            .from(baUser)
            .where(eq(baUser.id, localSubscription.userId))
            .limit(1);
          if (!account) break;

          if (event.type === "invoice.paid" && invoiceReason === "subscription_cycle") {
            const amount = invoice.amount_paid ?? invoice.total ?? 0;
            const currency = String(invoice.currency ?? "eur").toUpperCase();
            const formattedAmount = new Intl.NumberFormat("fr-FR", {
              style: "currency",
              currency,
            }).format(amount / 100);
            await tx
              .insert(siteEmailOutbox)
              .values({
                dedupeKey: `stripe:invoice:${invoice.id}:paid`,
                recipient: account.email,
                subject: t("renewalSubject"),
                textBody: emailText(t("renewalBody"), {
                  name: account.name,
                  amount: formattedAmount,
                  billingUrl: "https://dragonballfr.com/account/billing",
                  reference: invoice.id,
                }),
              })
              .onConflictDoNothing({ target: siteEmailOutbox.dedupeKey });
          } else if (event.type === "invoice.payment_failed") {
            await tx
              .insert(siteEmailOutbox)
              .values({
                dedupeKey: `stripe:invoice:${invoice.id}:payment_failed`,
                recipient: account.email,
                subject: t("paymentFailedSubject"),
                textBody: emailText(t("paymentFailedBody"), {
                  billingUrl: "https://dragonballfr.com/account/billing",
                  reference: invoice.id,
                }),
              })
              .onConflictDoNothing({ target: siteEmailOutbox.dedupeKey });
          }
          break;
        }
      }

      await tx
        .update(siteBillingWebhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(siteBillingWebhookEvents.id, receipt.id));
      return true;
    });

    return NextResponse.json({ received: true, duplicate: !processed });
  } catch {
    // Transaction rollback removes the receipt as well; Stripe can retry safely.
    return NextResponse.json(
      { error: "Traitement webhook temporairement indisponible" },
      { status: 500 },
    );
  }
}
