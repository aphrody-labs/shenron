import type { ReactNode } from "react";

export interface MediaFact {
  label: ReactNode;
  value: ReactNode;
  /** Clé stable quand `label` n'est pas une chaîne. */
  key?: string;
}

/**
 * Fiche technique d'une œuvre (tome, databook, film, jeu, roman) : une seule liste de
 * définitions au lieu des cinq variantes recopiées d'une fiche à l'autre (lignes
 * `justify-between` du tome et du databook, `<dl>` en grille du film et du jeu, cartouches
 * du roman).
 *
 * - `rows` : libellé à gauche, valeur à droite, filet entre les lignes — colonne latérale.
 * - `grid` : tuiles de deux colonnes sur mobile, quatre sur grand écran — sous un titre.
 *
 * Les valeurs vides sont écartées ici, pas chez l'appelant.
 */
export function MediaFacts({
  facts,
  variant = "rows",
  className = "",
}: {
  /** Les entrées falsy (`cond && {…}`) sont ignorées. */
  facts: ReadonlyArray<MediaFact | null | undefined | false | "" | 0>;
  variant?: "rows" | "grid";
  className?: string;
}) {
  const visibles = facts.filter(
    (fact): fact is MediaFact =>
      Boolean(fact) && (fact as MediaFact).value !== null && (fact as MediaFact).value !== "",
  );
  if (visibles.length === 0) return null;
  const keyOf = (fact: MediaFact, index: number) =>
    fact.key ?? (typeof fact.label === "string" ? fact.label : String(index));

  if (variant === "grid") {
    return (
      <dl className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${className}`}>
        {visibles.map((fact, index) => (
          <div
            key={keyOf(fact, index)}
            className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <dt className="text-[12px] text-white/55">{fact.label}</dt>
            <dd className="mt-1 break-words font-display text-[15px] font-semibold text-white">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className={`divide-y divide-white/[0.08] text-[14px] ${className}`}>
      {visibles.map((fact, index) => (
        <div key={keyOf(fact, index)} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-white/55">{fact.label}</dt>
          <dd className="min-w-0 break-words text-right font-semibold text-white">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
