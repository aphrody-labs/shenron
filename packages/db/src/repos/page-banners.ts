// SPDX-License-Identifier: Apache-2.0
import { eq, sql } from "drizzle-orm";
import type { PageBannersConfig } from "@aphrody/shenron-config/page-banners";
import { pageBanners } from "../schema";
import type { ShenronPgDatabase } from "../types";

// oxlint-disable-next-line no-explicit-any -- accepts both PostgreSQL driver schemas
type BannersDatabase = ShenronPgDatabase<any>;
const SINGLETON_ID = "default";

export function createPageBannersConfigRepository(db: BannersDatabase) {
  return {
    async read(): Promise<unknown> {
      const [row] = await db
        .select({ data: pageBanners.data })
        .from(pageBanners)
        .where(eq(pageBanners.id, SINGLETON_ID))
        .limit(1);
      return row?.data ?? null;
    },
    async save(config: PageBannersConfig, by: string | null): Promise<void> {
      // Bind JSON as text first: Bun.SQL otherwise encodes Drizzle's JSON string again.
      const data = sql`${JSON.stringify(config)}::text::jsonb`;
      const updatedAt = new Date();
      await db
        .insert(pageBanners)
        .values({ id: SINGLETON_ID, data, updatedBy: by, updatedAt })
        .onConflictDoUpdate({ target: pageBanners.id, set: { data, updatedBy: by, updatedAt } });
    },
  };
}
