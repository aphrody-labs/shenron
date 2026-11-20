// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import Link from "next/link";
import { T } from "@/components/T";
import type { WikiSource } from "@/lib/shenron";
import { mergeArticleAndColumnSources } from "@/lib/wiki-internal-sources";

export interface CanonicalFactEntry {
  key: string;
  label: ReactNode;
  value: ReactNode;
  subvalue?: ReactNode;
  href?: string | null;
}

function sourceKindBadgeKey(kind: string): string {
  switch (kind) {
    case "databook":
    case "databooks":
      return "wiki.canonicalFooter.kindDatabook";
    case "manga_chapter":
    case "manga_volume":
    case "manga":
      return "wiki.canonicalFooter.kindManga";
    case "episode":
      return "wiki.canonicalFooter.kindEpisode";
    case "movie":
      return "wiki.canonicalFooter.kindMovie";
    default:
      return "wiki.canonicalFooter.kindInternal";
  }
}

/**
 * Unified bottom-of-page verification block (`Repères canoniques & Sources`).
 *
 * Placed at the very bottom of Wiki pages so `SOMMAIRE` stays uncluttered and
 * every factual anchor + bibliography item links directly to its hosted page
 * on `dragonballfr.com`.
 */
const EMPTY_FACTS: readonly CanonicalFactEntry[] = [];

export function WikiCanonicalFooter({
  facts = EMPTY_FACTS,
  sources,
  article,
}: {
  facts?: readonly CanonicalFactEntry[];
  sources?: readonly WikiSource[] | null;
  article?: string | null;
}) {
  const internalSources = mergeArticleAndColumnSources(article, sources);
  const visibleFacts = facts.filter((f) => Boolean(f.value));

  if (visibleFacts.length === 0 && internalSources.length === 0) {
    return null;
  }

  return (
    <section
      id="sources-canoniques"
      className="dbz-panel space-y-6 border-t-2 border-t-dbz-blue/50 p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <p className="font-scouter text-[10px] uppercase tracking-[0.22em] text-dbz-blue-light">
            <T k="wiki.canonicalFooter.kicker" />
          </p>
          <h2 className="font-sans text-xl font-extrabold uppercase tracking-wider text-white sm:text-2xl">
            <T k="wiki.canonicalFooter.heading" />
          </h2>
        </div>
        {internalSources.length > 0 && (
          <span className="rounded-full border border-dbz-blue/35 bg-dbz-blue/10 px-3 py-1 font-mono text-xs tabular-nums text-dbz-blue-light">
            <T k="wiki.canonicalFooter.sourcesCount" values={{ count: internalSources.length }} />
          </span>
        )}
      </div>

      {visibleFacts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFacts.map((fact) => {
            const inner = (
              <>
                <p className="font-scouter text-[10px] uppercase tracking-[0.16em] text-dbz-blue-light">
                  {fact.label}
                </p>
                <div className="mt-1 text-sm font-semibold text-white">{fact.value}</div>
                {fact.subvalue && (
                  <div className="mt-0.5 text-xs text-white/60">{fact.subvalue}</div>
                )}
                {fact.href && (
                  <p className="mt-2 font-mono text-[11px] text-dbz-orange">
                    <T k="wiki.canonicalFooter.openOnDbfr" /> →
                  </p>
                )}
              </>
            );

            return fact.href ? (
              <Link
                key={fact.key}
                href={fact.href}
                className="group block rounded-xl border border-dbz-blue/25 bg-dbz-blue/[0.05] p-4 transition-colors hover:border-dbz-orange/50 hover:bg-dbz-orange/[0.06]"
              >
                {inner}
              </Link>
            ) : (
              <div key={fact.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                {inner}
              </div>
            );
          })}
        </div>
      )}

      {internalSources.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-dbz-orange">
              <T k="wiki.canonicalFooter.bibliographyHeading" />
            </h3>
            <span className="text-[11px] text-white/45">
              <T k="wiki.canonicalFooter.verifiedInternalNote" />
            </span>
          </div>
          <ol className="grid gap-2.5 sm:grid-cols-2">
            {internalSources.map((s, idx) => {
              const refNum = s.n ?? idx + 1;
              return (
                <li key={`${refNum}-${s.url}`} id={`ref-${refNum}`}>
                  <Link
                    href={s.url!}
                    className="group flex h-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3.5 text-sm transition-all hover:border-dbz-orange/50 hover:bg-dbz-orange/[0.06]"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-dbz-orange/15 px-1.5 py-0.5 font-mono text-xs font-bold text-dbz-orange">
                      [{refNum}]
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block font-medium leading-snug text-white/90 group-hover:text-white break-words">
                        {s.label}
                      </span>
                      <span className="inline-flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-dbz-blue-light">
                        <span>
                          <T k={sourceKindBadgeKey(s.kind)} />
                        </span>
                        <span className="text-white/35">·</span>
                        <span className="text-white/55 group-hover:text-dbz-orange transition-colors">
                          {s.url} →
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
