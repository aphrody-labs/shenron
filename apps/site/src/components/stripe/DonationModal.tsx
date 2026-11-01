"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { DONATION_TIERS } from "@/lib/billing-catalog";

export function DonationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selectedTier, setSelectedTier] = useState<string>("dragon_ball");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [donorName, setDonorName] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"stripe" | "paypal">("stripe");
  const tBilling = useTranslations("billing");
  const fieldId = useId();

  if (!isOpen) return null;

  const currentTier = DONATION_TIERS.find((t) => t.id === selectedTier);
  const finalAmount =
    selectedTier === "custom" ? Math.round(Number(customAmount) * 100) : currentTier?.amount || 500;

  const handleDonate = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!Number.isSafeInteger(finalAmount) || finalAmount < 100 || finalAmount > 500_000) {
        setError("Le montant minimum est de 1,00 €.");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/${provider}/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId: selectedTier === "custom" ? undefined : selectedTier,
          amount: finalAmount,
          donorName: isAnonymous ? "Guerrier Z Anonyme" : donorName,
          message,
          isAnonymous,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la création du don");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-neutral-900 via-neutral-900 to-black p-6 shadow-2xl shadow-amber-500/10">
        {/* Glow effect Toriyama Gold */}
        <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-orange-600/20 blur-3xl" />

        <div className="relative flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐉</span>
            <div>
              <h3 className="font-extrabold text-lg tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-200">
                SOUTENIR DRAGON BALL FR
              </h3>
              <p className="text-xs text-neutral-400">
                Contribuez à préserver et numériser l'archive ultime
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Tiers de soutien */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {DONATION_TIERS.map((tier) => {
            const isSelected = selectedTier === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => setSelectedTier(tier.id)}
                className={`relative flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500"
                    : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 hover:bg-neutral-800/40"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xl">{tier.badge}</span>
                  <span className="font-bold text-amber-400 text-sm">
                    {(tier.amount / 100).toFixed(2)} €
                  </span>
                </div>
                <span className="mt-1 font-semibold text-xs text-neutral-200">{tier.name}</span>
                <span className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">
                  {tier.description}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedTier("custom")}
            className={`col-span-2 relative flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
              selectedTier === "custom"
                ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500"
                : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-700"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <span id={`${fieldId}-amount`} className="font-semibold text-xs text-neutral-200">
                Montant personnalisé
              </span>
            </div>
            {selectedTier === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  aria-labelledby={`${fieldId}-amount`}
                  min="1"
                  step="1"
                  placeholder="ex: 20"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-24 rounded-lg border border-amber-500/40 bg-black/60 px-2 py-1 text-right text-xs text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  autoFocus
                />
                <span className="text-xs font-bold text-amber-400">€</span>
              </div>
            )}
          </button>
        </div>

        {/* Détails du donateur */}
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor={`${fieldId}-name`}
              className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wider mb-1"
            >
              Votre Nom ou Pseudo
            </label>
            <input
              id={`${fieldId}-name`}
              type="text"
              disabled={isAnonymous}
              placeholder={isAnonymous ? "Anonyme" : "ex: Son Goku, Krilin..."}
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor={`${fieldId}-message`}
              className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wider mb-1"
            >
              Message d'encouragement (Optionnel)
            </label>
            <input
              id={`${fieldId}-message`}
              type="text"
              maxLength={150}
              placeholder="Un mot pour le staff et la commu..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-400"
            />
            <span className="text-xs text-neutral-400">Faire ce don de manière anonyme</span>
          </label>
        </div>

        {/* Bouton d'action */}
        <div className="mt-6 flex items-center justify-between gap-3 pt-3 border-t border-neutral-800">
          <div className="text-xs text-neutral-400">
            Total :{" "}
            <span className="font-bold text-amber-400 text-sm">
              {(finalAmount / 100).toFixed(2)} €
            </span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={provider === "stripe"}
            onClick={() => setProvider("stripe")}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${provider === "stripe" ? "border-amber-400 bg-amber-400/10 text-amber-200" : "border-neutral-800 text-neutral-400"}`}
          >
            {tBilling("cardPayment")}
          </button>
          <button
            type="button"
            aria-pressed={provider === "paypal"}
            onClick={() => setProvider("paypal")}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${provider === "paypal" ? "border-amber-400 bg-amber-400/10 text-amber-200" : "border-neutral-800 text-neutral-400"}`}
          >
            PayPal
          </button>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={handleDonate}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-5 py-2.5 text-xs font-bold text-black shadow-lg shadow-amber-500/25 transition-all hover:brightness-110 active:scale-98 disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-block h-3.5 w-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>⚡ Envoyer mon Énergie</span>
          )}
        </button>
      </div>
    </div>
  );
}
