// SPDX-License-Identifier: Apache-2.0
/** Bun-native PostgreSQL lifecycle for page and series banners. */
import { createDefaultPageBanners } from "@aphrody/shenron-config/page-banners";
import { resolveApiUrl } from "@aphrody/shenron-config/public-urls";
import { envString, type EnvSource } from "@aphrody/shenron-config/env";
import { createBunDb } from "@aphrody/shenron-db/bun-sql";
import { createPageBannersConfigRepository } from "@aphrody/shenron-db/repos/page-banners";
import type { PageBannersPort } from "../server";

export function createHostPageBanners(
  env: EnvSource,
): { port: PageBannersPort; close(): Promise<void> } | null {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  try {
    const { db, client } = createBunDb({ url, max: 2, applicationName: "shenron-page-banners" });
    return {
      port: {
        ...createPageBannersConfigRepository(db),
        defaults: createDefaultPageBanners(resolveApiUrl(env)),
      },
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return null;
  }
}
