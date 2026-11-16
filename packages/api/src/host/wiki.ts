// SPDX-License-Identifier: Apache-2.0
import { envString, type EnvSource } from "@shenron/config/env";
import { createBunDb } from "@shenron/db/bun-sql";
import { createWikiReadRepository } from "@shenron/db/repos/wiki";
import type { WikiReadPort } from "../server";

export function createHostWikiRead(
  env: EnvSource,
): { port: WikiReadPort; close(): Promise<void> } | null {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  try {
    const { db, client } = createBunDb({ url, max: 4, applicationName: "shenron-wiki-read" });
    return {
      port: createWikiReadRepository(db) as WikiReadPort,
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return null;
  }
}
