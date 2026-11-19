import type { TVSeries, WithContext } from "schema-dts";
import { episodeNumberText } from "./episode-number";

export type SeriesJsonLdInput = {
  code: string;
  label: string;
  total: number;
  /** `SERIES_YEARS` entry: `YYYY-YYYY` for a run, `YYYY` for a single year. */
  years?: string;
  siteUrl: string;
  firstEpisodeId?: number;
  /** `number_in_series` of that episode; the episode number is omitted when null or absent. */
  firstEpisodeNumber?: number | null;
  /** Resolved backdrop, absolute or relative to the site. */
  image?: string;
};

const YEAR_RANGE = /^(\d{4})-(\d{4})$/;
const YEAR = /^(\d{4})$/;

function parseYears(years: string | undefined): { startDate?: string; endDate?: string } {
  const value = years?.trim() ?? "";
  const range = YEAR_RANGE.exec(value);
  if (range) return { startDate: range[1], endDate: range[2] };
  const single = YEAR.exec(value);
  return single ? { startDate: single[1] } : {};
}

function absolute(path: string, siteUrl: string): string {
  return new URL(path, `${siteUrl}/`).toString();
}

/** Schema.org TVSeries node for a catalogue series page. */
export function seriesJsonLd({
  code,
  label,
  total,
  years,
  siteUrl,
  firstEpisodeId,
  firstEpisodeNumber,
  image,
}: SeriesJsonLdInput): WithContext<TVSeries> {
  const base = siteUrl.replace(/\/+$/, "");
  const episodeNumber = episodeNumberText(firstEpisodeNumber ?? null);
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: label,
    url: absolute(`/wiki/episodes/series/${encodeURIComponent(code)}`, base),
    numberOfEpisodes: total,
    inLanguage: "fr",
    ...parseYears(years),
    ...(image ? { image: absolute(image, base) } : {}),
    ...(firstEpisodeId === undefined
      ? {}
      : {
          episode: {
            "@type": "TVEpisode" as const,
            ...(episodeNumber === null ? {} : { episodeNumber }),
            url: absolute(`/wiki/episodes/${firstEpisodeId}`, base),
          },
        }),
  };
}
