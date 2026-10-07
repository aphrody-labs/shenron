// SPDX-License-Identifier: Apache-2.0
import { envString, type EnvSource } from "@shenron/config/env";
import { createBunDb } from "@shenron/db/bun-sql";
import { createWikiLaunchRepository } from "@shenron/db/repos/wiki-launch";
import type { WikiLaunchPort } from "../server";

export function createHostWikiLaunch(
  env: EnvSource,
): { port: WikiLaunchPort; close(): Promise<void> } | null {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  try {
    const { db, client } = createBunDb({ url, max: 2, applicationName: "shenron-wiki-launch" });
    return {
      port: createWikiLaunchRepository(db),
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return null;
  }
}
