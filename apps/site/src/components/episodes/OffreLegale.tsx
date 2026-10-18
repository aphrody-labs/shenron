"use client";

// SPDX-License-Identifier: Apache-2.0
import type { Availability } from "@/db/bot-schema";
import { useTranslations } from "next-intl";
import { normalizeAvailability, VIDEO_LANGUAGE_ORDER } from "@/lib/video-languages";
import { useState } from "react";

/**
 * « Où regarder cet épisode / ce film légalement », et dans quelle langue.
 * UI/UX Pro Max : Néo-brutaliste Toriyama, badges LED, surfaces sombres cinématiques.
 */
export function OffreLegale({ offres }: { offres: Availability[] | null | undefined }) {
  const t = useTranslations("mediaPlayback");
  const list = normalizeAvailability(offres) ?? [];
  const [selectedLang, setSelectedLang] = useState<string>("all");

  if (list.length === 0) return null;

  const toutes = new Set(list.flatMap((o) => o.langs ?? []));
  const langs = VIDEO_LANGUAGE_ORDER.filter((l) => toutes.has(l));

  const filteredList =
    selectedLang === "all" ? list : list.filter((o) => o.langs?.includes(selectedLang as any));

  return (
    <section
      aria-label={t("watchLegally")}
      className="relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-2xl border-2 border-border/80 bg-zinc-950/80 p-5 backdrop-blur-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)] transition-all"
    >
      {/* Glow d'ambiance */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-15 blur-2xl"
        style={{
          background: "radial-gradient(circle, var(--color-dbz-orange, #ff6600), transparent 70%)",
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
          <h2 className="font-display text-base font-bold tracking-tight text-white uppercase">
            {t("watchLegally")}
          </h2>
        </div>

        {langs.length > 1 && (
          <div className="inline-flex rounded-xl bg-zinc-900/90 p-1 border border-zinc-800 shadow-inner">
            <button
              type="button"
              onClick={() => setSelectedLang("all")}
              className={`rounded-lg px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider transition-all ${
                selectedLang === "all"
                  ? "bg-dbz-orange text-black shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Tous
            </button>
            {langs.map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setSelectedLang(l)}
                className={`rounded-lg px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider transition-all ${
                  selectedLang === l
                    ? "bg-dbz-orange text-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t(l)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {filteredList.map((o) => (
          <a
            key={`${o.provider}-${o.url}`}
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900 px-5 py-2.5 font-display text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-dbz-orange hover:bg-zinc-800 hover:shadow-[0_0_16px_rgba(255,102,0,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 group-hover:scale-125 transition-transform" />
            <span>{o.label}</span>
            {o.langs?.length ? (
              <span className="font-mono text-xs font-semibold text-zinc-400 group-hover:text-dbz-orange">
                [{o.langs.map((l) => t(l)).join(" · ")}]
              </span>
            ) : null}
            <span className="text-zinc-500 group-hover:text-white transition-colors">↗</span>
          </a>
        ))}
      </div>

      <p className="font-sans text-xs leading-relaxed text-zinc-400">
        {t("legalOfferNote", { providers: [...new Set(list.map((o) => o.label))].join(", ") })}
      </p>
    </section>
  );
}
