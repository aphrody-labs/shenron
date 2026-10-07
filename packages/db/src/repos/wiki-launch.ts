// SPDX-License-Identifier: Apache-2.0
import { eq, sql } from "drizzle-orm";
import {
  DEFAULT_LAUNCH_CONFIG,
  resolveLaunchConfig,
  type LaunchConfig,
} from "@shenron/config/wiki-launch-config";
import { wikiLaunch } from "../schema";
import type { ShenronPgDatabase } from "../types";

// oxlint-disable-next-line no-explicit-any -- accepts both PostgreSQL driver schemas
type LaunchDatabase = ShenronPgDatabase<any>;
const SINGLETON_ID = "default";
const jsonData = (data: LaunchConfig) => sql`${JSON.stringify(data)}::text::jsonb`;

export function createWikiLaunchRepository(db: LaunchDatabase) {
  return {
    async read(): Promise<LaunchConfig> {
      const [row] = await db
        .select({ data: wikiLaunch.data })
        .from(wikiLaunch)
        .where(eq(wikiLaunch.id, SINGLETON_ID))
        .limit(1);
      return row ? resolveLaunchConfig(row.data) : structuredClone(DEFAULT_LAUNCH_CONFIG);
    },
    async save(patch: Partial<LaunchConfig>, by: string | null): Promise<LaunchConfig> {
      return db.transaction(async (tx) => {
        // Create the singleton before locking it, including concurrent first writes.
        await tx
          .insert(wikiLaunch)
          .values({ id: SINGLETON_ID, data: jsonData(DEFAULT_LAUNCH_CONFIG) })
          .onConflictDoNothing();
        const [row] = await tx
          .select({ data: wikiLaunch.data })
          .from(wikiLaunch)
          .where(eq(wikiLaunch.id, SINGLETON_ID))
          .for("update");
        const current = resolveLaunchConfig(row!.data);
        const config = resolveLaunchConfig({
          openKeys: patch.openKeys ?? current.openKeys,
          order: patch.order ?? current.order,
          access: patch.access ?? current.access,
        });
        await tx
          .update(wikiLaunch)
          .set({ data: jsonData(config), updatedBy: by, updatedAt: new Date() })
          .where(eq(wikiLaunch.id, SINGLETON_ID));
        return config;
      });
    },
  };
}
