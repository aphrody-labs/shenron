"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StripeSubscription = {
  id: string;
  plan: string;
  status: string;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
};
type PaypalSubscription = { id: string; plan: string; status: string; nextBillingAt: Date | null };

export function BillingActions({
  stripeSubscriptions,
  paypalSubscriptions,
  labels,
}: {
  stripeSubscriptions: StripeSubscription[];
  paypalSubscriptions: PaypalSubscription[];
  labels: {
    manageStripe: string;
    cancelPaypal: string;
    cancellationDone: string;
    actionError: string;
    statusActive: string;
    statusTrialing: string;
    statusPastDue: string;
    statusCancelled: string;
    statusPending: string;
    statusOther: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function openStripePortal() {
    setBusy("stripe");
    setMessage(null);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error("portal");
      window.location.assign(data.url);
    } catch {
      setMessage(labels.actionError);
    } finally {
      setBusy(null);
    }
  }

  async function cancelPaypal(subscriptionId: string) {
    setBusy(subscriptionId);
    setMessage(null);
    try {
      const response = await fetch("/api/paypal/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!response.ok) throw new Error("cancel");
      setMessage(labels.cancellationDone);
      router.refresh();
    } catch {
      setMessage(labels.actionError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      {stripeSubscriptions.map((subscription) => (
        <div
          key={subscription.id}
          className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
        >
          <div>
            <p className="font-semibold">Stripe · {subscription.plan}</p>
            <p className="text-sm text-white/55">
              {subscription.status === "active"
                ? labels.statusActive
                : subscription.status === "trialing"
                  ? labels.statusTrialing
                  : subscription.status === "past_due"
                    ? labels.statusPastDue
                    : subscription.status === "canceled"
                      ? labels.statusCancelled
                      : labels.statusOther}
              {subscription.periodEnd ? ` · ${subscription.periodEnd.toLocaleDateString()}` : ""}
              {subscription.cancelAtPeriodEnd ? ` · ${labels.statusCancelled}` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={openStripePortal}
            className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {labels.manageStripe}
          </button>
        </div>
      ))}
      {paypalSubscriptions.map((subscription) => (
        <div
          key={subscription.id}
          className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
        >
          <div>
            <p className="font-semibold">PayPal · {subscription.plan}</p>
            <p className="text-sm text-white/55">
              {subscription.status === "ACTIVE"
                ? labels.statusActive
                : subscription.status === "APPROVAL_PENDING" || subscription.status === "APPROVED"
                  ? labels.statusPending
                  : subscription.status === "CANCELLED"
                    ? labels.statusCancelled
                    : labels.statusOther}
              {subscription.nextBillingAt
                ? ` · ${subscription.nextBillingAt.toLocaleDateString()}`
                : ""}
            </p>
          </div>
          {["APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED"].includes(
            subscription.status,
          ) && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => cancelPaypal(subscription.id)}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === subscription.id ? "…" : labels.cancelPaypal}
            </button>
          )}
        </div>
      ))}
      {message && (
        <p role="status" className="text-sm text-amber-200">
          {message}
        </p>
      )}
    </section>
  );
}
