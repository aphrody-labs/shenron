"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Coche } from "@aphrody/shenron-ui/icones";
import { STRIPE_PLANS } from "@/lib/billing-catalog";
import {
  PROVIDER_LABEL_KEY,
  readPaymentFailure,
  signInHref,
  type PaymentFailure,
} from "@/components/stripe/payment-errors";

type PlanKey = keyof typeof STRIPE_PLANS;
type Provider = "stripe" | "paypal";

const PLANS: { key: PlanKey; title: "monthly" | "annual"; per: "perMonth" | "perYear" }[] = [
  { key: "vip_monthly", title: "monthly", per: "perMonth" },
  { key: "vip_annual", title: "annual", per: "perYear" },
];

/**
 * The two VIP plans. Only what the code delivers is listed: ad placements flagged
 * `exemptVip` are skipped for a signed-in subscriber (`/api/ads/*`).
 */
export function VipPricingCards() {
  const locale = useLocale();
  const t = useTranslations("billing.vip");
  const tBilling = useTranslations("billing");
  const id = useId();
  const [pending, setPending] = useState<{ plan: PlanKey; provider: Provider } | null>(null);
  const [failure, setFailure] = useState<PaymentFailure | null>(null);
  const [unavailable, setUnavailable] = useState<Record<Provider, boolean>>({
    stripe: false,
    paypal: false,
  });
  const formatPrice = (amount: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(amount / 100);

  const subscribe = async (plan: PlanKey, provider: Provider) => {
    setPending({ plan, provider });
    setFailure(null);
    try {
      const response = await fetch(`/api/${provider}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!response.ok) {
        const next = await readPaymentFailure(response);
        if (next.providerUnavailable)
          setUnavailable((current) => ({ ...current, [provider]: true }));
        setFailure(next);
        return;
      }
      const data = (await response.json().catch(() => null)) as { url?: unknown } | null;
      if (typeof data?.url === "string") {
        window.location.assign(data.url);
        return;
      }
      setFailure({ key: "errors.default", providerUnavailable: false, signInRequired: false });
    } catch {
      setFailure({ key: "errors.default", providerUnavailable: false, signInRequired: false });
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      {failure && (
        <div
          role="alert"
          className={`mb-6 rounded-xl border p-4 text-sm leading-relaxed text-white ${
            failure.signInRequired
              ? "border-dbz-yellow/60 bg-dbz-yellow/10"
              : "border-dbz-red bg-dbz-red/15"
          }`}
        >
          <p>{tBilling(failure.key)}</p>
          {failure.signInRequired && (
            <Link href={signInHref()} className="toriyama-btn mt-3 normal-case tracking-normal">
              {tBilling("errors.signIn")}
            </Link>
          )}
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {PLANS.map((plan) => {
          const offer = STRIPE_PLANS[plan.key];
          const annual = plan.key === "vip_annual";
          const titleId = `${id}-${plan.key}`;
          const label = (provider: Provider) =>
            pending?.plan === plan.key && pending.provider === provider
              ? t("redirecting")
              : t(provider);
          return (
            <article
              key={plan.key}
              aria-labelledby={titleId}
              className={`toriyama-panel flex min-w-0 flex-col p-6 sm:p-7 ${annual ? "border-dbz-orange" : ""}`}
            >
              <h2 id={titleId} className="font-display text-xl font-bold text-white">
                {t(plan.title)}
              </h2>
              <p className="mt-4 font-saiyan text-4xl leading-none text-dbz-yellow tabular-nums">
                {formatPrice(offer.amount)}
                <span className="ml-2 font-sans text-base text-white/80">{t(plan.per)}</span>
              </p>
              {annual && (
                <p className="mt-2 text-sm text-white/80">
                  {t("equivalentMonthly", { amount: formatPrice(Math.round(offer.amount / 12)) })}
                </p>
              )}
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/80">
                {t(annual ? "annualDescription" : "monthlyDescription")}
              </p>
              <ul className="mt-5 grid gap-2.5 text-[0.9375rem] leading-relaxed text-white">
                {(["benefitAds", "benefitSupport"] as const).map((benefit) => (
                  <li key={benefit} className="flex gap-3">
                    <Coche size={18} className="mt-0.5 shrink-0 text-dbz-orange" aria-hidden />
                    <span>{t(benefit)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto grid gap-3 pt-7">
                <button
                  type="button"
                  disabled={pending !== null || unavailable.stripe}
                  aria-busy={pending?.plan === plan.key && pending.provider === "stripe"}
                  aria-describedby={
                    unavailable.stripe ? `${titleId} ${titleId}-stripe-off` : titleId
                  }
                  onClick={() => void subscribe(plan.key, "stripe")}
                  className="toriyama-btn min-h-12 w-full normal-case tracking-normal text-[0.9375rem]"
                >
                  {label("stripe")}
                </button>
                <button
                  type="button"
                  disabled={pending !== null || unavailable.paypal}
                  aria-busy={pending?.plan === plan.key && pending.provider === "paypal"}
                  aria-describedby={
                    unavailable.paypal ? `${titleId} ${titleId}-paypal-off` : titleId
                  }
                  onClick={() => void subscribe(plan.key, "paypal")}
                  className="toriyama-btn-secondary w-full normal-case tracking-normal"
                >
                  {label("paypal")}
                </button>
                {(["stripe", "paypal"] as const).map(
                  (provider) =>
                    unavailable[provider] && (
                      <p
                        key={provider}
                        id={`${titleId}-${provider}-off`}
                        className="text-[0.8125rem] text-white/75"
                      >
                        {tBilling("errors.providerDisabled", {
                          provider: tBilling(PROVIDER_LABEL_KEY[provider]),
                        })}
                      </p>
                    ),
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
