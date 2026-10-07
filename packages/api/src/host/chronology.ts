// SPDX-License-Identifier: Apache-2.0
/** Bun-native PostgreSQL lifecycle for chronology curation and media. */
import { envString, type EnvSource } from "@shenron/config/env";
import { createBunDb } from "@shenron/db/bun-sql";
import { createChronologyConfigRepository } from "@shenron/db/repos/chronology";
import type { ChronologyPort } from "../server";

export function createHostChronology(
  env: EnvSource,
): { port: ChronologyPort; close(): Promise<void> } | null {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  try {
    const { db, client } = createBunDb({ url, max: 2, applicationName: "shenron-chronology" });
    return {
      port: createChronologyConfigRepository(db),
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return null;
  }
}
