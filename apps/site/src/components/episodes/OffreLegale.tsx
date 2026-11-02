"use client";

// SPDX-License-Identifier: Apache-2.0
import type { Availability } from "@/db/bot-schema";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  normalizeAvailability,
  officialProviderName,
  VIDEO_LANGUAGE_ORDER,
} from "@/lib/video-languages";
import { useState } from "react";

const SEGMENT =
  "inline-flex min-h-11 items-center rounded-full px-4 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange";

/**
 * « Où regarder » : les offres officielles d'un épisode ou d'un film, filtrables
 * par version. Le nom de la plateforme vient des données ; une marque de diffuseur
 * n'est jamais affichée (cf. `officialProviderName`), le lien reste celui du diffuseur.
 */
export function OffreLegale({ offres }: { offres: Availability[] | null | undefined }) {
  const t = useTranslations("mediaPlayback");
  const list = normalizeAvailability(offres) ?? [];
  const [selectedLang, setSelectedLang] = useState<string>("all");

  if (list.length === 0) return null;

  const toutes = new Set(list.flatMap((o) => o.langs ?? []));
  const langs = VIDEO_LANGUAGE_ORDER.filter((l) => toutes.has(l));

  const filteredList =
    selectedLang === "all" ? list : list.filter((o) => o.langs?.some((l) => l === selectedLang));
  const neutral = t("officialPlatform");

  return (
    <section
      aria-labelledby="official-offer-title"
      className="relative flex min-w-0 flex-col gap-4 rounded-xl border border-white/[0.12] bg-dbz-card/80 p-4 sm:p-5"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="official-offer-title"
          className="font-display text-base font-bold tracking-tight text-white"
        >
          {t("watchLegally")}
        </h2>
        <p className="text-sm leading-relaxed text-white/75">{t("officialOfferIntro")}</p>
      </header>

      {langs.length > 1 && (
        <div role="group" aria-label={t("versionChoice")} className="flex flex-wrap gap-2">
          {["all", ...langs].map((l) => (
            <button
              type="button"
              key={l}
              aria-pressed={selectedLang === l}
              onClick={() => setSelectedLang(l)}
              className={`${SEGMENT} ${
                selectedLang === l
                  ? "bg-dbz-orange text-black"
                  : "border border-white/20 text-white/80 hover:border-dbz-gold hover:text-white"
              }`}
            >
              {l === "all" ? t("allVersions") : t(l)}
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {filteredList.map((o, index) => {
          const name = officialProviderName(o.provider, o.label, neutral);
          const versions = (o.langs ?? []).map((l) => t(l)).join(" · ");
          return (
            <li key={`${o.provider}-${o.url}`}>
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={
                  versions ? `${t("openOfficialOffer")} · ${name} · ${versions}` : undefined
                }
                className={`group flex min-h-12 items-center gap-3 rounded-full px-5 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange ${
                  index === 0
                    ? "bg-dbz-orange text-black hover:bg-dbz-gold"
                    : "border border-white/20 text-white hover:border-dbz-gold"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {index === 0 ? `${t("openOfficialOffer")} · ${name}` : name}
                </span>
                {versions ? (
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      index === 0 ? "text-black/75" : "text-white/70"
                    }`}
                  >
                    {versions}
                  </span>
                ) : null}
                <ExternalLink aria-hidden className="h-4 w-4 shrink-0" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
