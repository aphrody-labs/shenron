// SPDX-License-Identifier: Apache-2.0
/** Version de `shenron-server`, lue dans son `package.json` (embarqué par `bun build --compile`). */
import manifest from "../package.json" with { type: "json" };

export const VERSION: string = manifest.version;

/**
 * Identifiant court (8 caractères) de la release en cours, lu dans `SHENRON_RELEASE` (variable
 * d'image/de build) ou à défaut `SHENRON_REVISION` (déjà posée par le compose de prod). Seul un
 * SHA hexadécimal est accepté : une valeur d'un autre format n'est jamais exposée.
 */
export function releaseId(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.SHENRON_RELEASE ?? env.SHENRON_REVISION ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(raw) ? raw.slice(0, 8).toLowerCase() : null;
}
