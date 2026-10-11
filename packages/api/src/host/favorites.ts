import { envString, type EnvSource } from "@aphrody/shenron-config/env";
import { createBunDb } from "@aphrody/shenron-db/bun-sql";
import { createFavoritesRepository } from "@aphrody/shenron-db/repos/favorites";
import type { FavoritesPort } from "../server";

export function createHostFavorites(
  env: EnvSource,
): { port: FavoritesPort; close(): Promise<void> } | null {
  const url = envString(env, "DATABASE_URL");
  if (!url) return null;
  try {
    const { db, client } = createBunDb({ url, max: 2, applicationName: "shenron-favorites" });
    return {
      port: createFavoritesRepository(db),
      close: async () => {
        await client.close();
      },
    };
  } catch {
    return null;
  }
}
