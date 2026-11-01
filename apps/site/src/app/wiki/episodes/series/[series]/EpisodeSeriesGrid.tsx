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
  durationSec?: number | null;
  hasVf: boolean;
  hasVostfr: boolean;
  hasVost?: boolean;
  officialLanguages?: ("vf" | "vostfr" | "vost")[];
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
    if (language === "vf" && !episode.hasVf && !episode.officialLanguages?.includes("vf"))
      return false;
    if (
      language === "vostfr" &&
      !episode.hasVostfr &&
      !episode.officialLanguages?.includes("vostfr")
    )
      return false;
    if (language === "vost" && !episode.hasVost && !episode.officialLanguages?.includes("vost"))
      return false;
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
  const vfCount = episodes.filter(
    (episode) => episode.hasVf || episode.officialLanguages?.includes("vf"),
  ).length;
  const vostfrCount = episodes.filter(
    (episode) => episode.hasVostfr || episode.officialLanguages?.includes("vostfr"),
  ).length;
  const vostCount = episodes.filter(
    (episode) => episode.hasVost || episode.officialLanguages?.includes("vost"),
  ).length;
  const imageCount = episodes.filter((episode) => episode.image).length;
  const vfMissing = episodes.length - vfCount;
  const vostfrMissing = episodes.length - vostfrCount;

  return (
    <div className="shenron-episode-series @container min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-xs">
        <div className="relative min-w-0 basis-64 flex-1 max-w-md">
          <Recherche
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
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
            className="min-h-11 w-full rounded-full border border-white/12 bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-[var(--muted-foreground)] focus:border-primary focus:outline-none"
          />
        </div>
        <a
          href="#episode-grid"
          className="inline-flex min-h-11 items-center rounded-full border border-white/12 bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
        >
          {labels("jump")}
        </a>
        <fieldset
          className="shenron-video-selectors flex min-w-0 max-w-full flex-wrap gap-2"
          aria-label={labels("languageFilter")}
        >
          {(
            [
              ["all", labels("all")],
              ["vf", `${t("vf")} (${vfCount})`],
              ["vostfr", `${t("vostfr")} (${vostfrCount})`],
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
              className={`min-h-11 shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange ${language === key ? "bg-primary text-primary-foreground shadow-sm" : "border border-white/10 bg-card text-foreground hover:bg-primary/15"}`}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <p
          className="ml-auto text-[13px] font-medium tabular-nums text-white/65"
          aria-live="polite"
        >
          {labels("results", { count: filtered.length, total: episodes.length })}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="dbz-panel py-12 text-center text-white/60">{labels("empty")}</p>
      ) : (
        <>
          <div
            id="episode-grid"
            className="grid scroll-mt-6 grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {visible.map((ep, index) => (
              <EpisodeCard
                key={ep.href ?? ep.id}
                href={ep.href ?? `/wiki/episodes/${ep.id}`}
                number={ep.number}
                title={ep.title}
                titleJa={ep.titleJa}
                image={ep.image}
                synopsis={ep.synopsis}
                year={ep.year}
                durationSec={ep.durationSec}
                hasVf={ep.hasVf}
                hasVostfr={ep.hasVostfr}
                hasVost={ep.hasVost}
                playerCount={ep.playerCount}
                eager={index < 4}
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

      <div className="space-y-3 pt-2">
        <div
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7"
          aria-label={labels("coverage")}
        >
          {[
            [labels("episodes"), episodes.length],
            [labels("vfSources"), vfCount],
            [labels("vostfrSources"), vostfrCount],
            [t("vost"), vostCount],
            [labels("vfMissing"), vfMissing],
            [labels("vostfrMissing"), vostfrMissing],
            [labels("thumbnails"), imageCount],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5"
            >
              <div className="text-lg font-bold tabular-nums text-card-foreground sm:text-xl">
                {value}
              </div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] [overflow-wrap:anywhere]">
                {label}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-white/55">{labels("coverageNote")}</p>
      </div>
    </div>
  );
}
