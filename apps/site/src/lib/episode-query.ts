// SPDX-License-Identifier: Apache-2.0
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { escapeLike } from "@aphrody/shenron-db/repos/wiki";
import { botEpisodes } from "@/db/bot-schema";

/** One predicate for catalogue rows and their count, before pagination. */
export function episodeQueryPredicate(series?: string, query?: string) {
  const needle = query?.trim();
  const pattern = needle ? `%${escapeLike(needle)}%` : undefined;
  return and(
    eq(botEpisodes.visible, true),
    series ? eq(botEpisodes.series, series) : undefined,
    pattern
      ? or(
          ilike(botEpisodes.title, pattern),
          ilike(botEpisodes.titleJa, pattern),
          ilike(sql`coalesce(${botEpisodes.synopsisFr}, ${botEpisodes.synopsis})`, pattern),
        )
      : undefined,
  );
}
