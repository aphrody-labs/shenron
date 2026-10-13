"use client";

import type { Availability } from "@/db/bot-schema";
import { useTranslations } from "next-intl";
import { normalizeAvailability, VIDEO_LANGUAGE_ORDER } from "@/lib/video-languages";

/** VF d'abord (audience FR), VOSTFR ensuite — même ordre que le sélecteur de lecteurs. */

/**
 * « Où regarder cet épisode / ce film légalement », et dans quelle langue.
 *
 * Labels follow the active client locale, including pages served from the ISR cache.
 *
 * Ce n'est PAS un lecteur : on ne met rien en iframe ici. `availability` porte
 * une destination chez un ayant droit, pas une source à incruster ; les deux
 * ne doivent pas se ressembler à l'écran, sans quoi le visiteur ne sait plus
 * ce qu'il regarde ni chez qui.
 *
 * Les langues affichées sont celles RELEVÉES chez le fournisseur
 * (`sync-availability-adn.ts`), pas une promesse éditoriale : si ADN retire la
 * VF d'un épisode, la pastille disparaît au relevé suivant.
 */
export function OffreLegale({ offres }: { offres: Availability[] | null | undefined }) {
  const t = useTranslations("mediaPlayback");
  const list = normalizeAvailability(offres) ?? [];
  if (list.length === 0) return null;

  // Union des langues, tous fournisseurs confondus : c'est la réponse à
  // « est-ce que ça existe en VF ? », qui ne dépend pas de chez qui.
  const toutes = new Set(list.flatMap((o) => o.langs ?? []));
  const langs = VIDEO_LANGUAGE_ORDER.filter((l) => toutes.has(l));

  return (
    <section
      aria-label={t("watchLegally")}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-display text-base font-bold">{t("watchLegally")}</h2>
        {langs.length > 0 && (
          <div
            className="shenron-video-selectors flex flex-wrap items-center gap-1.5"
            aria-label={t("availableLanguages")}
          >
            {langs.map((l) => (
              <span
                key={l}
                className="rounded-full border border-border px-3 py-1 font-display text-xs font-semibold"
              >
                {t(l)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {list.map((o) => (
          <a
            key={`${o.provider}-${o.url}`}
            href={o.url}
            target="_blank"
            // `noopener`/`noreferrer` : un lien sortant ne doit pas donner la
            // main sur notre onglet, ni annoncer d'où vient le visiteur.
            rel="noopener noreferrer"
            className="inline-flex min-h-11 max-w-full items-center justify-center rounded-full bg-primary px-5 py-2 font-display text-sm font-bold text-primary-foreground [overflow-wrap:anywhere] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {o.label}
            {o.langs?.length ? ` · ${o.langs.map((l) => t(l)).join(" / ")}` : ""}
          </a>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
        {t("legalOfferNote", { providers: [...new Set(list.map((o) => o.label))].join(", ") })}
      </p>
    </section>
  );
}
