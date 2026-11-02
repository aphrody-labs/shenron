"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Croix } from "@aphrody/shenron-ui/icones";
import { DONATION_TIERS } from "@/lib/billing-catalog";
import Link from "next/link";
import {
  PROVIDER_LABEL_KEY,
  readPaymentFailure,
  signInHref,
  type PaymentFailure,
} from "@/components/stripe/payment-errors";

export type DonationTierId = (typeof DONATION_TIERS)[number]["id"] | "custom";
type Provider = "stripe" | "paypal";

const MIN_CENTS = 100;
const MAX_CENTS = 500_000;

const FIELD =
  "min-h-12 w-full rounded-xl border border-dbz-border bg-dbz-bg px-4 text-base text-white placeholder:text-white/50 transition-colors focus:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange disabled:opacity-50";
const CHOICE =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dbz-border bg-dbz-bg px-4 py-2 text-[0.9375rem] text-white transition-colors hover:border-dbz-yellow has-[:checked]:border-dbz-orange has-[:checked]:bg-dbz-orange/10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-dbz-orange has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";
const RADIO = "h-5 w-5 shrink-0 accent-[var(--color-dbz-orange)]";

/**
 * Donation form in a native modal `<dialog>`: focus is trapped and restored by the
 * browser, Escape closes it, the backdrop is the top layer. `@base-ui/react` is not
 * a dependency of the site (isolated linker), and the native element covers the need.
 */
