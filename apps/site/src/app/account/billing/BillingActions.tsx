"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { readPaymentFailure } from "@/components/stripe/payment-errors";

type StripeSubscription = {
  id: string;
  plan: string;
  status: string;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
};
type PaypalSubscription = { id: string; plan: string; status: string; nextBillingAt: Date | null };
type Feedback = { tone: "error" | "notice"; text: string } | null;

const CANCELLABLE_PAYPAL = new Set(["APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED"]);

function stripeStatusKey(status: string): string {
  return (
    {
      active: "statusActive",
      trialing: "statusTrialing",
      past_due: "statusPastDue",
      canceled: "statusCancelled",
    }[status] ?? "statusOther"
  );
}

function paypalStatusKey(status: string): string {
  return (
    {
      ACTIVE: "statusActive",
      APPROVAL_PENDING: "statusPending",
      APPROVED: "statusPending",
      CANCELLED: "statusCancelled",
    }[status] ?? "statusOther"
  );
}

/** `vip_monthly` / `vip_annual` → the plan names shown on /vip. */
function planKey(plan: string): string | null {
  if (plan.includes("annual")) return "vip.annual";
  if (plan.includes("monthly")) return "vip.monthly";
  return null;
}

export function BillingActions({
  stripeSubscriptions,
  paypalSubscriptions,
}: {
  stripeSubscriptions: StripeSubscription[];
  paypalSubscriptions: PaypalSubscription[];
}) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const date = (value: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(value);
  const planName = (plan: string) => {
    const key = planKey(plan);
    return key ? t(key) : plan;
  };

  async function openStripePortal() {
    setBusy("stripe");
    setFeedback(null);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      if (!response.ok) {
        setFeedback({ tone: "error", text: t((await readPaymentFailure(response)).key) });
        setBusy(null);
        return;
      }
      const data = (await response.json().catch(() => null)) as { url?: unknown } | null;
      if (typeof data?.url !== "string") throw new Error("portal");
      window.location.assign(data.url);
    } catch {
      setFeedback({ tone: "error", text: t("errors.default") });
      setBusy(null);
    }
  }

  async function cancelPaypal(subscriptionId: string) {
    setBusy(subscriptionId);
    setFeedback(null);
    try {
      const response = await fetch("/api/paypal/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!response.ok) {
        setFeedback({ tone: "error", text: t((await readPaymentFailure(response)).key) });
        return;
      }
      setFeedback({ tone: "notice", text: t("cancellationDone") });
      setConfirming(null);
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: t("errors.default") });
    } finally {
      setBusy(null);
    }
  }

  if (stripeSubscriptions.length === 0 && paypalSubscriptions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-dbz-border p-5">
        <p className="text-[0.9375rem] text-white/80">{t("noSubscriptions")}</p>
        <Link
          href="/vip"
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-dbz-orange underline underline-offset-4 hover:text-dbz-yellow"
        >
          {t("vipLink")}
        </Link>
      </div>
    );
  }

  const row =
    "flex min-w-0 flex-col gap-4 rounded-xl border border-dbz-border bg-dbz-card p-5 sm:flex-row sm:items-center sm:justify-between";

  return (
    <div className="grid gap-3">
      {stripeSubscriptions.map((subscription) => (
        <article key={subscription.id} className={row}>
          <div className="min-w-0">
            <h3 className="font-semibold text-white">{planName(subscription.plan)}</h3>
            <p className="text-sm text-white/75">{t("providerStripe")}</p>
            <p className="mt-1 text-sm text-white">{t(stripeStatusKey(subscription.status))}</p>
            {subscription.periodEnd && (
              <p className="text-sm text-white/75">
                {t(subscription.cancelAtPeriodEnd ? "endsOn" : "renewsOn", {
                  date: date(subscription.periodEnd),
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={busy !== null}
            aria-busy={busy === "stripe"}
            onClick={() => void openStripePortal()}
            className="toriyama-btn-secondary shrink-0 normal-case tracking-normal"
          >
            {t("manageStripe")}
          </button>
        </article>
      ))}
      {paypalSubscriptions.map((subscription) => (
        <article key={subscription.id} className={row}>
          <div className="min-w-0">
            <h3 className="font-semibold text-white">{planName(subscription.plan)}</h3>
            <p className="text-sm text-white/75">{t("providerPaypal")}</p>
            <p className="mt-1 text-sm text-white">{t(paypalStatusKey(subscription.status))}</p>
            {subscription.nextBillingAt && subscription.status === "ACTIVE" && (
              <p className="text-sm text-white/75">
                {t("nextBilling", { date: date(subscription.nextBillingAt) })}
              </p>
            )}
          </div>
          {CANCELLABLE_PAYPAL.has(subscription.status) &&
            (confirming === subscription.id ? (
              <div className="grid shrink-0 gap-2 sm:max-w-xs">
                <p className="text-sm text-white">{t("cancelConfirm")}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    aria-busy={busy === subscription.id}
                    onClick={() => void cancelPaypal(subscription.id)}
                    className="btn btn-danger min-h-11 normal-case tracking-normal"
                  >
                    {t("confirmCancel")}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setConfirming(null)}
                    className="toriyama-btn-secondary normal-case tracking-normal"
                  >
                    {t("keepSubscription")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirming(subscription.id)}
                className="toriyama-btn-secondary shrink-0 normal-case tracking-normal"
              >
                {t("cancelPaypal")}
              </button>
            ))}
        </article>
      ))}
      {feedback && (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={`rounded-xl border p-4 text-sm leading-relaxed text-white ${
            feedback.tone === "error"
              ? "border-dbz-red bg-dbz-red/15"
              : "border-dbz-yellow/60 bg-dbz-yellow/10"
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
