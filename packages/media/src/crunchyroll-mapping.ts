// SPDX-License-Identifier: Apache-2.0
/** Maps Crunchyroll catalogue metadata onto Shenron episode availability. Metadata only: no streams, tokens or licences. */

export const CRUNCHYROLL_SERIES_BY_SHENRON: Readonly<Record<string, string>> = {
  DBS_BEERUS: "GT00389311",
  DBS: "G63VGG2NY",
  DB_DAIMA: "GR243XG4R",
};

/** The fields of a Crunchyroll episode this mapping reads (the bridge's public-metadata allowlist). */
export interface CrunchyrollEpisode {
  id: string;
  title?: string;
  slug_title?: string;
  episode_number?: number | null;
  sequence_number?: number | null;
  season_id?: string;
  season_number?: number;
  duration_ms?: number;
  audio_locale?: string;
  subtitle_locales?: string[];
  is_premium_only?: boolean;
}

export interface MappedCrunchyrollEpisode {
  number: number;
  crunchyrollId: string;
  title: string | null;
  durationSec: number | null;
  availability: {
    provider: "crunchyroll";
    label: "Crunchyroll";
    url: string;
    embedUrl: null;
    langs: Array<"vf" | "vostfr" | "vost">;
    available: true;
    checkedAt: number;
  };
}

const ID = /^[A-Z0-9]{6,16}$/;

export function crunchyrollWatchUrl(id: string, slug: string | undefined, locale = "fr"): string {
  if (!ID.test(id)) throw new Error("Invalid Crunchyroll episode id");
  const safeSlug = (slug ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.crunchyroll.com/${locale}/watch/${id}${safeSlug ? `/${safeSlug}` : ""}`;
}

/** French dub is claimed only when the audio locale says so; subtitles alone mean VOSTFR when French is offered. */
export function crunchyrollLangs(episode: CrunchyrollEpisode): Array<"vf" | "vostfr" | "vost"> {
  const audio = episode.audio_locale?.toLowerCase();
  const subtitles = new Set((episode.subtitle_locales ?? []).map((locale) => locale.toLowerCase()));
  const langs: Array<"vf" | "vostfr" | "vost"> = [];
  if (audio?.startsWith("fr")) langs.push("vf");
  if (audio?.startsWith("ja") && subtitles.has("fr-fr")) langs.push("vostfr");
  else if (audio?.startsWith("ja") && subtitles.size) langs.push("vost");
  return langs;
}

export function mapCrunchyrollEpisodes(
  episodes: readonly CrunchyrollEpisode[],
  now = Math.floor(Date.now() / 1000),
): MappedCrunchyrollEpisode[] {
  const byNumber = new Map<number, MappedCrunchyrollEpisode>();
  for (const episode of episodes) {
    const number = episode.episode_number ?? episode.sequence_number;
    if (!ID.test(episode.id) || !Number.isSafeInteger(number) || (number as number) < 1) continue;
    // A dub and the Japanese original are separate Crunchyroll ids for one number: keep the original as the watch link.
    const original = episode.audio_locale?.toLowerCase().startsWith("ja") ?? true;
    const existing = byNumber.get(number as number);
    if (existing && !original) continue;
    byNumber.set(number as number, {
      number: number as number,
      crunchyrollId: episode.id,
      title: episode.title?.trim() || null,
      durationSec: episode.duration_ms ? Math.round(episode.duration_ms / 1000) : null,
      availability: {
        provider: "crunchyroll",
        label: "Crunchyroll",
        url: crunchyrollWatchUrl(episode.id, episode.slug_title),
        embedUrl: null,
        langs: crunchyrollLangs(episode),
        available: true,
        checkedAt: now,
      },
    });
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

// --- Resolver layer: Shenron episode rows <-> Crunchyroll ids and watch links -----------------------------------------

export interface ShenronEpisodeRow {
  id: number;
  series: string;
  number_in_series: number | null;
  title: string;
  availability?: Array<{
    provider?: string;
    url?: string;
    langs?: string[];
    available?: boolean;
    checkedAt?: number;
  }> | null;
}

export interface CrunchyrollOffer {
  episodeId: number;
  series: string;
  number: number | null;
  title: string;
  crunchyrollId: string;
  url: string;
  langs: string[];
  checkedAt: number | null;
}

const WATCH_ID = /\/watch\/([A-Z0-9]{6,16})(?:\/|$)/;

/** The Crunchyroll offer of a row, or null when it has none: only the stored, normalized watch URL is trusted. */
export function crunchyrollOffer(row: ShenronEpisodeRow): CrunchyrollOffer | null {
  const entry = row.availability?.find(
    (offer) => offer.provider === "crunchyroll" && offer.available !== false && offer.url,
  );
  const id = entry?.url && WATCH_ID.exec(new URL(entry.url).pathname)?.[1];
  if (!entry || !id || new URL(entry.url).hostname !== "www.crunchyroll.com") return null;
  return {
    episodeId: row.id,
    series: row.series,
    number: row.number_in_series,
    title: row.title,
    crunchyrollId: id,
    url: entry.url!,
    langs: entry.langs ?? [],
    checkedAt: entry.checkedAt ?? null,
  };
}

export interface ResolveQuery {
  episode?: number;
  series?: string;
  number?: number;
  crunchyroll?: string;
}

/** Resolves a Shenron episode (id, or series + number) or a Crunchyroll id to its offer. */
export function resolveCrunchyroll(
  rows: readonly ShenronEpisodeRow[],
  query: ResolveQuery,
): CrunchyrollOffer | null {
  const row = rows.find((candidate) => {
    if (query.episode !== undefined) return candidate.id === query.episode;
    if (query.series !== undefined && query.number !== undefined)
      return candidate.series === query.series && candidate.number_in_series === query.number;
    if (query.crunchyroll !== undefined)
      return crunchyrollOffer(candidate)?.crunchyrollId === query.crunchyroll;
    return false;
  });
  return row ? crunchyrollOffer(row) : null;
}

export function crunchyrollSeriesSummary(series: string, rows: readonly ShenronEpisodeRow[]) {
  const crunchyrollSeries = CRUNCHYROLL_SERIES_BY_SHENRON[series] ?? null;
  const offers = rows.filter((row) => row.series === series).map(crunchyrollOffer);
  const mapped = offers.filter((offer): offer is CrunchyrollOffer => offer !== null);
  return {
    series,
    crunchyrollSeries,
    crunchyrollUrl: crunchyrollSeries
      ? `https://www.crunchyroll.com/fr/series/${crunchyrollSeries}`
      : null,
    episodes: offers.length,
    mapped: mapped.length,
    offers: mapped,
  };
}
