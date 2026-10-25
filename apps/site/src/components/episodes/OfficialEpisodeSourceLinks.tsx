"use client";

import { useTranslations } from "next-intl";
import { sdbhOfficialSourceUrl } from "@/lib/sdbh-official-sources";

type SourceEpisode = {
  id: number | string;
  number_in_series?: number | null;
  title?: string | null;
};

/** Exact SDBH episode links from the official Dragon Ball Heroes YouTube channel. */
export function OfficialEpisodeSourceLinks({ episodes }: { episodes: readonly SourceEpisode[] }) {
  const t = useTranslations("mediaPlayback");
  const entries = episodes.flatMap((episode) => {
    const href = sdbhOfficialSourceUrl(episode.id);
    if (!href) return [];
    return [
      {
        episode,
        href,
        title: episode.title?.trim() || `#${episode.number_in_series ?? episode.id}`,
      },
    ];
  });
  if (entries.length === 0) return null;

  return (
    <section
      aria-label={t("externalPlayers")}
      className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-4"
    >
      <h3 className="mb-3 text-sm font-bold text-white">{t("externalPlayers")}</h3>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(({ episode, href, title }) => (
          <li key={episode.id}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${title} · YouTube`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 underline decoration-white/30 underline-offset-4 transition-colors hover:border-dbz-orange/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
            >
              <span className="min-w-0 truncate">{title}</span>
              <span className="shrink-0 text-xs text-white/55">YouTube ↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
