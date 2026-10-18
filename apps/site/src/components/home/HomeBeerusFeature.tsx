// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import Image from "next/image";
import { T } from "@/components/T";
import { DBS_BEERUS_SERIES_CODE } from "@/lib/episode-series-catalogue";
import { DragonBall } from "@aphrody/shenron-ui/toriyama";

export interface BeerusEpisodeSummary {
  id: number;
  number: number | null;
  title: string;
  titleJa?: string | null;
  airDate?: number | null;
  duration?: number | null;
  image?: string;
}

export interface BeerusFeature {
  total: number;
  latest: BeerusEpisodeSummary | null;
  episodes?: BeerusEpisodeSummary[];
}

const OFFICIAL_BEERUS_POSTER = "/banners/dbs-beerus-2026.jpg";

/**
 * Dragon Ball Super: Beerus Feature Component on Homepage.
 * Fuses Toriyama SVG accents, Shenron UI tokens, and real-time episode list with the official poster.
 */
export function HomeBeerusFeature({ beerus }: { beerus: BeerusFeature }) {
  const { latest, total, episodes = [] } = beerus;

  return (
    <aside
      aria-labelledby="home-beerus-title"
      className="mt-6 w-full max-w-4xl overflow-hidden rounded-2xl border border-dbz-gold/30 bg-gradient-to-br from-black/85 via-zinc-950/90 to-purple-950/30 p-4 shadow-2xl backdrop-blur-md sm:p-6"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
        {/* Affiche officielle Beerus */}
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-xl border border-white/10 md:aspect-[3/4] md:w-56">
          <Image
            src={OFFICIAL_BEERUS_POSTER}
            alt="Dragon Ball Super: Beerus"
            fill
            sizes="(max-width: 768px) 100vw, 224px"
            className="object-cover transition-transform duration-500 hover:scale-105"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent md:hidden" />
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-dbz-gold backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-dbz-orange" />
            2026 Diffusé
          </div>
        </div>

        {/* Détails & liste des épisodes en temps réel */}
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <DragonBall stars={7} size={20} decorative />
                <p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-dbz-orange">
                  <T k="dbsBeerus.heroEyebrow" />
                </p>
              </div>
              {total > 0 ? (
                <span className="rounded-full border border-purple-500/30 bg-purple-950/50 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
                  <T k="dbsBeerus.heroCount" values={{ count: total }} />
                </span>
              ) : null}
            </div>

            <h2
              id="home-beerus-title"
              className="m-0 mt-1 font-display text-xl font-bold tracking-tight text-white sm:text-2xl"
            >
              <T k="dbsBeerus.title" />
            </h2>

            {latest ? (
              <div className="mt-3 rounded-lg border border-dbz-orange/20 bg-dbz-orange/10 p-3">
                <span className="text-xs font-medium uppercase tracking-wider text-dbz-orange">
                  <T k="dbsBeerus.heroLatest" />
                </span>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/wiki/episodes/${latest.id}`}
                    className="group inline-flex items-center gap-2 font-display text-sm font-bold text-white hover:text-dbz-gold"
                  >
                    <span className="text-dbz-orange">
                      {latest.number ? `#${String(latest.number).padStart(2, "0")}` : "EP"}
                    </span>
                    <span className="underline-offset-2 group-hover:underline">{latest.title}</span>
                  </Link>
                  <Link
                    href={`/wiki/episodes/${latest.id}`}
                    className="inline-flex items-center gap-1 rounded bg-dbz-orange px-3 py-1 text-xs font-bold text-black transition-colors hover:bg-dbz-gold"
                  >
                    Visionner en interne
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Liste des épisodes disponibles en temps réel */}
            {episodes.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                  Épisodes disponibles ({episodes.length})
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {episodes.map((ep) => (
                    <Link
                      key={ep.id}
                      href={`/wiki/episodes/${ep.id}`}
                      className="group flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] p-2.5 transition-all hover:border-dbz-gold/40 hover:bg-white/[0.07]"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-zinc-900 text-xs font-bold text-dbz-gold">
                          {ep.number ?? "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="m-0 truncate text-xs font-semibold text-white group-hover:text-dbz-gold">
                            {ep.title}
                          </p>
                          {ep.duration ? (
                            <span className="text-[0.6875rem] text-white/40">
                              {Math.round(ep.duration / 60)} min
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-dbz-orange opacity-0 transition-opacity group-hover:opacity-100">
                        ▶
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between border-t border-white/10 pt-3 text-xs">
            <Link
              href={`/wiki/episodes/series/${DBS_BEERUS_SERIES_CODE}`}
              className="font-semibold text-dbz-orange underline-offset-4 hover:underline"
            >
              <T k="dbsBeerus.heroAll" /> →
            </Link>
            <span className="text-white/40">Diffusion 100% interne dragonballfr.com</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
