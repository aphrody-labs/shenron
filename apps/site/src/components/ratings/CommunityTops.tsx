"use client";

/**
 * Podium Top 3 communautaires — onglets par série / type.
 * Encourage les notes : place libre + lien vers les grilles d'épisodes/films/jeux.
 *
 * La marche (ordre `PODIUM_ORDER`, médailles, badge de rang) vient de `Podium` :
 * le Panthéon des guerriers de `/classements` pose exactement la même.
 */
import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Etoile, Trophee } from "@shenron/ui/icones";
import { T } from "@/components/T";
import { WikiImg } from "@/components/wiki/WikiImg";
import type { CommunityTopBoard, CommunityTopsPayload } from "@/lib/community-tops";
import { onTablistKeyDown } from "@/lib/tablist-keys";
import { Podium, PodiumCard, PodiumEmpty, type PodiumRank } from "./Podium";

/** Ordre de la marche (2e, 1er, 3e), partagé avec le Panthéon de `/classements`. */
export { PODIUM_ORDER } from "./Podium";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

function TopEntryCard({ board, rank }: { board: CommunityTopBoard; rank: PodiumRank }) {
  const entry = board.entries.find((e) => e.rank === rank);
  if (!entry) return <PodiumEmpty rank={rank} href={board.def.browseHref} />;

  return (
    <PodiumCard rank={rank} href={entry.href}>
      <div className="relative aspect-[2/3] overflow-hidden bg-dbz-bg">
        {entry.image ? (
          <WikiImg
            src={entry.image}
            alt=""
            sizes="(min-width: 1024px) 240px, (min-width: 640px) 32vw, 48vw"
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/15">
            <Trophee className="h-12 w-12" aria-hidden />
          </div>
        )}
        {/* La moyenne est écrite, pas suggérée : elle est la raison du rang. */}
        <span className="absolute right-2 top-2 z-20 inline-flex items-center gap-0.5 rounded-full bg-black/85 px-2 py-0.5 text-[0.75rem] font-bold tabular-nums text-white">
          <Etoile className="h-3.5 w-3.5 fill-current text-dbz-orange" aria-hidden />
          {entry.average.toFixed(1)}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p
          className={`line-clamp-2 font-bold leading-tight text-white group-hover:text-dbz-orange ${
            rank === 1 ? "text-sm sm:text-base" : "text-xs sm:text-sm"
          }`}
        >
          {entry.title}
        </p>
        {entry.subtitle && (
          <p className="line-clamp-1 text-[0.6875rem] text-white/55">{entry.subtitle}</p>
        )}
        <p className="border-t border-white/12 pt-1 text-[0.6875rem] tabular-nums text-white/60">
          <T
            k={
              entry.count > 1
                ? "communaute.classements.votesMany"
                : "communaute.classements.votesOne"
            }
            values={{ count: entry.count }}
          />
        </p>
      </div>
    </PodiumCard>
  );
}

function BoardPodium({ board }: { board: CommunityTopBoard }) {
  const free = 3 - board.entries.length;
  return (
    <div className="space-y-6">
      <div className="border-b border-white/12 pb-3">
        <h3 className="flex items-center gap-2.5 text-[clamp(1.125rem,1rem+0.6vw,1.375rem)] font-[850] leading-tight tracking-[-0.02em] text-white">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 font-jp text-sm font-bold text-black"
          >
            {board.def.kanji}
          </span>
          <span>{board.def.title}</span>
        </h3>
        <p className="mt-1.5 max-w-xl text-sm text-white/65">{board.def.teaser}</p>
        {board.ratedCount > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] tabular-nums text-white/60">
            <li>
              <span className="font-bold text-white">{board.ratedCount}</span> noté
              {board.ratedCount > 1 ? "s" : ""}
            </li>
            <li>
              <span className="font-bold text-white">{board.totalVotes}</span> vote
              {board.totalVotes > 1 ? "s" : ""}
            </li>
          </ul>
        ) : (
          <p className="mt-2 text-[0.8125rem] text-white/60">
            Aucun vote encore : le premier à noter ouvre le podium.
          </p>
        )}
      </div>

      <Podium render={(rank) => <TopEntryCard board={board} rank={rank} />} />

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={board.def.browseHref}
          className={`inline-flex min-h-11 items-center rounded-full bg-dbz-orange px-5 text-sm font-bold text-black transition-colors hover:bg-white ${FOCUS}`}
        >
          <T k="communaute.classements.rateCta" />
        </Link>
        {free > 0 && free < 3 && (
          <p className="text-[0.8125rem] text-white/60">
            Encore {free} place{free > 1 ? "s" : ""} à prendre sur le podium.
          </p>
        )}
      </div>
    </div>
  );
}

