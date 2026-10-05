/**
 * Podium — la marche 2 · 1 · 3, une seule fois pour tout le site.
 *
 * Le podium était écrit trois fois : les trois blocs recopiés à la main du
 * Panthéon des guerriers (`/rankings`), et le `PodiumCard` des Top 3 des
 * œuvres (`CommunityTops`), chacun avec ses couleurs de médaille, ses kanji et
 * ses décalages de marche. Ici, une table de rangs (`RANK_META`) et trois
 * primitives :
 *
 *  - `Podium` pose la marche. Le DOM reste dans l'ordre de lecture (1, 2, 3)
 *    pour un lecteur d'écran ; seul l'ordre VISUEL suit `PODIUM_ORDER`.
 *  - `PodiumCard` est la case cliquable d'une marche (bordure de médaille et
 *    badge de rang, sans ombre décalée ni aura au survol).
 *  - `PodiumEmpty` dit qu'une place est libre et où aller pour la prendre.
 *
 * Aucun hook : utilisable depuis un composant serveur comme depuis un îlot
 * client.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { T } from "@/components/T";

export type PodiumRank = 1 | 2 | 3;

/** Ordre d'affichage de la marche : 2e · 1er · 3e. */
export const PODIUM_ORDER: readonly PodiumRank[] = [2, 1, 3];

/** Ordre de lecture, celui du DOM. */
const READING_ORDER: readonly PodiumRank[] = [1, 2, 3];

/** Classes `order-*` écrites en entier pour que Tailwind les génère. */
const VISUAL_ORDER = ["order-1", "order-2", "order-3"] as const;

export const RANK_META: Record<
  PodiumRank,
  {
    kanji: string;
    /** Clé de dictionnaire du libellé (« 1er », « 2e », « 3e »). */
    labelKey: string;
    /** Bordure de médaille de la case. */
    border: string;
    /** Pastille du rang. */
    badge: string;
    /** Couleur de texte de la médaille (chiffres, accent). */
    text: string;
    /** Hauteur de marche : le 1er est le plus haut. */
    step: string;
  }
> = {
  1: {
    kanji: "壱",
    labelKey: "communaute.classements.rank1",
    border: "border-amber-400",
    badge: "bg-amber-400 text-black",
    text: "text-amber-200",
    step: "",
  },
  2: {
    kanji: "弐",
    labelKey: "communaute.classements.rank2",
    border: "border-slate-300",
    badge: "bg-slate-200 text-slate-900",
    text: "text-slate-200",
    step: "pt-6 sm:pt-8",
  },
  3: {
    kanji: "参",
    labelKey: "communaute.classements.rank3",
    border: "border-orange-500",
    badge: "bg-orange-500 text-black",
    text: "text-orange-300",
    step: "pt-10 sm:pt-12",
  },
};

/** Largeur d'une case : le 1er garde un cran d'avance, sans transformation. */
const WIDTH: Record<PodiumRank, string> = {
  1: "max-w-[11.5rem] sm:max-w-[13.5rem]",
  2: "max-w-[9.5rem] sm:max-w-[11rem]",
  3: "max-w-[9.5rem] sm:max-w-[11rem]",
};

export function Podium({
  render,
  className = "",
}: {
  /** Contenu de chaque marche : `PodiumCard`, `PodiumEmpty` ou `null`. */
  render: (rank: PodiumRank) => ReactNode;
  className?: string;
}) {
  return (
    <ol className={`flex items-end gap-2 sm:gap-5 ${className}`}>
      {READING_ORDER.map((rank) => (
        <li
          key={rank}
          className={`flex min-w-0 flex-1 flex-col items-center ${VISUAL_ORDER[PODIUM_ORDER.indexOf(rank)]} ${RANK_META[rank].step}`}
        >
          {render(rank)}
        </li>
      ))}
    </ol>
  );
}

/** Pastille « 壱 1er » — le rang écrit, pas seulement sa couleur. */
export function RankBadge({ rank, className = "" }: { rank: PodiumRank; className?: string }) {
  const meta = RANK_META[rank];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${meta.badge} ${className}`}
    >
      <span aria-hidden className="font-jp">
        {meta.kanji}
      </span>
      <T k={meta.labelKey} />
    </span>
  );
}

export function PodiumCard({
  rank,
  href,
  children,
  className = "",
}: {
  rank: PodiumRank;
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex w-full flex-col overflow-hidden rounded-lg border-2 bg-dbz-card transition-colors hover:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere ${RANK_META[rank].border} ${WIDTH[rank]} ${className}`}
    >
      <RankBadge rank={rank} className="absolute left-2 top-2 z-20" />
      {children}
    </Link>
  );
}

/** Marche encore libre : elle dit qu'elle l'est, et mène à l'endroit où voter. */
export function PodiumEmpty({ rank, href }: { rank: PodiumRank; href: string }) {
  return (
    <div className={`flex w-full flex-col items-center gap-2.5 ${WIDTH[rank]}`}>
      <div className="relative flex aspect-[2/3] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/20 bg-black/30 p-3 text-center">
        <RankBadge rank={rank} className="absolute left-2 top-2" />
        <span className="text-[0.8125rem] font-semibold text-white/70">
          <T k="communaute.classements.freeSlot" />
        </span>
        <span className="mt-1 text-[0.75rem] leading-snug text-white/50">
          <T k="communaute.classements.firstVote" />
        </span>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center rounded-full border border-dbz-orange/60 px-4 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-dbz-orange hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
      >
        <T k="communaute.classements.rateCta" />
      </Link>
    </div>
  );
}
