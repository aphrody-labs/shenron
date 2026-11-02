"use client";

import type { Availability } from "@/db/bot-schema";
import { useTranslations } from "next-intl";
import type { Lecteur } from "./VideoLecteurs";

const LANGUAGES = ["vf", "vostfr", "vost"] as const;
type TrackedLanguage = (typeof LANGUAGES)[number];

/** Shows the catalog evidence for each version, including explicit gaps. */
export function VideoSourceSummary({
  players,
  offers,
  coverage,
  subtitles = 0,
}: {
  players: Lecteur[];
  offers?: Availability[] | null;
  coverage?: {
    total: number;
    players: Record<TrackedLanguage, number>;
    official: Record<TrackedLanguage, number>;
    /** Episodes with original-language audio, whether subtitled in FR or another language. */
    originalAudio: { players: number; official: number };
  };
  subtitles?: number;
  frames?: number;
}) {
  const t = useTranslations("mediaPlayback");
  const sources = players.filter((player) => player.embedUrl.trim());
  const official = (offers ?? []).filter((offer) => offer.available);
  const originalAudio = coverage?.originalAudio ?? {
    players: sources.filter((source) => source.lang === "vostfr" || source.lang === "vost").length,
    official: official.filter(
      (offer) => offer.langs.includes("vostfr") || offer.langs.includes("vost"),
    ).length,
  };

  return (
    <section
      aria-label={t("sourceCoverage")}
      className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
    >
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/75">
        {t("sourceCoverage")}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {LANGUAGES.map((language) => {
          const playerCount =
            coverage?.players[language] ??
            sources.filter((source) => source.lang === language).length;
          const officialCount =
            coverage?.official[language] ??
            official.filter((offer) => offer.langs.includes(language)).length;
          const present = playerCount > 0 || officialCount > 0;
          return (
            <li
              key={language}
              className={`rounded-lg border px-3 py-2 ${
                present
                  ? "border-emerald-400/30 bg-emerald-400/10"
                  : "border-amber-400/30 bg-amber-400/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{t(language)}</span>
                <span className="text-xs font-semibold text-white/75">
                  {present
                    ? t("sourceListed")
                    : coverage || offers !== undefined
                      ? t("sourceMissing")
                      : t("sourceNotTracked")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-snug text-white/75">
                {coverage
                  ? t("sourceEvidenceAggregate", {
                      players: playerCount,
                      official: officialCount,
                      total: coverage.total,
                    })
                  : t("sourceEvidence", { players: playerCount, official: officialCount })}
              </p>
            </li>
          );
        })}
        <li
          className={`rounded-lg border px-3 py-2 ${
            originalAudio.players > 0 || originalAudio.official > 0
              ? "border-emerald-400/30 bg-emerald-400/10"
              : "border-amber-400/30 bg-amber-400/10"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-white">{t("vo")}</span>
            <span className="text-xs font-semibold text-white/75">
              {originalAudio.players > 0 || originalAudio.official > 0
                ? t("sourceListed")
                : coverage || offers !== undefined
                  ? t("sourceMissing")
                  : t("sourceNotTracked")}
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-white/75">
            {coverage
              ? t("sourceEvidenceAggregate", {
                  players: originalAudio.players,
                  official: originalAudio.official,
                  total: coverage.total,
                })
              : t("sourceEvidence", {
                  players: originalAudio.players,
                  official: originalAudio.official,
                })}
          </p>
          <p className="mt-1 text-xs leading-snug text-white/75">{t("voTrackingNote")}</p>
        </li>
      </ul>
      {(sources.length > 0 || (Number.isFinite(subtitles) && subtitles > 0)) && (
        <p className="mt-2 text-xs text-white/75">
          {t("externalPlayerCount", { count: sources.length })}
          {subtitles > 0 ? ` · ${t("captions")}: ${subtitles}` : ""}
        </p>
      )}
    </section>
  );
}