export function CommunityTops({
  data,
  compact = false,
  showHeader = true,
}: {
  data: CommunityTopsPayload;
  /** Mode home (moins de padding). */
  compact?: boolean;
  showHeader?: boolean;
}) {
  const boards = data.boards;
  const baseId = useId();
  const firstWithVotes = boards.findIndex((b) => b.entries.length > 0);
  const [active, setActive] = useState(
    firstWithVotes >= 0 ? boards[firstWithVotes]!.def.id : (boards[0]?.def.id ?? "episodes-dbz"),
  );

  const board = useMemo(
    () => boards.find((b) => b.def.id === active) ?? boards[0],
    [boards, active],
  );

  if (!board) return null;

  return (
    <div className={compact ? "space-y-4" : "space-y-6"} data-no-advance>
      {showHeader && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[clamp(1.5rem,1.2rem+1.2vw,2rem)] font-[850] leading-tight tracking-[-0.02em] text-white">
              Les Top 3 de la communauté
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-white/65">
              Épisodes, films et jeux classés par vos notes. Note ton favori pour le faire entrer —
              ou rester — sur le podium.
              {data.globalVotes > 0 && (
                <>
                  {" "}
                  {data.globalVotes} vote{data.globalVotes > 1 ? "s" : ""} au total.
                </>
              )}
            </p>
          </div>
          <Link
            href="/classements"
            className={`inline-flex min-h-11 items-center text-sm font-semibold text-dbz-orange underline-offset-4 hover:underline ${FOCUS}`}
          >
            Tous les classements
          </Link>
        </div>
      )}

      {/* Mobile : une rangée qui défile dans son cadre (neuf onglets sur quatre
			    lignes repoussaient le podium sous la ligne de flottaison). */}
      <div
        tabIndex={0}
        className="-mx-[var(--shell-pad,1.5rem)] flex gap-2 overflow-x-auto px-[var(--shell-pad,1.5rem)] pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Choisir un top 3"
        onKeyDown={onTablistKeyDown}
      >
        {boards.map((b) => {
          const selected = b.def.id === board.def.id;
          return (
            <button
              key={b.def.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${b.def.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panneau`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(b.def.id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors ${FOCUS} ${
                selected
                  ? "border-dbz-green bg-dbz-green/20 text-white"
                  : "border-white/15 text-white/70 hover:border-white/40 hover:text-white"
              }`}
            >
              <span aria-hidden className="font-jp text-xs text-white/60">
                {b.def.kanji}
              </span>
              <span>{b.def.label}</span>
              {b.entries.length > 0 && (
                <span className="text-[0.75rem] font-bold tabular-nums text-white/70">
                  ★ {b.entries[0]?.average.toFixed(1)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panneau`}
        aria-labelledby={`${baseId}-tab-${board.def.id}`}
        className="rounded-lg border border-white/12 p-4 sm:p-6"
      >
        <BoardPodium board={board} />
      </div>
    </div>
  );
}

/** Variante page complète : tous les boards empilés (sans onglets). */
export function CommunityTopsFull({ data }: { data: CommunityTopsPayload }) {
  return (
    <div className="space-y-6">
      {data.boards.map((board) => (
        <section
          key={board.def.id}
          id={board.def.id}
          className="scroll-mt-24 rounded-lg border border-white/12 p-4 sm:p-6"
        >
          <BoardPodium board={board} />
        </section>
      ))}
    </div>
  );
}
