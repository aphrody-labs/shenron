"use client";

import { useTranslations } from "next-intl";
import type { Lecteur } from "./VideoLecteurs";

/** Summarizes only resources actually present on the episode. */
export function VideoSourceSummary({
  players,
  subtitles = 0,
}: {
  players: Lecteur[];
  subtitles?: number;
  frames?: number;
}) {
  const t = useTranslations("mediaPlayback");
  const sources = players.filter((player) => player.embedUrl.trim());
  const providers = [...new Set(sources.map((player) => player.provider.trim()).filter(Boolean))];
  const languages = [...new Set(sources.map((player) => player.lang).filter(Boolean))];
  const items: [string, string][] = [];
  if (sources.length) {
    const value = [String(sources.length), ...providers].join(" · ");
    items.push([t("externalPlayers"), value]);
  }
  if (languages.length) {
    items.push([t("availableLanguages"), languages.map((language) => t(language!)).join(" · ")]);
  }
  if (Number.isFinite(subtitles) && subtitles > 0) items.push([t("captions"), String(subtitles)]);
  if (!items.length) return null;

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-white/45">{label}</dt>
          <dd className="mt-0.5 truncate text-sm font-bold text-white" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
