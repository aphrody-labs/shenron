"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { STRIPE_PLANS } from "@/lib/billing-catalog";

type PlanKey = keyof typeof STRIPE_PLANS;

export function VipPricingCards() {
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const t = useTranslations("billing.vip");
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formatPrice = (amount: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(amount / 100);

  const handleSubscribe = async (plan: PlanKey, provider: "stripe" | "paypal") => {
    setLoadingPlan(plan);
    setError(null);
    try {
      const response = await fetch(`/api/${provider}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await response.json().catch(() => null)) as {
        url?: unknown;
        error?: unknown;
      } | null;
      if (response.status === 401) {
        window.location.assign("/signin?callbackURL=%2Fvip");
        return;
      }
      if (!response.ok) {
        setError(response.status === 409 ? t("subscriptionExists") : t("paymentError"));
        return;
      }
      if (typeof data?.url === "string") {
        window.location.assign(data.url);
        return;
      }
      setError(t("paymentError"));
    } catch {
      setError(t("paymentError"));
    } finally {
      setLoadingPlan(null);
    }
  };

  const plans: { key: PlanKey; title: string; description: string; cta: string }[] = [
    {
      key: "vip_monthly",
      title: t("monthly"),
      description: t("monthlyDescription"),
      cta: t("chooseMonthly"),
    },
    {
      key: "vip_annual",
      title: t("annual"),
      description: t("annualDescription"),
      cta: t("chooseAnnual"),
    },
  ];

  return (
    <section aria-labelledby="vip-title" className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <header className="mx-auto max-w-2xl text-center">
        <p className="inline-flex min-h-9 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-amber-300">
          {t("eyebrow")}
        </p>
        <h1
          id="vip-title"
          className="mt-5 text-balance font-display text-3xl font-bold leading-tight text-white sm:text-5xl"
        >
          {t("title")}
        </h1>
        <p className="mx-auto mt-4 max-w-prose text-base leading-relaxed text-neutral-300">
          {t("description")}
        </p>
      </header>

      {error && (
        <p
          className="mx-auto mt-6 max-w-2xl rounded-xl border border-red-400/40 bg-red-950/50 p-4 text-sm leading-relaxed text-red-100"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2 md:gap-6">
        {plans.map((plan) => {
          const annual = plan.key === "vip_annual";
          const offer = STRIPE_PLANS[plan.key];
          const busy = loadingPlan === plan.key;
          const equivalent = formatPrice(Math.round(offer.amount / 12));
          return (
            <article
              key={plan.key}
              aria-labelledby={`${plan.key}-title`}
              className={`relative flex h-full flex-col rounded-2xl border p-6 sm:p-7 ${
                annual
                  ? "border-amber-400/70 bg-gradient-to-b from-amber-950/40 to-neutral-950 ring-1 ring-amber-400/30"
                  : "border-white/15 bg-neutral-950/70"
              }`}
            >
              {annual && (
                <span className="absolute -top-3 right-5 rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-black">
                  {t("recommended")}: {t("twoMonthsFree")}
                </span>
              )}
              <div>
                <h2
                  id={`${plan.key}-title`}
                  className="font-display text-xl font-semibold text-white"
                >
                  {plan.title}
                </h2>
                <p className="mt-2 min-h-12 text-sm leading-relaxed text-neutral-300">
                  {plan.description}
                </p>
                <p className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-display text-4xl font-bold tabular-nums text-amber-300">
                    {formatPrice(offer.amount)}
                  </span>
                  <span className="text-sm text-neutral-300">
                    {annual ? t("perYear") : t("perMonth")}
                  </span>
                </p>
                {annual && (
                  <p className="mt-1 text-sm text-neutral-300">
                    {t("equivalentMonthly", { amount: equivalent })}
                  </p>
                )}
                <ul className="mt-6 space-y-3 text-sm leading-relaxed text-neutral-200">
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="font-bold text-amber-300">
                      ✓
                    </span>
                    <span>{t("benefitAds")}</span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="font-bold text-amber-300">
                      ✓
                    </span>
                    <span>{t("benefitSupport")}</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8 grid gap-3">
                <button
                  type="button"
                  disabled={loadingPlan !== null}
                  aria-busy={busy}
                  onClick={() => void handleSubscribe(plan.key, "stripe")}
                  className="min-h-11 rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-neutral-950 transition-colors hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? tCommon("loading") : t("stripe")}
                </button>
                <button
                  type="button"
                  disabled={loadingPlan !== null}
                  aria-busy={busy}
                  onClick={() => void handleSubscribe(plan.key, "paypal")}
                  className="min-h-11 rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? tCommon("loading") : t("paypal")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
