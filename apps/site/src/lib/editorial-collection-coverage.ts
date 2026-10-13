// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { projectEditorialCoverage } from "./editorial-collections";

/** Uses the canonical DB owner; counts are references, never a playback or rights claim. */
export async function readEditorialCollectionCoverage(id?: string) {
  const [volumeRows, editionRows, databookRows, episodeRows] = await Promise.all([
    db.execute(
      sql`SELECT series,count(*)::int AS records FROM bot.db_manga_volumes GROUP BY series`,
    ),
    db.execute(sql`SELECT e.language,e.edition,w.series,count(v.id)::int AS volumes,
      coalesce(sum(v.page_count),0)::bigint AS declared_pages
      FROM bot.media_editions e JOIN bot.media_works w ON w.id=e.work_id
      LEFT JOIN bot.media_volumes v ON v.edition_id=e.id
      GROUP BY e.language,e.edition,w.series`),
    db.execute(sql`SELECT id,title,title_ja,
      coalesce(json_array_length(pages::json),0)::int AS readable_page_references
      FROM bot.db_databooks WHERE title ILIKE '%Sōshūhen%' OR title ILIKE '%Dragon Quest%'`),
    db.execute(sql`SELECT series,count(*)::int AS records FROM bot.db_episodes GROUP BY series`),
  ]);
  return projectEditorialCoverage({ volumeRows, editionRows, databookRows, episodeRows }, id);
}
