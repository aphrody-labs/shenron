import { and, eq, gt, inArray, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  baSubscription,
  baUser,
  sitePaypalSubscriptions,
  siteSubscriptionCheckoutReservations,
} from "@/db/schema";

const STRIPE_BLOCKING_STATUSES = ["active", "trialing", "past_due", "incomplete", "unpaid"];
const PAYPAL_BLOCKING_STATUSES = [
  "APPROVAL_PENDING",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "PAYMENT_FAILED",
];
const RESERVATION_TTL_MS = 24 * 60 * 60_000;

/** Atomically reserve one account for a provider checkout, shared by Stripe and PayPal. */
export async function reserveSubscriptionCheckout(input: {
  userId: string;
  provider: "stripe" | "paypal";
  plan: "vip_monthly" | "vip_annual";
}): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: baUser.id })
      .from(baUser)
      .where(eq(baUser.id, input.userId))
      .for("update")
      .limit(1);
    if (!user) return null;

    const now = new Date();
    const [stripe, paypal, reservation] = await Promise.all([
      tx
        .select({ id: baSubscription.id })
        .from(baSubscription)
        .where(
          and(
            eq(baSubscription.referenceId, input.userId),
            inArray(baSubscription.status, STRIPE_BLOCKING_STATUSES),
            or(isNull(baSubscription.periodEnd), gt(baSubscription.periodEnd, now)),
          ),
        )
        .limit(1),
      tx
        .select({ id: sitePaypalSubscriptions.id })
        .from(sitePaypalSubscriptions)
        .where(
          and(
            eq(sitePaypalSubscriptions.userId, input.userId),
            inArray(sitePaypalSubscriptions.status, PAYPAL_BLOCKING_STATUSES),
            or(
              eq(sitePaypalSubscriptions.status, "PAYMENT_FAILED"),
              isNull(sitePaypalSubscriptions.nextBillingAt),
              gt(sitePaypalSubscriptions.nextBillingAt, now),
            ),
          ),
        )
        .limit(1),
      tx
        .select({
          id: siteSubscriptionCheckoutReservations.id,
          provider: siteSubscriptionCheckoutReservations.provider,
          plan: siteSubscriptionCheckoutReservations.plan,
        })
        .from(siteSubscriptionCheckoutReservations)
        .where(
          and(
            eq(siteSubscriptionCheckoutReservations.userId, input.userId),
            gt(siteSubscriptionCheckoutReservations.expiresAt, now),
          ),
        )
        .limit(1),
    ]);
    if (stripe.length || paypal.length) return null;
    if (reservation.length) {
      const existing = reservation[0]!;
      return existing.provider === input.provider && existing.plan === input.plan
        ? existing.id
        : null;
    }

    await tx
      .delete(siteSubscriptionCheckoutReservations)
      .where(eq(siteSubscriptionCheckoutReservations.userId, input.userId));
    const [created] = await tx
      .insert(siteSubscriptionCheckoutReservations)
      .values({
        userId: input.userId,
        provider: input.provider,
        plan: input.plan,
        expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
      })
      .returning({ id: siteSubscriptionCheckoutReservations.id });
    return created?.id ?? null;
  });
}

/** Release a reservation only after the provider definitively rejected checkout creation. */
export async function releaseSubscriptionCheckout(input: {
  userId: string;
  provider: "stripe" | "paypal";
  reservationId: string;
}): Promise<void> {
  await db
    .delete(siteSubscriptionCheckoutReservations)
    .where(
      and(
        eq(siteSubscriptionCheckoutReservations.id, input.reservationId),
        eq(siteSubscriptionCheckoutReservations.userId, input.userId),
        eq(siteSubscriptionCheckoutReservations.provider, input.provider),
      ),
    );
}
