// SPDX-License-Identifier: Apache-2.0
import { GatedWrap } from "@/components/GatedLink";

/**
 * Cartes de combats liées à une fiche (personnage, technique, lieu).
 *
 * Trois fiches les dessinaient chacune à leur façon — émoji d'épée sur l'une,
 * coupe sur l'autre, flèche « Détails → » minuscule sur la troisième, seule
 * zone cliquable de la carte. Ici, la carte entière est le lien (cible tactile
 * pleine), la série et le vainqueur sont écrits en clair.
 *
 * Server component : `GatedWrap` neutralise un combat dont la rubrique est fermée.
 */
export type WikiBattleCard = {
  slug: string;
  title: string;
  titleJa?: string | null;
  series?: string | null;
  location?: string | null;
  winnerName?: string | null;
  climaxSummary?: string | null;
};

export function WikiBattleCards({ battles }: { battles: readonly WikiBattleCard[] }) {
  if (battles.length === 0) return null;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {battles.map((b) => (
        <li key={b.slug}>
          <GatedWrap
            href={`/wiki/combats/${b.slug}`}
            className="group flex h-full flex-col gap-2 rounded-xl border border-white/[0.08] bg-dbz-card/70 p-4 transition-colors hover:border-dbz-orange/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange sm:p-5"
          >
            {(b.series || b.location) && (
              <p className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
                {b.series && <span className="font-semibold text-dbz-red">{b.series}</span>}
                {b.location && <span className="text-white/55">{b.location}</span>}
              </p>
            )}
            <h3 className="font-display text-base font-semibold text-white transition-colors group-hover:text-dbz-orange">
              {b.title}
            </h3>
            {b.titleJa && (
              <p lang="ja" className="font-jp text-xs text-white/55">
                {b.titleJa}
              </p>
            )}
            {b.climaxSummary && (
              <p className="line-clamp-3 text-[13px] leading-relaxed text-white/65">
                {b.climaxSummary}
              </p>
            )}
            <p className="mt-auto border-t border-white/[0.06] pt-2 text-xs text-white/60">
              Vainqueur : <strong className="text-white">{b.winnerName || "indéterminé"}</strong>
            </p>
          </GatedWrap>
        </li>
      ))}
    </ul>
  );
}
