// SPDX-License-Identifier: Apache-2.0
import type { TVEpisode, WithContext } from "schema-dts";
import { excerpt } from "@/app/wiki/episodes/_text";
import { assetUrl } from "./assets";
import { episodeNumberText } from "./episode-number";
import type { Episode } from "./db-universe";

export type EpisodeJsonLdInput = Pick<
  Episode,
  | "id"
  | "series"
  | "number_in_series"
  | "title"
  | "title_ja"
  | "synopsis"
  | "image"
  | "air_date"
  | "video_url"
  | "stream_url"
> & { duration_sec?: number | null };

export interface EpisodeJsonLdOptions {
  seriesLabel: string;
  siteUrl: string;
}

/** ISO 8601 duration for a positive whole number of seconds, `undefined` otherwise. */
export function isoDuration(seconds: number | null | undefined): string | undefined {
  if (seconds == null || !Number.isSafeInteger(seconds) || seconds <= 0) return undefined;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `PT${hours > 0 ? `${hours}H` : ""}${minutes}M${seconds % 60}S`;
}

function isoDate(seconds: number | null): string | undefined {
  return seconds ? new Date(seconds * 1000).toISOString() : undefined;
}

/** Schema.org TVEpisode for a catalogue row; every field is omitted when the row lacks it. */
export function episodeJsonLd(
  ep: EpisodeJsonLdInput,
  { seriesLabel, siteUrl }: EpisodeJsonLdOptions,
): WithContext<TVEpisode> {
  const origin = siteUrl.replace(/\/+$/, "");
  const episodeNumber = episodeNumberText(ep.number_in_series);
  const titleJa = ep.title_ja?.trim();
  const description = excerpt(ep.synopsis) || undefined;
  const image = ep.image ? assetUrl(ep.image) : undefined;
  const datePublished = isoDate(ep.air_date);
  const duration = isoDuration(ep.duration_sec);
  const contentUrl = (ep.video_url || ep.stream_url) ?? undefined;
  return {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    url: `${origin}/wiki/episodes/${ep.id}`,
    ...(episodeNumber === null ? {} : { episodeNumber }),
    name: ep.title,
    ...(titleJa && titleJa !== ep.title ? { alternateName: titleJa } : {}),
    description,
    image,
    ...(duration ? { duration } : {}),
    inLanguage: "fr",
    ...(datePublished ? { datePublished } : {}),
    partOfSeries: {
      "@type": "TVSeries",
      name: seriesLabel,
      url: `${origin}/wiki/episodes/series/${ep.series}`,
    },
    ...(contentUrl
      ? {
          video: {
            "@type": "VideoObject" as const,
            name: ep.title,
            description,
            thumbnailUrl: image,
            contentUrl,
            uploadDate: datePublished,
            duration,
          },
        }
      : {}),
  };
}
