// SPDX-License-Identifier: Apache-2.0
import { GatedWrap } from "@/components/GatedLink";
import { T } from "@/components/T";
import { resolveMangaChapterHref } from "@/lib/wiki-internal-sources";
import Link from "next/link";

export interface EmbeddedBattleItem {
  slug: string;
  title: string;
  titleJa?: string | null;
  series: string;
  winnerName?: string | null;
  climaxSummary?: string | null;
  location?: string | null;
}

export interface EmbeddedKeyEventItem {
  title: string;
  description: string;
  mangaRef?: string | null;
}

/**
 * Renders major battles and canonical chronicles directly inside the `Présentation`
 * card so they never spawn an isolated `Combats Décisifs` button in `SOMMAIRE`.
 */
export function WikiEmbeddedBattles({
  battles,
  events,
  subjectName,
  mode = "entity",
}: {
  battles?: readonly EmbeddedBattleItem[] | null;
  events?: readonly EmbeddedKeyEventItem[] | null;
  subjectName: string;
  mode?: "entity" | "location";
}) {
  const safeBattles = (battles ?? []).filter((b) => b && b.title);
  const safeEvents = (events ?? []).filter((ev) => ev && ev.title);

  if (safeBattles.length === 0 && safeEvents.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 space-y-8 border-t border-white/10 pt-8">
      {safeEvents.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <h3 className="font-sans text-lg font-extrabold uppercase tracking-wider text-dbz-orange sm:text-xl">
              <T
                k="wiki.presentationEmbedded.chroniclesHeading"
                values={{ count: safeEvents.length }}
              />
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-dbz-orange/40 to-transparent" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {safeEvents.map((ev) => {
              const mangaHref = resolveMangaChapterHref(ev.mangaRef);
              return (
                <div
                  key={ev.title}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2"
                >
                  <h4 className="text-sm font-bold text-dbz-orange">{ev.title}</h4>
                  <p className="text-xs leading-relaxed text-white/75">{ev.description}</p>
                  {ev.mangaRef && (
                    <div className="pt-1 text-[11px] font-mono text-white/50">
                      {mangaHref ? (
                        <Link
                          href={mangaHref}
                          className="inline-flex items-center gap-1.5 text-dbz-blue-light hover:text-white hover:underline transition-colors"
                        >
                          <span>{ev.mangaRef}</span>
                          <span aria-hidden>→</span>
                        </Link>
                      ) : (
                        <span>{ev.mangaRef}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {safeBattles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <h3 className="font-sans text-lg font-extrabold uppercase tracking-wider text-dbz-orange sm:text-xl">
              <T
                k={
                  mode === "location"
                    ? "wiki.presentationEmbedded.locationBattlesHeading"
                    : "wiki.presentationEmbedded.battlesHeading"
                }
                values={{ count: safeBattles.length }}
              />
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-dbz-orange/40 to-transparent" />
          </div>
          <p className="text-sm text-white/65">
            <T
              k={
                mode === "location"
                  ? "wiki.presentationEmbedded.locationBattlesLead"
                  : "wiki.presentationEmbedded.battlesLead"
              }
              values={{ name: subjectName }}
            />
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {safeBattles.map((b) => (
              <GatedWrap
                key={b.slug}
                href="/wiki/events"
                className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-dbz-orange/50 hover:bg-dbz-orange/[0.05] space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="rounded bg-dbz-orange/15 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-dbz-orange">
                    {b.series}
                  </span>
                  {b.winnerName && (
                    <span className="font-medium text-emerald-400">
                      <T
                        k="wiki.presentationEmbedded.winnerBadge"
                        values={{ winner: b.winnerName }}
                      />
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{b.title}</h4>
                  {b.titleJa && (
                    <p lang="ja" className="font-jp text-xs text-white/45">
                      {b.titleJa}
                    </p>
                  )}
                </div>
                {b.climaxSummary && (
                  <p className="text-xs leading-relaxed text-white/70">{b.climaxSummary}</p>
                )}
                {mode !== "location" && b.location && (
                  <p className="pt-1 font-mono text-[11px] text-white/45">
                    <T
                      k="wiki.presentationEmbedded.battleLocation"
                      values={{ location: b.location }}
                    />
                  </p>
                )}
              </GatedWrap>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
