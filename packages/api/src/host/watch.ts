import { envString, type EnvSource } from "@shenron/config/env";
import { createBunDb } from "@shenron/db/bun-sql";
import { createWatchProgressRepository } from "@shenron/db/repos/watch-progress";
import type { WatchPort } from "../server";

export function createHostWatch(
  env: EnvSource,
): { port: WatchPort; close(): Promise<void> } | null {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  try {
    const { db, client } = createBunDb({ url, max: 2, applicationName: "shenron-watch" });
    return {
      port: createWatchProgressRepository(db),
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return null;
  }
}
