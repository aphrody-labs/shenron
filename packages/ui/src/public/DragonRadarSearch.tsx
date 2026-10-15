// SPDX-License-Identifier: Apache-2.0
// View moved from Shenron's wiki/DragonRadarSearch.tsx (691e28e).
"use client";
import { useState, useEffect, useMemo, useId, type ComponentType, type ReactNode } from "react";
import { DragonRadar, Livre, Kame } from "../icones";
import { useDragonRadar, type RadarTransport, type SearchScope } from "./use-dragon-radar";
import { radarText, type DragonRadarMessages } from "./dragon-radar-messages";
export interface RadarLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}
export interface DragonRadarSearchProps {
  initialQuery?: string;
  transport: RadarTransport;
  messages: DragonRadarMessages;
  suggestions: readonly string[];
  Link: ComponentType<RadarLinkProps>;
  GatedLink: ComponentType<RadarLinkProps>;
  assetUrl: (path: string) => string;
  timeoutMs?: number;
}
export function DragonRadarSearch({
  initialQuery = "",
  transport,
  messages,
  suggestions,
  Link,
  GatedLink,
  assetUrl,
  timeoutMs,
}: DragonRadarSearchProps) {
  const inputId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery.trim());
  const [scope, setScope] = useState<SearchScope>("all");
  const queryPending = query.trim() !== debouncedQ;
  const selectQuery = (value: string) => {
    cancelEvidence();
    setQuery(value);
    setDebouncedQ(value.trim());
  };
  const {
    results,
    canonData,
    isLoading,
    canonLoading,
    error,
    canonError,
    retry,
    evidence,
    evidenceLoading,
    requestEvidence,
    cancelEvidence,
  } = useDragonRadar(debouncedQ, scope, transport, timeoutMs);
  const t = (key: Parameters<typeof radarText>[1], values?: Record<string, string | number>) =>
    radarText(messages, key, values);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const visibleResultsCount =
    !results || scope === "canon"
      ? 0
      : scope === "manga"
        ? results.mangaChapters.length + results.mangaVolumes.length
        : scope === "anime"
          ? results.episodes.length + results.movies.length
          : scope === "lore"
            ? results.characters.length +
              results.techniques.length +
              results.sagas.length +
              results.transformations.length +
              results.battles.length +
              results.tournaments.length
            : Object.values(results)
                .filter(Array.isArray)
                .reduce((count, rows) => count + rows.length, 0);
  const totalResultsCount = useMemo(() => {
    if (!results) return 0;
    return (
      results.characters.length +
      results.techniques.length +
      results.transformations.length +
      results.sagas.length +
      results.episodes.length +
      results.movies.length +
      results.mangaChapters.length +
      results.mangaVolumes.length +
      results.battles.length +
      results.tournaments.length
    );
  }, [results]);

  return (
    <div
      className="space-y-8"
      data-dragon-radar="shared"
      aria-busy={Boolean(query.trim()) && (isLoading || queryPending)}
    >
      {/* Dragon Radar Terminal Visuel */}
      <div className="relative mx-auto w-full max-w-2xl rounded-3xl border-4 border-[#143d23] bg-[#07170c] p-6 shadow-[0_0_60px_rgba(16,185,129,0.2)]">
        {/* Antenne / Molette supérieure du Dragon Radar */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1">
          <div className="h-6 w-12 rounded-t-lg border-2 border-b-0 border-[#1b5430] bg-[#103a20] shadow-inner" />
          <div className="h-3 w-4 -mt-2 rounded-full bg-amber-400 border border-amber-600 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
        </div>

        {/* En-tête Scouter / Écran Radar */}
        <div className="relative z-10 flex items-center justify-between border-b border-emerald-500/20 pb-3 text-emerald-400 font-mono text-[11px] uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
            <span>{t("frequency")}</span>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-emerald-400/70">
            <span>{t("grid")}</span>
            <span>{t("sensors")}</span>
          </div>
        </div>

        {/* Écran Radar Circulaire Rétro-Vert */}
        <div className="relative my-6 mx-auto aspect-[16/9] sm:aspect-[2/1] w-full overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-[#041208] p-4 flex flex-col items-center justify-center shadow-[inset_0_0_40px_rgba(16,185,129,0.2)]">
          {/* Texture grille CRT et cercles concentriques */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:20px_20px] opacity-15" />

          {/* Cercles concentriques radar */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[90%] aspect-square rounded-full border border-emerald-500/20" />
            <div className="absolute h-[65%] aspect-square rounded-full border border-emerald-500/20" />
            <div className="absolute h-[40%] aspect-square rounded-full border border-emerald-500/25" />
            <div className="absolute h-[15%] aspect-square rounded-full border border-emerald-500/30" />
            {/* Axes X et Y */}
            <div className="absolute h-full w-px bg-emerald-500/20" />
            <div className="absolute w-full h-px bg-emerald-500/20" />
          </div>

          {/* Balayage Radar (Sweep Animation) */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <div
              className="h-full w-full rounded-full opacity-30 origin-center animate-[spin_4s_linear_infinite] motion-reduce:animate-none"
              style={{
                background:
                  "conic-gradient(from 0deg at 50% 50%, rgba(16, 185, 129, 0.4) 0deg, transparent 60deg, transparent 360deg)",
              }}
            />
          </div>

          {/* Points Lumineux Radar (Blips) */}
          {totalResultsCount > 0 && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute top-[30%] left-[40%] h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-ping motion-reduce:animate-none" />
              <div className="absolute top-[60%] right-[35%] h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-ping motion-reduce:animate-none delay-300" />
              <div className="absolute top-[45%] right-[25%] h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse motion-reduce:animate-none" />
            </div>
          )}

          {/* Zone de recherche centrale sur le Radar */}
          <div className="relative z-20 w-full max-w-lg px-4 text-center">
            <label htmlFor={inputId} className="sr-only">
              {t("searchLabel")}
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-emerald-400">
                <DragonRadar className="w-5 h-5 animate-pulse motion-reduce:animate-none" />
              </span>
              <input
                id={inputId}
                type="search"
                value={query}
                onChange={(e) => {
                  cancelEvidence();
                  setQuery(e.target.value);
                }}
                placeholder={t("placeholder")}
                className="w-full rounded-xl border-2 border-emerald-500/50 bg-black/80 py-3 pl-11 pr-10 text-sm font-bold text-emerald-300 placeholder-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => selectQuery("")}
                  className="absolute right-0 min-h-11 min-w-11 text-xs text-emerald-400 hover:text-white"
                  aria-label={t("clear")}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Boutons de Filtre de Portée (Scope) */}
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-emerald-500/20 pt-4">
          {[
            { id: "all" as SearchScope, label: t("all") },
            { id: "canon" as SearchScope, label: t("canon") },
            { id: "manga" as SearchScope, label: t("manga") },
            { id: "anime" as SearchScope, label: t("anime") },
            { id: "lore" as SearchScope, label: t("lore") },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                cancelEvidence();
                setScope(item.id);
                setDebouncedQ(query.trim());
              }}
              aria-pressed={scope === item.id}
              className={`rounded-lg min-h-11 px-3 py-1.5 font-mono text-xs font-bold uppercase transition-all ${
                scope === item.id
                  ? "bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.5)] font-black"
                  : "border border-emerald-500/30 bg-emerald-950/30 text-emerald-400/80 hover:border-emerald-500/60 hover:text-emerald-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Suggestions de recherche */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/60 mr-1">
            {t("quickTargets")}
          </span>
          {suggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => selectQuery(sug)}
              className="rounded-full min-h-11 border border-emerald-500/20 bg-emerald-950/40 px-2.5 py-0.5 font-mono text-[10px] text-emerald-300/80 hover:border-emerald-400 hover:text-emerald-200 transition-colors"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* Zone d'affichage des résultats radar */}
      {Boolean(query.trim()) && (isLoading || queryPending) && (
        <output className="block p-8 text-center font-mono text-xs text-emerald-400 animate-pulse motion-reduce:animate-none">
          {t("loading")}
        </output>
      )}

      {canonLoading && !queryPending && (
        <output className="block text-center text-sm text-emerald-400">{t("canonLoading")}</output>
      )}
      {(error || canonError) && !queryPending && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/30 bg-black/40 p-4 text-sm text-amber-200"
        >
          <p>{t(error ? "error" : "canonError")}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 min-h-11 rounded-lg border border-amber-400 px-4 font-bold"
          >
            {t("retry")}
          </button>
        </div>
      )}
      {!isLoading && !queryPending && debouncedQ && (
        <div className="space-y-8 reveal-up motion-reduce:animate-none">
          {/* 1. Résultat Canonicité Arbitré (si scope = all ou canon) */}
          {(scope === "all" || scope === "canon") &&
            canonData &&
            canonData.nature === "verdict" && (
              <div
                className="rounded-2xl border p-5 backdrop-blur-md transition-all shadow-xl"
                style={{ borderColor: canonData.color, backgroundColor: `${canonData.color}10` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚖️</span>
                    <span
                      className="font-mono text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${canonData.color}30`, color: canonData.color }}
                    >
                      {canonData.tierLabel}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-white/60">
                    {t("canonIndex")}{" "}
                    <strong className="text-white">{canonData.score} / 100</strong>
                  </div>
                </div>
                <p className="mt-3 font-display text-lg sm:text-xl font-bold text-white">
                  {canonData.verdict}
                </p>
                <p className="mt-2 text-xs sm:text-sm leading-relaxed text-white/80">
                  {canonData.explanation}
                </p>
              </div>
            )}

          {scope === "canon" &&
            canonData?.evidenceAssessmentEnabled &&
            transport.assessEvidence && (
              <section
                aria-label={t("evidenceTitle")}
                className="rounded-2xl border border-white/20 p-5 space-y-3"
              >
                <p className="text-sm">{t("evidenceTitle")}</p>
                <button
                  type="button"
                  disabled={evidenceLoading || debouncedQ.length > 400}
                  onClick={() => void requestEvidence()}
                  className="min-h-11 rounded-lg border border-amber-400 px-4 disabled:opacity-50"
                >
                  {t(evidenceLoading ? "evidenceLoading" : "evidenceAction")}
                </button>
                <output className="block" aria-live="polite">
                  {evidence?.status === "selected" && (
                    <Link
                      href={
                        "/wiki/canon?q=" +
                        encodeURIComponent(debouncedQ) +
                        "#canon-reference-" +
                        evidence.referenceIndex
                      }
                      className="underline"
                    >
                      {t("evidenceSelected")}: {evidence.subject} — {evidence.source}
                    </Link>
                  )}
                  {evidence?.status === "abstained" && <span>{t("evidenceAbstained")}</span>}
                  {evidence?.status === "unavailable" && <span>{t("evidenceUnavailable")}</span>}
                </output>
              </section>
            )}
          {/* 2. Manga & Scans (si scope = all ou manga) */}
          {(scope === "all" || scope === "manga") &&
            results &&
            (results.mangaChapters.length > 0 || results.mangaVolumes.length > 0) && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <Livre className="w-5 h-5 text-orange-400" />
                  <h3 className="font-saiyan text-xl text-white tracking-wider">
                    {t("mangaHeading", {
                      count: results.mangaChapters.length + results.mangaVolumes.length,
                    })}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {results.mangaChapters.slice(0, 6).map((ch) => (
                    <Link
                      key={ch.id}
                      href={`/wiki/manga/${ch.id}`}
                      className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-orange-500 hover:bg-orange-950/20 transition-all group"
                    >
                      <div>
                        <span className="text-[10px] font-mono text-orange-400 uppercase font-bold">
                          {ch.series ?? messages.shortSeriesFallback} ·{" "}
                          {t("chapter", { number: ch.chapter_number ?? "—" })}
                        </span>
                        <div className="text-xs font-bold text-white group-hover:text-orange-300 line-clamp-1">
                          {ch.title || t("chapter", { number: ch.chapter_number ?? "—" })}
                        </div>
                      </div>
                      <span className="text-xs text-orange-400 font-bold ml-2">{t("read")}</span>
                    </Link>
                  ))}
                  {results.mangaVolumes.slice(0, 3).map((vol) => (
                    <Link
                      key={vol.id}
                      href={`/wiki/manga/volume/${vol.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-orange-500 hover:bg-orange-950/20 transition-all group"
                    >
                      {vol.cover && (
                        <img
                          src={assetUrl(vol.cover)}
                          alt={t("volume", { number: vol.volume_number ?? "—" })}
                          className="h-12 w-8 object-cover rounded shadow"
                        />
                      )}
                      <div>
                        <span className="text-[10px] font-mono text-amber-400 uppercase font-bold">
                          {vol.series} · {t("volume", { number: vol.volume_number ?? "—" })}
                        </span>
                        <div className="text-xs font-bold text-white group-hover:text-orange-300 line-clamp-1">
                          {vol.title || t("volume", { number: vol.volume_number ?? "—" })}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

          {/* 3. Animé & Films (si scope = all ou anime) */}
          {(scope === "all" || scope === "anime") &&
            results &&
            (results.episodes.length > 0 || results.movies.length > 0) && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <span className="text-xl">📺</span>
                  <h3 className="font-saiyan text-xl text-white tracking-wider">
                    {t("animeHeading", { count: results.episodes.length + results.movies.length })}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {results.episodes.slice(0, 6).map((ep) => (
                    <Link
                      key={ep.id}
                      href={`/wiki/episodes/${ep.id}`}
                      className="p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-sky-500 hover:bg-sky-950/20 transition-all group block"
                    >
                      <span className="text-[10px] font-mono text-sky-400 uppercase font-bold">
                        {ep.series ?? messages.seriesFallback} ·{" "}
                        {t("episode", { number: ep.episode_number })}
                      </span>
                      <div className="text-xs font-bold text-white group-hover:text-sky-300 line-clamp-1">
                        {ep.title}
                      </div>
                    </Link>
                  ))}
                  {results.movies.map((m) => (
                    <Link
                      key={m.id}
                      href={`/wiki/movies/${m.id}`}
                      className="p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-sky-500 hover:bg-sky-950/20 transition-all group block"
                    >
                      <span className="text-[10px] font-mono text-sky-400 uppercase font-bold">
                        {t("movie")} {m.release_year ? `(${m.release_year})` : ""}
                      </span>
                      <div className="text-xs font-bold text-white group-hover:text-sky-300 line-clamp-1">
                        {m.title}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

          {/* 4. Encyclopédie & Lore (si scope = all ou lore) */}
          {(scope === "all" || scope === "lore") &&
            results &&
            (results.characters.length > 0 ||
              results.techniques.length > 0 ||
              results.sagas.length > 0 ||
              results.transformations.length > 0 ||
              results.battles.length > 0 ||
              results.tournaments.length > 0) && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <Kame className="w-5 h-5 text-dbz-yellow" />
                  <h3 className="font-saiyan text-xl text-white tracking-wider">
                    {t("loreHeading", {
                      count:
                        results.characters.length +
                        results.techniques.length +
                        results.sagas.length +
                        results.transformations.length +
                        results.battles.length +
                        results.tournaments.length,
                    })}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {results.characters.slice(0, 6).map((c) => (
                    <GatedLink
                      key={c.id}
                      href={`/wiki/characters/${c.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-yellow-500 hover:bg-yellow-950/20 transition-all group"
                    >
                      {c.image && (
                        <img
                          src={assetUrl(c.image)}
                          alt={c.name}
                          className="h-10 w-10 object-cover rounded-full border border-white/10"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white group-hover:text-yellow-300 truncate">
                          {c.name}
                        </div>
                        {c.description && (
                          <div className="text-[10px] text-white/50 truncate">{c.description}</div>
                        )}
                      </div>
                    </GatedLink>
                  ))}
                  {results.techniques.slice(0, 6).map((technique) => (
                    <GatedLink
                      key={technique.id}
                      href={`/wiki/techniques/${technique.slug}`}
                      className="p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-yellow-500 hover:bg-yellow-950/20 transition-all group block"
                    >
                      <span className="text-[10px] font-mono text-yellow-400 uppercase font-bold">
                        {messages.technique} · {technique.type ?? messages.ki}
                      </span>
                      <div className="text-xs font-bold text-white group-hover:text-yellow-300 truncate">
                        {technique.name}
                      </div>
                    </GatedLink>
                  ))}
                  {(
                    [
                      {
                        kind: "sagas",
                        rows: results.sagas.map((row) => ({
                          id: row.id,
                          name: row.name,
                          href: `/wiki/sagas/${row.slug}`,
                        })),
                      },
                      {
                        kind: "transformations",
                        rows: results.transformations.map((row) => ({
                          id: row.id,
                          name: row.name,
                          href: `/wiki/characters/${row.character_id}`,
                        })),
                      },
                      {
                        kind: "battles",
                        rows: results.battles.map((row) => ({
                          id: row.id,
                          name: row.name,
                          href: `/wiki/events?type=battles&q=${encodeURIComponent(row.name)}`,
                        })),
                      },
                      {
                        kind: "tournaments",
                        rows: results.tournaments.map((row) => ({
                          id: row.id,
                          name: row.name,
                          href: `/wiki/events?type=tournaments&q=${encodeURIComponent(row.name)}`,
                        })),
                      },
                    ] as const
                  ).map((group) =>
                    group.rows.slice(0, 6).map((row) => (
                      <GatedLink
                        key={`${group.kind}-${row.id}`}
                        href={row.href}
                        className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-all hover:border-yellow-500 hover:bg-yellow-950/20"
                      >
                        <span className="font-mono text-[10px] font-bold uppercase text-yellow-400">
                          {messages[group.kind]}
                        </span>
                        <div className="truncate text-xs font-bold text-white">{row.name}</div>
                      </GatedLink>
                    )),
                  )}
                </div>
              </section>
            )}

          {visibleResultsCount === 0 &&
            (!canonData || canonData.nature !== "verdict") &&
            !error &&
            !canonError &&
            !canonLoading && (
              <div className="p-8 text-center text-xs text-white/50 italic border border-white/10 rounded-2xl bg-black/40">
                {t(scope === "canon" ? "noVerdict" : "empty", { query: debouncedQ })}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
