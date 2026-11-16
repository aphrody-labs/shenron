import { eq, sql } from "drizzle-orm";
import type { Favorite } from "@shenron/config/favorites";
import { userPreferences } from "../schema";
import type { ShenronPgDatabase } from "../types";

// oxlint-disable-next-line no-explicit-any -- accepts both PostgreSQL driver schemas
type PreferencesDatabase = ShenronPgDatabase<any>;
export function createFavoritesRepository(db: PreferencesDatabase) {
  return {
    async read(userId: string): Promise<unknown> {
      const [row] = await db
        .select({ prefs: userPreferences.prefs })
        .from(userPreferences)
        .where(eq(userPreferences.identity, `u:${userId}`))
        .limit(1);
      return row?.prefs?.favorites ?? [];
    },
    async save(userId: string, favorites: Favorite[]): Promise<void> {
      const prefs = sql`${JSON.stringify({ favorites })}::text::jsonb`;
      await db
        .insert(userPreferences)
        .values({ identity: `u:${userId}`, userId, prefs })
        .onConflictDoUpdate({
          target: userPreferences.identity,
          set: {
            prefs: sql`coalesce(${userPreferences.prefs}, '{}'::jsonb) || ${prefs}`,
            userId,
            updatedAt: new Date(),
          },
        });
    },
  };
}
