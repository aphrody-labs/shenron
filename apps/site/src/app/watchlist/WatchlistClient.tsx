"use client";

// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect } from "react";
import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { assetUrl } from "@/lib/assets";

export interface WatchlistEntry {
  id: string;
  seriesId: string;
  seriesTitle: string;
  episodeNumber?: number;
  episodeTitle?: string;
  thumbnailUrl?: string;
  watchUrl: string;
  durationMinutes?: number;
  progressPercent?: number;
  availableLangs: Array<"vf" | "vostfr" | "vost">;
  provider: "crunchyroll" | "shenron";
}

const DEFAULT_WATCHLIST: WatchlistEntry[] = [
  {
    id: "GE00389313JAJP",
    seriesId: "GT00389311",
    seriesTitle: "Dragon Ball Super: Beerus",
    episodeNumber: 1,
    episodeTitle: "Le dieu de la Destruction",
    thumbnailUrl: "/banners/dbs-beerus-2026.jpg",
    watchUrl: "/wiki/episodes/875",
    durationMinutes: 24,
    progressPercent: 35,
    availableLangs: ["vostfr"],
    provider: "crunchyroll",
  },
  {
    id: "GE00389314JAJP",
    seriesId: "GT00389311",
    seriesTitle: "Dragon Ball Super: Beerus",
    episodeNumber: 2,
    episodeTitle: "Le dieu de la Destruction se rend sur la planète de Kaïo",
    thumbnailUrl: "/banners/dbs-beerus-2026.jpg",
    watchUrl: "/wiki/episodes/876",
    durationMinutes: 24,
    progressPercent: 0,
    availableLangs: ["vostfr"],
    provider: "crunchyroll",
  },
  {
    id: "DBS-001",
    seriesId: "G63VGG2NY",
    seriesTitle: "Dragon Ball Super",
    episodeNumber: 1,
    episodeTitle: "Le prix de la paix : À qui reviennent les 100 millions de zénis ?",
    thumbnailUrl: "/wiki/media/episodes/dbs-001.webp",
    watchUrl: "/wiki/episodes/676",
    durationMinutes: 23,
    progressPercent: 100,
    availableLangs: ["vf", "vostfr"],
    provider: "shenron",
  },
  {
    id: "DB_DAIMA-001",
    seriesId: "GR243XG4R",
    seriesTitle: "Dragon Ball Daima",
    episodeNumber: 1,
    episodeTitle: "Conspiration",
    thumbnailUrl: "/wiki/media/episodes/daima-001.webp",
    watchUrl: "/wiki/episodes/877",
    durationMinutes: 32,
    progressPercent: 10,
    availableLangs: ["vostfr"],
    provider: "crunchyroll",
  },
];

export function WatchlistClient() {
  const me = useMe();
  const [filter, setFilter] = useState<"all" | "in-progress" | "completed">("all");
  const [entries, setEntries] = useState<WatchlistEntry[]>(DEFAULT_WATCHLIST);

  const filteredEntries = entries.filter((e) => {
    if (filter === "in-progress") return (e.progressPercent ?? 0) > 0 && (e.progressPercent ?? 0) < 95;
    if (filter === "completed") return (e.progressPercent ?? 0) >= 95;
    return true;
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Barre d'outils Néo-Brutaliste & Filtres */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-border/80 bg-zinc-950/70 p-4 backdrop-blur-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-dbz-orange" />
          </span>
          <span className="font-display text-sm font-bold tracking-wider uppercase text-white">
            {filteredEntries.length} série{filteredEntries.length > 1 ? "s" : ""} en cours
          </span>
        </div>

        {/* Segmented Filter */}
        <div className="inline-flex rounded-xl bg-zinc-900/90 p-1 border border-zinc-800 shadow-inner">
          {[
            { id: "all", label: "Tous" },
            { id: "in-progress", label: "À continuer" },
            { id: "completed", label: "Terminés" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as any)}
              className={`rounded-lg px-3.5 py-1.5 font-display text-xs font-bold uppercase tracking-wider transition-all ${
                filter === tab.id
                  ? "bg-dbz-orange text-black shadow-md"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grille des Cartes Épisodes Watchlist (Pixel Perfect vs Crunchyroll) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredEntries.map((item) => (
          <div
            key={item.id}
            className="group relative flex flex-col overflow-hidden rounded-2xl border-2 border-zinc-800/90 bg-zinc-950/80 p-3 transition-all duration-300 hover:-translate-y-1 hover:border-dbz-orange hover:shadow-[0_0_24px_rgba(255,102,0,0.25)]"
          >
            {/* Image / Miniature 16:9 */}
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-zinc-900">
              {item.thumbnailUrl ? (
                <img
                  src={assetUrl(item.thumbnailUrl)}
                  alt={item.episodeTitle ?? item.seriesTitle}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-full w-full place-items-center font-display text-xs text-zinc-600">
                  {item.seriesTitle}
                </div>
              )}

              {/* Badges Scouter & Provider */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <span className="rounded bg-black/80 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-cyan-400 backdrop-blur-md border border-cyan-500/20">
                  EP {String(item.episodeNumber ?? 1).padStart(2, "0")}
                </span>
                <span className="rounded bg-orange-600/90 px-2 py-0.5 font-display text-[9px] font-extrabold uppercase tracking-widest text-black">
                  {item.provider}
                </span>
              </div>

              {/* Indicateur de Durée */}
              {item.durationMinutes && (
                <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                  {item.durationMinutes}m
                </span>
              )}

              {/* Barre de Progression */}
              {(item.progressPercent ?? 0) > 0 && (
                <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/70">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-400"
                    style={{ width: `${item.progressPercent}%` }}
                  />
                </div>
              )}
            </div>

            {/* Titres & Métadonnées */}
            <div className="flex flex-col gap-1.5 pt-3">
              <span className="font-display text-[11px] font-bold uppercase tracking-wider text-dbz-orange/90 line-clamp-1">
                {item.seriesTitle}
              </span>
              <h3 className="font-display text-sm font-bold text-white line-clamp-1 group-hover:text-dbz-orange transition-colors">
                {item.episodeTitle ?? `Épisode ${item.episodeNumber}`}
              </h3>

              <div className="flex items-center justify-between pt-1">
                {/* Langues */}
                <div className="flex items-center gap-1">
                  {item.availableLangs.map((l) => (
                    <span
                      key={l}
                      className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-zinc-400"
                    >
                      {l}
                    </span>
                  ))}
                </div>

                {/* État de lecture */}
                {(item.progressPercent ?? 0) >= 95 ? (
                  <span className="font-mono text-[10px] font-bold text-emerald-400">VU</span>
                ) : (item.progressPercent ?? 0) > 0 ? (
                  <span className="font-mono text-[10px] font-bold text-amber-400">
                    {item.progressPercent}%
                  </span>
                ) : null}
              </div>

              {/* Bouton Regarder */}
              <Link
                href={item.watchUrl}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2 font-display text-xs font-bold text-white transition-colors hover:bg-dbz-orange hover:text-black border border-zinc-800 hover:border-dbz-orange shadow-sm"
              >
                <span>Reprendre la lecture</span>
                <span>▶</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
