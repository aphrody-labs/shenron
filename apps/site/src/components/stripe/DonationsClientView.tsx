"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DonationModal, type DonationTierId } from "@/components/stripe/DonationModal";
import { DONATION_TIERS } from "@/lib/billing-catalog";

type PublicDonation = { id: string; donorName: string; amount: number; message: string | null };
type Wall = { state: "loading" } | { state: "error" } | { state: "ready"; items: PublicDonation[] };

/** Name the public API substitutes for an anonymous donation (`/api/stripe/donate`, GET). */
const ANONYMOUS_SENTINEL = "Guerrier Z Anonyme";

const LINK =
  "inline-flex min-h-11 items-center text-sm text-white/80 underline underline-offset-4 hover:text-dbz-yellow";

export function DonationsClientView() {
  const t = useTranslations("billing.donations");
  const tBilling = useTranslations("billing");
  const locale = useLocale();
  const [dialog, setDialog] = useState<{ open: boolean; tier: DonationTierId }>({
    open: false,
    tier: "dragon_ball",
  });
  const [wall, setWall] = useState<Wall>({ state: "loading" });
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const formatEuros = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);

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
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tBilling]);

  // The list is informative only; payment status is never inferred from it. A failure
  // (503 donations_unavailable or network) is shown as such, never as an empty list.
  const loadWall = useCallback(async () => {
    try {
      const response = await fetch("/api/stripe/donate");
      const data = (await response.json()) as { donations?: PublicDonation[] };
      if (!response.ok || !Array.isArray(data.donations)) throw new Error("wall");
      setWall({ state: "ready", items: data.donations });
    } catch {
      setWall({ state: "error" });
    }
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the state is set after the fetch resolves
    void loadWall();
  }, [loadWall]);

  const open = (tier: DonationTierId) => setDialog({ open: true, tier });

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={() => open("dragon_ball")}
          className="toriyama-btn min-h-12 normal-case tracking-normal text-[0.9375rem]"
        >
          {t("title")}
        </button>
        <Link href="/vip" className={LINK}>
          {tBilling("vipLink")}
        </Link>
        <Link href="/account/billing" className={LINK}>
          {tBilling("accountBillingLink")}
        </Link>
      </div>

      {paymentNotice && (
        <output className="mt-6 block rounded-xl border border-dbz-yellow/60 bg-dbz-yellow/10 p-4 text-sm leading-relaxed text-white">
          {paymentNotice}
        </output>
      )}

      <section aria-labelledby="donation-amounts" className="mt-12">
        <h2 id="donation-amounts" className="font-display text-xl font-bold text-white">
          {t("amountsTitle")}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {DONATION_TIERS.map((tier) => (
            <li
              key={tier.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-dbz-border bg-dbz-card px-4 py-3"
            >
              <span className="text-[0.9375rem] text-white">{t(`tiers.${tier.id}`)}</span>
              <button
                type="button"
                onClick={() => open(tier.id)}
                className="toriyama-btn-secondary normal-case tracking-normal tabular-nums"
              >
                {t("give", { amount: formatEuros(tier.amount) })}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="donation-wall" className="mt-12">
        <h2 id="donation-wall" className="font-display text-xl font-bold text-white">
          {t("wallTitle")}
        </h2>
        <p className="mt-1 text-sm text-white/75">{t("wallLead")}</p>
        <div className="mt-4" aria-live="polite" aria-busy={wall.state === "loading"}>
          {wall.state === "loading" && <p className="text-sm text-white/75">{t("loading")}</p>}
          {wall.state === "error" && (
            <div className="rounded-xl border border-dbz-border p-4 text-sm text-white/80">
              <p>{tBilling("errors.donations_unavailable")}</p>
              <button
                type="button"
                onClick={() => {
                  setWall({ state: "loading" });
                  void loadWall();
                }}
                className="toriyama-btn-secondary mt-3 normal-case tracking-normal"
              >
                {tBilling("errors.retry")}
              </button>
            </div>
          )}
          {wall.state === "ready" && wall.items.length === 0 && (
            <div className="rounded-xl border border-dashed border-dbz-border p-5 text-sm text-white/80">
              <p>{t("wallEmpty")}</p>
              <button
                type="button"
                onClick={() => open("dragon_ball")}
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-dbz-orange underline underline-offset-4 hover:text-dbz-yellow"
              >
                {t("title")}
              </button>
            </div>
          )}
          {wall.state === "ready" && wall.items.length > 0 && (
            <ul className="divide-y divide-dbz-border rounded-xl border border-dbz-border bg-dbz-card">
              {wall.items.map((donation) => (
                <li key={donation.id} className="flex min-w-0 items-start gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white [overflow-wrap:anywhere]">
                      {donation.donorName === ANONYMOUS_SENTINEL
                        ? t("anonymous")
                        : donation.donorName}
                    </p>
                    {donation.message && (
                      <p className="mt-0.5 text-sm text-white/75 [overflow-wrap:anywhere]">
                        {donation.message}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-dbz-yellow">
                    {formatEuros(donation.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <DonationModal
        isOpen={dialog.open}
        initialTier={dialog.tier}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
      />
    </>
  );
}
