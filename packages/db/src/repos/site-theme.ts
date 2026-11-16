// SPDX-License-Identifier: Apache-2.0
import { eq, sql } from "drizzle-orm";
import type { SiteTheme } from "@shenron/config/site-theme";
import { siteTheme } from "../schema";
import type { ShenronPgDatabase } from "../types";

// oxlint-disable-next-line no-explicit-any -- accepts both PostgreSQL driver schemas
type ThemeDatabase = ShenronPgDatabase<any>;
const SINGLETON_ID = "default";

export function createSiteThemeRepository(db: ThemeDatabase) {
  return {
    async read(): Promise<unknown> {
      const [row] = await db
        .select({ data: siteTheme.data })
        .from(siteTheme)
        .where(eq(siteTheme.id, SINGLETON_ID))
        .limit(1);
      return row?.data ?? null;
    },
    async save(theme: SiteTheme, by: string | null): Promise<void> {
      // Bind JSON as text first: Bun.SQL otherwise encodes Drizzle's JSON string again.
      const data = sql`${JSON.stringify(theme)}::text::jsonb`;
      const updatedAt = new Date();
      await db
        .insert(siteTheme)
        .values({ id: SINGLETON_ID, data, updatedBy: by, updatedAt })
        .onConflictDoUpdate({ target: siteTheme.id, set: { data, updatedBy: by, updatedAt } });
    },
  };
}
