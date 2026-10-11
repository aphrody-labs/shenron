import "server-only";
import type postgres from "postgres";
import { createDb, type ShenronDb } from "@aphrody/shenron-db/postgres-js";
import * as schema from "@aphrody/shenron-db/schema";

export {
  DEFAULT_POOL_MAX,
  POOL_MAX_CEILING,
  resolveDatabaseUrl,
  resolvePoolMax,
} from "@aphrody/shenron-db/config";

export const DB_APPLICATION_NAME = "shenron-site";

const globalForDb = globalThis as unknown as {
  pgClient?: postgres.Sql;
  pgDb?: ShenronDb;
};

function getOrCreateDb(): { client: postgres.Sql; db: ShenronDb } {
  if (!globalForDb.pgClient || !globalForDb.pgDb) {
    const created = createDb({ applicationName: DB_APPLICATION_NAME });
    globalForDb.pgClient = created.client;
    globalForDb.pgDb = created.db;
  }
  return { client: globalForDb.pgClient, db: globalForDb.pgDb };
}

export const db: ShenronDb = new Proxy({} as ShenronDb, {
  get(_target, prop, receiver) {
    const actual = getOrCreateDb().db;
    const value = Reflect.get(actual as any, prop, receiver);
    return typeof value === "function" ? value.bind(actual) : value;
  },
});

export { schema };

/** Gracefully drains the shared pool (scripts, tests, shutdown hooks). */
export async function closeDb(timeoutSeconds = 5): Promise<void> {
  if (!globalForDb.pgClient) return;
  const active = globalForDb.pgClient;
  globalForDb.pgClient = undefined;
  globalForDb.pgDb = undefined;
  await active.end({ timeout: timeoutSeconds });
}
