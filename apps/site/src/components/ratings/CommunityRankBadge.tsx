/**
 * Badge podium (#1 / #2 / #3) — server component.
 * Affiché à côté de la moyenne quand la fiche est dans un Top 3.
 *
 * Même pastille de rang que le podium (`RANK_META` : kanji + médaille), plus
 * d'émoji. Le détail (classement, moyenne, nombre de notes) n'est plus confié
 * au seul `title`, invisible au doigt : il est lu par les lecteurs d'écran et la
 * moyenne elle-même s'affiche déjà dans l'en-tête de la fiche.
 */
import Link from "next/link";
import { getCommunityRankFor } from "@/lib/community-tops-data";
import type { CommunityTopKind } from "@/lib/community-tops";
import { RANK_META } from "./Podium";

export async function CommunityRankBadge({
  kind,
  targetId,
  className = "",
}: {
  kind: CommunityTopKind;
  targetId: string | number;
  className?: string;
}) {
  const info = await getCommunityRankFor(kind, targetId);
  if (!info) return null;

  const meta = RANK_META[info.rank];
  const detail = `${info.boardTitle} : ${info.average.toFixed(1)} sur 5, ${info.count} note${info.count > 1 ? "s" : ""}`;

  return (
    <Link
      href={info.href}
      title={detail}
      className={`cible-44 inline-flex items-center gap-1.5 rounded-full border-2 bg-black/40 px-2.5 py-1 text-[0.75rem] font-bold text-white transition-colors hover:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere ${meta.border} ${className}`}
    >
      <span
        aria-hidden
        className={`flex h-5 w-5 items-center justify-center rounded-full font-jp text-[0.6875rem] ${meta.badge}`}
      >
        {meta.kanji}
      </span>
      <span>
        #{info.rank} {info.boardLabel}
      </span>
      <span className="sr-only"> — {detail}</span>
    </Link>
  );
}