export function DonationModal({
  isOpen,
  initialTier,
  onClose,
}: {
  isOpen: boolean;
  initialTier: DonationTierId;
  onClose: () => void;
}) {
  const t = useTranslations("billing.donations");
  const td = useTranslations("billing.donations.dialog");
  const tBilling = useTranslations("billing");
  const locale = useLocale();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [tier, setTier] = useState<DonationTierId>(initialTier);
  const [customAmount, setCustomAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [provider, setProvider] = useState<Provider>("stripe");
  const [loading, setLoading] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [error, setError] = useState<PaymentFailure | null>(null);
  const [unavailable, setUnavailable] = useState<Record<Provider, boolean>>({
    stripe: false,
    paypal: false,
  });

  const formatEuros = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      setTier(initialTier);
      setError(null);
      setAmountError(false);
      dialog.showModal();
    } else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen, initialTier]);

  const preset = DONATION_TIERS.find((item) => item.id === tier);
  const amount = tier === "custom" ? Math.round(Number(customAmount) * 100) : (preset?.amount ?? 0);
  const amountValid = Number.isSafeInteger(amount) && amount >= MIN_CENTS && amount <= MAX_CENTS;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!amountValid) {
      setAmountError(true);
      amountRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/${provider}/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId: tier === "custom" ? undefined : tier,
          amount,
          donorName: isAnonymous ? "" : donorName.trim(),
          message: message.trim(),
          isAnonymous,
        }),
      });
      if (!response.ok) {
        const failure = await readPaymentFailure(response);
        if (failure.providerUnavailable) {
          const next = { ...unavailable, [provider]: true };
          setUnavailable(next);
          const other = provider === "stripe" ? "paypal" : "stripe";
          if (!next[other]) setProvider(other);
        }
        setError(failure);
        setLoading(false);
        return;
      }
      const data = (await response.json().catch(() => null)) as { url?: unknown } | null;
      if (typeof data?.url !== "string") throw new Error("donate");
      window.location.assign(data.url);
    } catch {
      setError({ key: "errors.default", providerUnavailable: false, signInRequired: false });
      setLoading(false);
    }
  }

  const amountHintId = `${id}-amount-hint`;
  const amountErrorId = `${id}-amount-error`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      className="m-auto w-[min(100%-1.5rem,32rem)] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-xl border border-dbz-border bg-dbz-card p-0 text-white backdrop:bg-black/75"
    >
      <form onSubmit={(event) => void submit(event)} aria-busy={loading} className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} className="font-display text-2xl font-bold text-white">
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={td("close")}
            className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Croix size={20} />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-dbz-red bg-dbz-red/15 p-3 text-sm leading-relaxed text-white"
          >
            <p>{tBilling(error.key)}</p>
            {error.signInRequired && (
              <Link
                href={signInHref()}
                className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4 hover:text-dbz-yellow"
              >
                {tBilling("errors.signIn")}
              </Link>
            )}
          </div>
        )}

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-semibold text-white">{td("amountLegend")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DONATION_TIERS.map((item) => (
              <label key={item.id} className={CHOICE}>
                <input
                  type="radio"
                  name={`${id}-tier`}
                  value={item.id}
                  aria-label={`${t(`tiers.${item.id}`)}, ${formatEuros(item.amount)}`}
                  checked={tier === item.id}
                  onChange={() => {
                    setTier(item.id);
                    setAmountError(false);
                  }}
                  className={RADIO}
                />
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2">
                  <span>{t(`tiers.${item.id}`)}</span>
                  <span className="font-semibold tabular-nums text-dbz-yellow">
                    {formatEuros(item.amount)}
                  </span>
                </span>
              </label>
            ))}
            <label className={`${CHOICE} sm:col-span-2`}>
              <input
                type="radio"
                name={`${id}-tier`}
                value="custom"
                checked={tier === "custom"}
                onChange={() => {
                  setTier("custom");
                  requestAnimationFrame(() => amountRef.current?.focus());
                }}
                className={RADIO}
              />
              {td("custom")}
            </label>
          </div>
          {tier === "custom" && (
            <div className="mt-3 grid gap-1.5">
              <label htmlFor={`${id}-amount`} className="text-sm font-medium text-white">
                {td("customLabel")}
              </label>
              <input
                ref={amountRef}
                id={`${id}-amount`}
                type="number"
                inputMode="decimal"
                min={1}
                max={5000}
                step="0.01"
                required
                value={customAmount}
                aria-invalid={amountError || undefined}
                aria-describedby={amountError ? `${amountHintId} ${amountErrorId}` : amountHintId}
                onChange={(event) => {
                  setCustomAmount(event.target.value);
                  setAmountError(false);
                }}
                className={FIELD}
              />
              <p id={amountHintId} className="text-[0.8125rem] text-white/70">
                {td("customHint")}
              </p>
              {amountError && (
                <p id={amountErrorId} className="text-sm font-medium text-dbz-red">
                  {td("amountError")}
                </p>
              )}
            </div>
          )}
        </fieldset>

        <div className="mt-5 grid gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium text-white">
            {td("nameLabel")}
          </label>
          <input
            id={`${id}-name`}
            type="text"
            autoComplete="name"
            maxLength={120}
            disabled={isAnonymous}
            value={donorName}
            aria-describedby={`${id}-name-hint`}
            onChange={(event) => setDonorName(event.target.value)}
            className={FIELD}
          />
          <p id={`${id}-name-hint`} className="text-[0.8125rem] text-white/70">
            {td("nameHint")}
          </p>
        </div>

        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem] text-white">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(event) => setIsAnonymous(event.target.checked)}
            className="h-5 w-5 shrink-0 accent-[var(--color-dbz-orange)]"
          />
          {td("anonymousLabel")}
        </label>

        <div className="mt-3 grid gap-1.5">
          <label htmlFor={`${id}-message`} className="text-sm font-medium text-white">
            {td("messageLabel")}
          </label>
          <textarea
            id={`${id}-message`}
            maxLength={150}
            rows={2}
            value={message}
            aria-describedby={`${id}-message-hint`}
            onChange={(event) => setMessage(event.target.value)}
            className={`${FIELD} py-3`}
          />
          <p id={`${id}-message-hint`} className="text-[0.8125rem] text-white/70">
            {td("messageHint", { max: 150 })}
          </p>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-semibold text-white">{td("providerLegend")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["stripe", "paypal"] as const).map((value) => (
              <label key={value} className={CHOICE}>
                <input
                  type="radio"
                  name={`${id}-provider`}
                  value={value}
                  checked={provider === value}
                  disabled={unavailable[value]}
                  aria-describedby={unavailable[value] ? `${id}-${value}-off` : undefined}
                  onChange={() => setProvider(value)}
                  className={RADIO}
                />
                {tBilling(PROVIDER_LABEL_KEY[value])}
              </label>
            ))}
          </div>
          {(["stripe", "paypal"] as const).map(
            (value) =>
              unavailable[value] && (
                <p
                  key={value}
                  id={`${id}-${value}-off`}
                  className="mt-2 text-[0.8125rem] text-white/75"
                >
                  {tBilling("errors.providerDisabled", {
                    provider: tBilling(PROVIDER_LABEL_KEY[value]),
                  })}
                </p>
              ),
          )}
        </fieldset>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-dbz-border pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="toriyama-btn-secondary normal-case tracking-normal"
          >
            {td("cancel")}
          </button>
          <button
            type="submit"
            disabled={loading || unavailable[provider]}
            aria-busy={loading}
            className="toriyama-btn min-h-12 normal-case tracking-normal text-[0.9375rem]"
          >
            {loading
              ? td("redirecting")
              : amountValid
                ? td("submit", { amount: formatEuros(amount) })
                : t("title")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
