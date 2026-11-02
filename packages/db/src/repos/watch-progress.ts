import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { siteWatchProgress } from "../schema";
import type { ShenronPgDatabase } from "../types";

// oxlint-disable-next-line no-explicit-any -- accepts both PostgreSQL driver schemas
type WatchDatabase = ShenronPgDatabase<any>;

export const WATCH_PROGRESS_LIMIT = 200;

export interface WatchProgressRow {
  kind: "episode" | "movie";
  id: string;
  seconds: number;
  duration: number;
  completed: boolean;
  language: string | null;
  title: string;
  href: string;
  image: string | null;
  caption: string | null;
  at: number;
}

export function createWatchProgressRepository(db: WatchDatabase) {
  const t = siteWatchProgress;
  return {
    async list(userId: string): Promise<WatchProgressRow[]> {
      const rows = await db
        .select()
        .from(t)
        .where(eq(t.userId, userId))
        .orderBy(desc(t.updatedAtMs))
        .limit(WATCH_PROGRESS_LIMIT);
      return rows.map((r: typeof t.$inferSelect) => ({
        kind: r.kind as "episode" | "movie",
        id: r.itemId,
        seconds: r.seconds,
        duration: r.duration,
        completed: r.completed,
        language: r.language,
        title: r.title,
        href: r.href,
        image: r.image,
        caption: r.caption,
        at: r.updatedAtMs,
      }));
    },
    /** Upserts entries, keeping the newest `at` per item; returns the account's row count. */
    async save(userId: string, entries: WatchProgressRow[]): Promise<number> {
      for (const e of entries) {
        await db
          .insert(t)
          .values({
            userId,
            kind: e.kind,
            itemId: e.id,
            seconds: e.seconds,
            duration: e.duration,
            completed: e.completed,
            language: e.language ?? null,
            title: e.title,
            href: e.href,
            image: e.image ?? null,
            caption: e.caption ?? null,
            updatedAtMs: Math.floor(e.at),
          })
          .onConflictDoUpdate({
            target: [t.userId, t.kind, t.itemId],
            set: {
              seconds: sql`excluded."seconds"`,
              duration: sql`excluded."duration"`,
              completed: sql`excluded."completed"`,
              language: sql`excluded."language"`,
              title: sql`excluded."title"`,
              href: sql`excluded."href"`,
              image: sql`excluded."image"`,
              caption: sql`excluded."caption"`,
              updatedAtMs: sql`excluded."updatedAtMs"`,
            },
            setWhere: sql`excluded."updatedAtMs" > ${t.updatedAtMs}`,
          });
      }
      // Bound the account to its most recent items.
      await db.execute(sql`
        DELETE FROM site_watch_progress p
        WHERE p."userId" = ${userId}
          AND (p."kind", p."itemId") NOT IN (
            SELECT "kind", "itemId" FROM site_watch_progress
            WHERE "userId" = ${userId}
            ORDER BY "updatedAtMs" DESC
            LIMIT ${WATCH_PROGRESS_LIMIT}
          )`);
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(t)
        .where(eq(t.userId, userId));
      return row?.n ?? 0;
    },
    async remove(userId: string, items: Array<{ kind: string; id: string }>): Promise<number> {
      let removed = 0;
      for (const kind of new Set(items.map((i) => i.kind))) {
        const ids = items.filter((i) => i.kind === kind).map((i) => i.id);
        const gone = await db
          .delete(t)
          .where(and(eq(t.userId, userId), eq(t.kind, kind), inArray(t.itemId, ids)))
          .returning({ id: t.itemId });
        removed += gone.length;
      }
      return removed;
    },
  };
}
