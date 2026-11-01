import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  baUser,
  siteBillingWebhookEvents,
  siteDonations,
  siteEmailOutbox,
  sitePaypalSubscriptions,
  siteSubscriptionCheckoutReservations,
} from "@/db/schema";
import { paypalRequest, verifyPayPalWebhook } from "@/lib/paypal";
import { getTranslations } from "next-intl/server";
import { STRIPE_PLANS } from "@/lib/billing-catalog";

type PayPalSubscriptionState = {
  id: string;
  status: string;
  custom_id?: string;
  start_time?: string;
  status_update_time?: string;
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { time?: string };
  };
};

type PayPalOrder = {
  status: string;
  purchase_units?: {
    custom_id?: string;
    payments?: { captures?: { id: string; status: string }[] };
  }[];
};

const emailText = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
const formatAmount = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount / 100);

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload webhook invalide" }, { status: 400 });
  }

  let verified: boolean;
  try {
    verified = await verifyPayPalWebhook(request.headers, rawBody);
  } catch {
    return NextResponse.json({ error: "Vérification PayPal indisponible" }, { status: 503 });
  }
  if (!verified) {
    return NextResponse.json({ error: "Signature webhook invalide" }, { status: 400 });
  }
  if (typeof event.id !== "string" || typeof event.event_type !== "string") {
    return NextResponse.json({ error: "Identifiant événement PayPal manquant" }, { status: 400 });
  }
  const t = await getTranslations({ locale: "fr", namespace: "billingEmail" });

  let subscription: PayPalSubscriptionState | null = null;
  let order: PayPalOrder | null = null;
  const subscriptionEvents = new Set([
    "BILLING.SUBSCRIPTION.ACTIVATED",
    "BILLING.SUBSCRIPTION.UPDATED",
    "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.EXPIRED",
  ]);

  try {
    if (subscriptionEvents.has(event.event_type) && typeof event.resource?.id === "string") {
      subscription = await paypalRequest<PayPalSubscriptionState>(
        `/v1/billing/subscriptions/${encodeURIComponent(event.resource.id)}`,
      );
    }
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" && typeof orderId === "string") {
      order = await paypalRequest<PayPalOrder>(
        `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      );
    }

    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(siteBillingWebhookEvents)
        .values({
          id: `paypal_${event.id}`,
          provider: "paypal",
          eventId: event.id,
          eventType: event.event_type,
        })
        .onConflictDoNothing({
          target: [siteBillingWebhookEvents.provider, siteBillingWebhookEvents.eventId],
        })
        .returning({ id: siteBillingWebhookEvents.id });
      if (!receipt) return;

      if (subscription) {
        const status = subscription.status;
        let [localSubscription] = await tx
          .update(sitePaypalSubscriptions)
          .set({
            status,
            startedAt: subscription.start_time ? new Date(subscription.start_time) : undefined,
            nextBillingAt: subscription.billing_info?.next_billing_time
              ? new Date(subscription.billing_info.next_billing_time)
              : null,
            lastPaymentAt: subscription.billing_info?.last_payment?.time
              ? new Date(subscription.billing_info.last_payment.time)
              : undefined,
            cancelledAt:
              status === "CANCELLED"
                ? new Date(subscription.status_update_time ?? Date.now())
                : null,
            updatedAt: new Date(),
          })
          .where(eq(sitePaypalSubscriptions.paypalSubscriptionId, subscription.id))
          .returning({
            id: sitePaypalSubscriptions.id,
            userId: sitePaypalSubscriptions.userId,
            plan: sitePaypalSubscriptions.plan,
            startedAt: sitePaypalSubscriptions.startedAt,
          });
        if (!localSubscription && subscription.custom_id) {
          const [reservation] = await tx
            .select({
              userId: siteSubscriptionCheckoutReservations.userId,
              plan: siteSubscriptionCheckoutReservations.plan,
            })
            .from(siteSubscriptionCheckoutReservations)
            .where(
              and(
                eq(siteSubscriptionCheckoutReservations.userId, subscription.custom_id),
                eq(siteSubscriptionCheckoutReservations.provider, "paypal"),
              ),
            )
            .limit(1);
          if (reservation) {
            [localSubscription] = await tx
              .insert(sitePaypalSubscriptions)
              .values({
                id: `pp_${subscription.id}`,
                userId: reservation.userId,
                plan: reservation.plan,
                paypalSubscriptionId: subscription.id,
                status,
                startedAt: subscription.start_time ? new Date(subscription.start_time) : undefined,
                nextBillingAt: subscription.billing_info?.next_billing_time
                  ? new Date(subscription.billing_info.next_billing_time)
                  : null,
              })
              .onConflictDoNothing({ target: sitePaypalSubscriptions.paypalSubscriptionId })
              .returning({
                id: sitePaypalSubscriptions.id,
                userId: sitePaypalSubscriptions.userId,
                plan: sitePaypalSubscriptions.plan,
                startedAt: sitePaypalSubscriptions.startedAt,
              });
            await tx
              .delete(siteSubscriptionCheckoutReservations)
              .where(eq(siteSubscriptionCheckoutReservations.userId, reservation.userId));
          }
        }
        if (!localSubscription) throw new Error("paypal_subscription_intent_missing");
        if (localSubscription?.userId && status === "ACTIVE") {
          const [account] = await tx
            .select({ email: baUser.email, name: baUser.name })
            .from(baUser)
            .where(eq(baUser.id, localSubscription.userId))
            .limit(1);
          const plan =
            localSubscription.plan === "vip_annual"
              ? STRIPE_PLANS.vip_annual
              : STRIPE_PLANS.vip_monthly;
          if (account) {
            await tx
              .insert(siteEmailOutbox)
              .values({
                dedupeKey: `subscription:${subscription.id}:activated`,
                recipient: account.email,
                subject: t("subscriptionSubject"),
                textBody: emailText(t("subscriptionBody"), {
                  name: account.name,
                  plan: plan.name,
                  amount: formatAmount(plan.amount),
                  interval: plan.interval === "year" ? "an" : "mois",
                  billingUrl: "https://dragonballfr.com/account/billing",
                  reference: subscription.id,
                }),
              })
              .onConflictDoNothing({ target: siteEmailOutbox.dedupeKey });
          }
        }
      } else if (event.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
        const subscriptionId = event.resource?.id;
        if (typeof subscriptionId === "string") {
          const [updated] = await tx
            .update(sitePaypalSubscriptions)
            .set({ status: "PAYMENT_FAILED", updatedAt: new Date() })
            .where(eq(sitePaypalSubscriptions.paypalSubscriptionId, subscriptionId))
            .returning({
              id: sitePaypalSubscriptions.id,
              userId: sitePaypalSubscriptions.userId,
            });
          if (!updated) throw new Error("paypal_subscription_intent_missing");
          const [account] = updated.userId
            ? await tx
                .select({ email: baUser.email })
                .from(baUser)
                .where(eq(baUser.id, updated.userId))
                .limit(1)
            : [];
          if (account) {
            await tx
              .insert(siteEmailOutbox)
              .values({
                dedupeKey: `paypal:subscription:${subscriptionId}:payment_failed:${event.id}`,
                recipient: account.email,
                subject: t("paymentFailedSubject"),
                textBody: emailText(t("paymentFailedBody"), {
                  billingUrl: "https://dragonballfr.com/account/billing",
                  reference: event.id,
                }),
              })
              .onConflictDoNothing({ target: siteEmailOutbox.dedupeKey });
          }
        }
      } else if (event.event_type === "PAYMENT.SALE.COMPLETED") {
        const subscriptionId = event.resource?.billing_agreement_id;
        if (typeof subscriptionId === "string") {
          const [updated] = await tx
            .update(sitePaypalSubscriptions)
            .set({
              lastPaymentAt: event.resource.update_time
                ? new Date(event.resource.update_time)
                : new Date(),
              updatedAt: new Date(),
            })
            .where(eq(sitePaypalSubscriptions.paypalSubscriptionId, subscriptionId))
            .returning({
              id: sitePaypalSubscriptions.id,
              userId: sitePaypalSubscriptions.userId,
              plan: sitePaypalSubscriptions.plan,
              startedAt: sitePaypalSubscriptions.startedAt,
            });
          if (!updated) throw new Error("paypal_subscription_intent_missing");
          const paidAt = event.resource.update_time
            ? new Date(event.resource.update_time)
            : new Date();
          if (
            !updated.startedAt ||
            paidAt.getTime() - updated.startedAt.getTime() >= 24 * 60 * 60 * 1000
          ) {
            const [account] = updated.userId
              ? await tx
                  .select({ email: baUser.email, name: baUser.name })
                  .from(baUser)
                  .where(eq(baUser.id, updated.userId))
                  .limit(1)
              : [];
            const amount = Number(event.resource.amount?.total);
            const currency = String(event.resource.amount?.currency ?? "EUR").toUpperCase();
            if (account && Number.isFinite(amount) && /^[A-Z]{3}$/.test(currency)) {
              const formattedAmount = new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency,
              }).format(amount);
              await tx
                .insert(siteEmailOutbox)
                .values({
                  dedupeKey: `paypal:sale:${event.resource.id}:renewal`,
                  recipient: account.email,
                  subject: t("renewalSubject"),
                  textBody: emailText(t("renewalBody"), {
                    name: account.name,
                    amount: formattedAmount,
                    billingUrl: "https://dragonballfr.com/account/billing",
                    reference: event.resource.id,
                  }),
                })
                .onConflictDoNothing({ target: siteEmailOutbox.dedupeKey });
            }
          }
        }
      } else if (
        event.event_type === "PAYMENT.CAPTURE.COMPLETED" &&
        order?.status === "COMPLETED"
      ) {
        const donationId = order.purchase_units?.[0]?.custom_id;
        const captureId = event.resource.id;
        const relatedOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
        if (
          typeof donationId === "string" &&
          typeof captureId === "string" &&
          typeof relatedOrderId === "string"
        ) {
          const [donation] = await tx
            .update(siteDonations)
            .set({
              status: "succeeded",
              paypalCaptureId: captureId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(siteDonations.id, donationId),
                or(
                  eq(siteDonations.paypalOrderId, relatedOrderId),
                  isNull(siteDonations.paypalOrderId),
                ),
                eq(siteDonations.paymentProvider, "paypal"),
              ),
            )
            .returning();
          if (!donation) throw new Error("paypal_donation_intent_missing");
          {
            let recipient = donation.donorEmail;
            if (!recipient && donation.userId) {
              const [account] = await tx
                .select({ email: baUser.email })
                .from(baUser)
                .where(eq(baUser.id, donation.userId))
                .limit(1);
              recipient = account?.email ?? null;
            }
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
        }
      } else if (
        (event.event_type === "PAYMENT.CAPTURE.REFUNDED" ||
          event.event_type === "PAYMENT.CAPTURE.REVERSED") &&
        typeof event.resource?.id === "string"
      ) {
        await tx
          .update(siteDonations)
          .set({ status: "refunded", updatedAt: new Date() })
          .where(eq(siteDonations.paypalCaptureId, event.resource.id));
      }

      await tx
        .update(siteBillingWebhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(siteBillingWebhookEvents.id, receipt.id));
    });

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Traitement webhook temporairement indisponible" },
      { status: 500 },
    );
  }
}
