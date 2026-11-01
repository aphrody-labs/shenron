"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DonationModal } from "@/components/stripe/DonationModal";
import { DONATION_TIERS } from "@/lib/billing-catalog";

export function DonationsClientView() {
  const [modalOpen, setModalOpen] = useState(false);
  const [donations, setDonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const tBilling = useTranslations("billing");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const query = new URLSearchParams(window.location.search);
      const token = query.get("token");
      if (query.get("provider") === "paypal" && token && query.get("result") === "approved") {
        try {
          const response = await fetch("/api/paypal/donate/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: token }),
          });
          if (!response.ok) throw new Error("capture");
          if (!cancelled) setPaymentNotice(tBilling("paypalCompleted"));
        } catch {
          if (!cancelled) setPaymentNotice(tBilling("paypalCapturePending"));
        }
        window.history.replaceState({}, "", "/donations");
      } else if (query.get("provider") === "paypal" && query.get("result") === "cancelled") {
        if (!cancelled) setPaymentNotice(tBilling("paypalCancelled"));
        window.history.replaceState({}, "", "/donations");
      }

      try {
        const response = await fetch("/api/stripe/donate");
        const data = await response.json();
        if (!cancelled && data.donations) setDonations(data.donations);
      } catch {
        // The wall of supporters is optional; payment status is never inferred here.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tBilling]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3.5 py-1 text-xs font-semibold text-orange-400 backdrop-blur-md">
          <span>⚡</span> SOUTIEN COMMUNAUTAIRE
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-orange-300 via-amber-400 to-yellow-200">
          La Genki Dama des Lecteurs
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-neutral-400">
          Dragon Ball FR est maintenu par des passionnés, pour des passionnés. Chaque contribution
          alimente directement l'hébergement haute vitesse et la numérisation des trésors Toriyama.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 px-7 py-3.5 text-sm font-black text-black shadow-xl shadow-amber-500/20 transition-all hover:brightness-110 active:scale-98"
          >
            <span>🐉</span>
            <span>Contribuer à la Genki Dama</span>
          </button>
          <Link
            href="/vip"
            className="flex items-center gap-2 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-5 py-3.5 text-sm font-bold text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            <span>⚡</span>
            <span>{tBilling("vipLink")}</span>
          </Link>
        </div>
        <p className="mt-3 text-xs text-neutral-400">
          <Link
            href="/account/billing"
            className="underline underline-offset-4 hover:text-amber-300"
          >
            {tBilling("accountBillingLink")}
          </Link>
        </p>
      </div>

      {paymentNotice && (
        <p className="mt-5 text-center text-sm text-amber-200" role="status">
          {paymentNotice}
        </p>
      )}

      {/* Paliers visuels */}
      <div className="mt-16">
        <h3 className="text-center font-bold text-lg text-white mb-6">Les Paliers d'Énergie</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DONATION_TIERS.map((tier) => (
            <div
              key={tier.id}
              className="flex flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 backdrop-blur-md transition-all hover:border-amber-500/40 hover:bg-neutral-900/90"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{tier.badge}</span>
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-400">
                    {(tier.amount / 100).toFixed(2)} €
                  </span>
                </div>
                <h4 className="mt-4 font-bold text-white text-sm">{tier.name}</h4>
                <p className="mt-1 text-xs text-neutral-400">{tier.description}</p>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-6 w-full rounded-xl border border-neutral-700 bg-neutral-800/60 py-2 text-xs font-semibold text-neutral-200 transition-colors hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-300"
              >
                Offrir ce palier
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Mur des Donateurs */}
      <div className="mt-16 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8 backdrop-blur-md">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <h3 className="font-bold text-base text-white">Mur des Bienfaiteurs</h3>
          </div>
          <span className="text-xs text-neutral-400">Dernières contributions</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            Chargement des donateurs...
          </div>
        ) : donations.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            Soyez le premier à offrir votre énergie pour inaugurer le mur !
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {donations.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-xl border border-neutral-800/80 bg-neutral-900/80 p-3.5"
              >
                <div>
                  <div className="font-semibold text-xs text-white flex items-center gap-1.5">
                    <span>🥋</span>
                    <span>{d.donorName}</span>
                  </div>
                  {d.message && (
                    <p className="text-[11px] text-neutral-400 italic mt-0.5 max-w-xs truncate">
                      "{d.message}"
                    </p>
                  )}
                </div>
                <span className="font-bold text-amber-400 text-xs">
                  +{(d.amount / 100).toFixed(2)} €
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <DonationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
