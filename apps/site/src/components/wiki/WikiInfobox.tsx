/* oxlint-disable react/no-array-index-key -- reviewed: legacy patterns, behavior preserved */
// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { WikiRepliable } from "@/components/wiki/WikiRepliable";

/**
 * Infobox d'une fiche — le cartouche « données officielles » des databooks.
 *
 * Six fiches la réécrivaient à la main, en `<div>` sur l'une, en `<table>` sur
 * l'autre, en tuiles arrondies sur une troisième : la même notion avait trois
 * sémantiques et trois rendus. Ici, une seule : une liste de définitions
 * (`<dl>`), lue par un lecteur d'écran comme « libellé : valeur ».
 *
 * Panneau détaché par un trait de 1 px, sans ombre. Colonne latérale collante
 * sur grand écran ; au téléphone, l'illustration reste visible et les lignes se
 * replient sous l'en-tête du panneau.
 *
 * Une ligne `null`/`false` est ignorée : les pages écrivent leurs lignes en une
 * seule liste, conditions comprises, sans enchaîner les `&&`.
 *
 * Server component (le repli est un îlot client).
 */
export type InfoboxRow = {
  label: ReactNode;
  value: ReactNode;
  /** Langue de la valeur (`ja` pour un nom japonais). */
  lang?: string;
  /** Accent de la valeur ; `figure` aligne les chiffres (mesures, numéros). */
  tone?: "default" | "accent" | "figure";
};

const TONES: Record<NonNullable<InfoboxRow["tone"]>, string> = {
  default: "text-os",
  accent: "text-dbz-orange",
  figure: "text-os tabular-nums",
};

export function WikiInfobox({
  title = "Fiche",
  media,
  rows,
  children,
  className = "",
}: {
  title?: string;
  /** Illustration principale, en tête du panneau. */
  media?: ReactNode;
  rows: ReadonlyArray<InfoboxRow | null | false | undefined>;
  /** Contenu libre sous les lignes (note de provenance, formes associées…). */
  children?: ReactNode;
  className?: string;
}) {
  const lignes = rows.filter((r): r is InfoboxRow => !!r);
  return (
    <section
      aria-label={title}
      className={`overflow-hidden rounded-lg border border-os/12 ${className}`}
    >
      {media && (
        <div className="relative flex max-h-72 items-center justify-center overflow-hidden border-b border-os/12 bg-encre/40 lg:max-h-none">
          {media}
        </div>
      )}
      <WikiRepliable title={title}>
        {lignes.length > 0 && (
          <dl className="divide-y divide-os/[0.08]">
            {lignes.map((r, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-sm text-os/65">{r.label}</dt>
                <dd
                  lang={r.lang}
                  className={`min-w-0 text-right text-sm font-semibold break-words ${TONES[r.tone ?? "default"]} ${
                    r.lang === "ja" ? "font-jp" : ""
                  }`}
                >
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {children && (
          <div className="space-y-3 border-t border-os/[0.08] p-4 text-sm text-os/75">
            {children}
          </div>
        )}
      </WikiRepliable>
    </section>
  );
}
