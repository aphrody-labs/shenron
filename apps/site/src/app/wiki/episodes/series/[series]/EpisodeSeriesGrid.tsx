"use client";

/**
 * Grille d'une série — recherche par titre ou numéro + rendu progressif.
 *
 * La page posait jusqu'à 1 000 cartes d'un seul bloc (Dragon Ball Z en compte
 * 291), sans recherche, sans filtre, sans saut au numéro : trouver l'épisode 187
 * demandait de faire défiler 187 vignettes. Le motif « voir plus » existait
 * pourtant déjà à côté, dans `CharacterGrid` — il n'avait simplement jamais été
 * appliqué ici.
 *
 * La recherche est locale : le jeu complet est déjà dans la page (rendu par le
 * serveur), donc filtrer ne coûte aucun aller-retour et fonctionne hors ligne.
 */
import { useMemo, useState } from "react";
import { Recherche } from "@aphrody/shenron-ui/icones";
import { EpisodeCard } from "@/components/stream/EpisodeCard";
import { useTranslations } from "next-intl";

export interface SeriesEpisode {
  id: number | string;
  href?: string;
  number: number | null;
  title: string;
  titleJa: string | null;
  image: string | null;
  synopsis: string | null;
  year: number | null;
  hasVf: boolean;
  hasVostfr: boolean;
  hasVost?: boolean;
  playerCount: number;
}

/** Palier de rendu — au-delà, « voir plus ». */
const PAGE = 60;

/** Normalise pour une recherche insensible casse/accents. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function filterSeriesEpisodes(
  episodes: SeriesEpisode[],
  query: string,
  language: "all" | "vf" | "vostfr" | "vost",
): SeriesEpisode[] {
  const q = fold(query.trim());
  const number = /^\d+$/.test(q) ? Number(q) : null;
  return episodes.filter((episode) => {
    if (language === "vf" && !episode.hasVf) return false;
    if (language === "vostfr" && !episode.hasVostfr) return false;
    if (language === "vost" && !episode.hasVost) return false;
    if (!q) return true;
    if (number !== null) return episode.number === number;
    return fold(`${episode.title} ${episode.titleJa ?? ""}`).includes(q);
  });
}

export function EpisodeSeriesGrid({ episodes }: { episodes: SeriesEpisode[] }) {
  const t = useTranslations("mediaPlayback");
  const labels = useTranslations("episodeSeries");
  const beerus = useTranslations("dbsBeerus");
  const localizedEpisodes = useMemo(
    () =>
      episodes.map((episode) =>
        episode.id === "DBS_BEERUS:1"
          ? { ...episode, title: beerus("episodeTitle"), synopsis: beerus("episodeSynopsis") }
          : episode,
      ),
    [episodes, beerus],
  );
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [language, setLanguage] = useState<"all" | "vf" | "vostfr" | "vost">("all");

  const filtered = useMemo(() => {
    return filterSeriesEpisodes(localizedEpisodes, query, language);
  }, [localizedEpisodes, query, language]);

  const visible = filtered.slice(0, limit);
  const remaining = filtered.length - visible.length;
  const vfCount = episodes.filter((episode) => episode.hasVf).length;
  const vostfrCount = episodes.filter((episode) => episode.hasVostfr).length;
  const vostCount = episodes.filter((episode) => episode.hasVost).length;
  const imageCount = episodes.filter((episode) => episode.image).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label={labels("coverage")}>
        {[
          [labels("episodes"), episodes.length],
          [labels("vfSources"), vfCount],
          [labels("vostfrSources"), vostfrCount],
          [t("vost"), vostCount],
          [labels("thumbnails"), imageCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-xl font-black tabular-nums text-white sm:text-2xl">{value}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/45">{label}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-white/60">{labels("coverageNote")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Recherche
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            aria-label={labels("searchLabel")}
            placeholder={labels("searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-dbz-border bg-dbz-bg/70 pl-9 pr-3 text-[14px] text-white outline-none placeholder:text-white/50 focus:border-dbz-orange"
          />
        </div>
        <a
          href="#episode-grid"
          className="inline-flex min-h-10 items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/70 hover:border-dbz-orange/50 hover:text-dbz-orange"
        >
          {labels("jump")}
        </a>
        <fieldset className="flex gap-2 overflow-x-auto pb-1" aria-label={labels("languageFilter")}>
          {(
            [
              ["all", labels("all")],
              ["vf", `VF (${vfCount})`],
              ["vostfr", `VOSTFR (${vostfrCount})`],
              ["vost", `${t("vost")} (${vostCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setLanguage(key);
                setLimit(PAGE);
              }}
              aria-pressed={language === key}
              className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold transition ${language === key ? "bg-dbz-orange text-black" : "bg-white/[0.06] text-white/65 hover:bg-white/[0.12] hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <p className="text-[13px] text-white/50" aria-live="polite">
          {labels("results", { count: filtered.length, total: episodes.length })}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="dbz-panel py-12 text-center text-white/50">{labels("empty")}</p>
      ) : (
        <>
          <div
            id="episode-grid"
            className="grid scroll-mt-6 grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {visible.map((ep) => (
              <EpisodeCard
                key={ep.href ?? ep.id}
                href={ep.href ?? `/wiki/episodes/${ep.id}`}
                number={ep.number}
                title={ep.title}
                titleJa={ep.titleJa}
                image={ep.image}
                synopsis={ep.synopsis}
                year={ep.year}
                hasVf={ep.hasVf}
                hasVostfr={ep.hasVostfr}
                hasVost={ep.hasVost}
                playerCount={ep.playerCount}
                width="full"
              />
            ))}
          </div>
          {remaining > 0 && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE)}
                className="dbz-button-ghost !text-xs"
              >
                {labels("more", { count: Math.min(PAGE, remaining) })}
                <span className="ml-2 text-white/50">
                  {visible.length} / {filtered.length}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
