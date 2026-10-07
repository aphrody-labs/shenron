// SPDX-License-Identifier: Apache-2.0
/** Bun-native PostgreSQL lifecycle for the home configuration. */
import { envString, type EnvSource } from "@shenron/config/env";
import { createBunDb } from "@shenron/db/bun-sql";
import { createHomeConfigRepository } from "@shenron/db/repos/home";
import type { HomeConfigPort } from "../server";

export function createHostHome(
  env: EnvSource,
): { port: HomeConfigPort; close(): Promise<void> } | null {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  try {
    const { db, client } = createBunDb({ url, max: 2, applicationName: "shenron-home" });
    return {
      port: createHomeConfigRepository(db),
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return null;
  }
}
