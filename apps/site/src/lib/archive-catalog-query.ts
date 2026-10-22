// SPDX-License-Identifier: Apache-2.0
import { and, or, sql, type SQL } from "drizzle-orm";
import { selectArchiveEntries, type ArchiveFilters } from "./archive-catalog";
// Canonical Dragon Ball order for the default listing; unknown series sort last.
export const ARCHIVE_SERIES_ORDER = ["db", "z", "gt", "super", "daima", "heroes", "games", "mixed"];

export function archiveSeriesRank(category: string): SQL {
  const entries = selectArchiveEntries(category);
  if (!entries.length) return sql`0`;
  const branches = entries.map(
    (item) =>
      sql`when r.url = ${item.url} and r.title = ${item.recordTitle} then ${
        ARCHIVE_SERIES_ORDER.indexOf(item.series) === -1
          ? ARCHIVE_SERIES_ORDER.length
          : ARCHIVE_SERIES_ORDER.indexOf(item.series)
      }`,
  );
  return sql`case ${sql.join(branches, sql` `)} else ${ARCHIVE_SERIES_ORDER.length} end`;
}

export function archiveFilter(category: string, filters: ArchiveFilters = {}): SQL {
  const entries = selectArchiveEntries(category, filters);
  return and(
    sql`r.http_status between 200 and 299`,
    sql`p.provenance->'reviewed' = 'true'::jsonb`,
    sql`p.provenance->'rights'->'publicImagesPermitted' = 'true'::jsonb`,
    entries.length
      ? or(...entries.map((item) => sql`(r.url = ${item.url} and r.title = ${item.recordTitle})`))
      : sql`false`,
  )!;
}
