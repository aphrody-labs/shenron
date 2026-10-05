// SPDX-License-Identifier: Apache-2.0
import "server-only";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import { getLaunchConfig } from "@/lib/wiki-launch-config";

/**
 * Instantané d'ouverture des rubriques, à passer aux cartes et grilles client
 * (`ClientGatedWrap`). Configuration illisible → `null` : les liens restent
 * rendus, mieux vaut une redirection qu'un wiki figé parce que PostgreSQL a
 * hoqueté (même règle que `GatedLink`).
 */
export async function wikiAccess(): Promise<AccessSnapshot | null> {
  const cfg = await getLaunchConfig().catch(() => null);
  return cfg ? { openKeys: cfg.openKeys, access: cfg.access } : null;
}
