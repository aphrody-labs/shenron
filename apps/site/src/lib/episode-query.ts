// SPDX-License-Identifier: Apache-2.0
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { escapeLike } from "@aphrody/shenron-db/repos/wiki";
import { botEpisodes } from "@/db/bot-schema";
import {
  normalizeVideoLanguage,
  type VideoLanguage,
} from "@aphrody/shenron-media/episode-playback";

export class EpisodeLanguageQueryError extends Error {
  constructor() {
    super("mediaLang must be vf, vostfr or vost");
  }
}

/** Exact metadata tags: uppercase and VO aliases are intentionally unsupported. */
export function episodeLanguageQuery(value: string | null | undefined): VideoLanguage | undefined {
  if (value === null || value === undefined) return undefined;
  const language = normalizeVideoLanguage(value);
  if (!language) throw new EpisodeLanguageQueryError();
  return language;
}

/** Detail and transport resolve the same publicly visible episode. */
export function episodeIdentityPredicate(id: number) {
  return and(eq(botEpisodes.id, id), eq(botEpisodes.visible, true));
}

/** One predicate for catalogue rows and their count, before pagination. */
export function episodeQueryPredicate(series?: string, query?: string, mediaLang?: VideoLanguage) {
  const needle = query?.trim();
  const pattern = needle ? `%${escapeLike(needle)}%` : undefined;
  return and(
    eq(botEpisodes.visible, true),
    series ? eq(botEpisodes.series, series) : undefined,
    // JSONB containment tolerates absent/malformed historical containers and only
    // matches an explicitly tagged player. Offers and subtitles are independent.
    mediaLang
      ? sql`${botEpisodes.players} @> ${JSON.stringify([{ lang: mediaLang }])}::jsonb`
      : undefined,
    pattern
      ? or(
          ilike(botEpisodes.title, pattern),
          ilike(botEpisodes.titleJa, pattern),
          ilike(botEpisodes.titleRomaji, pattern),
          ilike(sql`coalesce(${botEpisodes.synopsisFr}, ${botEpisodes.synopsis})`, pattern),
        )
      : undefined,
  );
}
