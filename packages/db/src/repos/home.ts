// SPDX-License-Identifier: Apache-2.0
import { eq, sql } from "drizzle-orm";
import type { HomeConfig } from "@aphrody/shenron-config/home";
import { homeConfig } from "../schema";
import type { ShenronPgDatabase } from "../types";

// oxlint-disable-next-line no-explicit-any -- accepts both PostgreSQL driver schemas
type HomeDatabase = ShenronPgDatabase<any>;
const SINGLETON_ID = "default";

export function createHomeConfigRepository(db: HomeDatabase) {
  return {
    async read(): Promise<unknown> {
      const [row] = await db
        .select({ data: homeConfig.data })
        .from(homeConfig)
        .where(eq(homeConfig.id, SINGLETON_ID))
        .limit(1);
      return row?.data ?? null;
    },
    async save(config: HomeConfig, by: string | null): Promise<void> {
      // Bind JSON as text first: Bun.SQL otherwise encodes Drizzle's JSON string again.
      const data = sql`${JSON.stringify(config)}::text::jsonb`;
      const updatedAt = new Date();
      await db
        .insert(homeConfig)
        .values({ id: SINGLETON_ID, data, updatedBy: by, updatedAt })
        .onConflictDoUpdate({ target: homeConfig.id, set: { data, updatedBy: by, updatedAt } });
    },
  };
}
