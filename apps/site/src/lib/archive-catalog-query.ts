// SPDX-License-Identifier: Apache-2.0
import { and, or, sql, type SQL } from "drizzle-orm";
import { selectArchiveEntries, type ArchiveFilters } from "./archive-catalog";
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
