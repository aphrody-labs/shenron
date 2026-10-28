"use client";

import { useState } from "react";
import { STRIPE_PLANS } from "@/lib/stripe";

export function VipPricingCards() {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (planKey: "vip_monthly" | "vip_annual") => {
    try {
      setLoadingPlan(planKey);
      setError(null);

      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'accès au paiement");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingPlan(null);
    }
  };

  const monthlyPlan = STRIPE_PLANS.vip_monthly;
  const annualPlan = STRIPE_PLANS.vip_annual;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      {/* Header section */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-400 backdrop-blur-md">
          <span>👑</span> DBFR VIP CLUB
        </div>
        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-orange-400 to-amber-500">
          Rejoignez l'Élite des Guerriers Z
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-neutral-400">
          Profitez d'une expérience de lecture manga pure, sans interruption, avec des scans
          en résolution originale et un accès exclusif aux archives inédites.
        </p>

        {/* Interval Switcher */}
        <div className="mt-8 flex justify-center">
          <div className="relative flex rounded-xl border border-neutral-800 bg-neutral-900/80 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setBillingInterval("month")}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                billingInterval === "month"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Facturation Mensuelle
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("year")}
              className={`relative rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                billingInterval === "year"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Facturation Annuelle
              <span className="ml-1.5 rounded-full bg-orange-600/30 px-1.5 py-0.2 text-[10px] font-bold text-orange-300">
                -17%
              </span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-auto mt-6 max-w-md rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-center text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Cards Grid */}
      <div className="mt-10 grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
        {/* Pass Mensuel */}
        <div
          className={`relative flex flex-col justify-between rounded-3xl border p-7 backdrop-blur-md transition-all ${
            billingInterval === "month"
              ? "border-amber-500/60 bg-gradient-to-b from-amber-950/20 via-neutral-900/80 to-black shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/50"
              : "border-neutral-800/80 bg-neutral-900/40 opacity-80 hover:opacity-100"
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">Pass Mensuel</h3>
              <span className="text-xl">🌙</span>
            </div>
            <p className="mt-1 text-xs text-neutral-400">Flexibilité totale, annulable en 1 clic.</p>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-black text-amber-400">4,99 €</span>
              <span className="text-xs text-neutral-400">/ mois</span>
            </div>

            <ul className="mt-6 space-y-3 text-xs text-neutral-300">
              {monthlyPlan.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="text-amber-400 font-bold">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            disabled={loadingPlan === "vip_monthly"}
            onClick={() => handleSubscribe("vip_monthly")}
            className="mt-8 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 py-3 text-xs font-bold text-amber-300 transition-all hover:bg-amber-500 hover:text-black active:scale-98 disabled:opacity-50"
          >
            {loadingPlan === "vip_monthly" ? "Chargement..." : "Choisir le Pass Mensuel"}
          </button>
        </div>

        {/* Pass Annuel (Best Value) */}
        <div
          className={`relative flex flex-col justify-between rounded-3xl border p-7 backdrop-blur-md transition-all ${
            billingInterval === "year"
              ? "border-amber-400 bg-gradient-to-b from-orange-950/30 via-neutral-900/90 to-black shadow-2xl shadow-orange-500/15 ring-2 ring-amber-400"
              : "border-neutral-800/80 bg-neutral-900/40 opacity-80 hover:opacity-100"
          }`}
        >
          <div className="absolute -top-3.5 right-6 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-black shadow-md">
            Meilleure Offre (2 mois offerts)
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">Pass Annuel Shenron</h3>
              <span className="text-xl">🌟</span>
            </div>
            <p className="mt-1 text-xs text-neutral-400">Le choix des vrais passionnés de Dragon Ball.</p>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-black text-amber-400">49,90 €</span>
              <span className="text-xs text-neutral-400">/ an</span>
              <span className="ml-2 text-[11px] text-amber-400/80">(~4,15 € / mois)</span>
            </div>

            <ul className="mt-6 space-y-3 text-xs text-neutral-300">
              {annualPlan.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="text-amber-400 font-bold">★</span>
                  <span className={idx === 0 ? "font-semibold text-white" : ""}>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            disabled={loadingPlan === "vip_annual"}
            onClick={() => handleSubscribe("vip_annual")}
            className="mt-8 w-full rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-300 py-3 text-xs font-black text-black shadow-lg shadow-amber-500/25 transition-all hover:brightness-110 active:scale-98 disabled:opacity-50"
          >
            {loadingPlan === "vip_annual" ? "Chargement..." : "Débloquer l'Accès Annuel ⚡"}
          </button>
        </div>
      </div>
    </div>
  );
}
