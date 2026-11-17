// SPDX-License-Identifier: Apache-2.0
/** Bun-native PostgreSQL lifecycle for the site's palette. */
import { envString, type EnvSource } from "@aphrody/shenron-config/env";
import { createBunDb } from "@aphrody/shenron-db/bun-sql";
import { createSiteThemeRepository } from "@aphrody/shenron-db/repos/site-theme";
import type { SiteThemePort } from "../server";

export function createHostSiteTheme(
  env: EnvSource,
): { port: SiteThemePort; close(): Promise<void> } | null {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  try {
    const { db, client } = createBunDb({ url, max: 2, applicationName: "shenron-site-theme" });
    return {
      port: createSiteThemeRepository(db),
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return null;
  }
}
