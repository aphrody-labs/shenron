// SPDX-License-Identifier: Apache-2.0
/**
 * URL PostgreSQL du site pour le bot et ses scripts, sans dépendance au runtime
 * (ni `~/lib/env`, qui exige les jetons Discord, ni tsyringe) : le reverse-sync
 * `scripts/sync-neon-to-sqlite.ts` la résout comme `PgService`.
 *
 * Résolution (`loadDatabaseUrl`, dernière ligne active gagnante) : `DATABASE_URL`
 * de l'environnement, puis le fichier systemd historique `SHENRON_PG_ENV` ou
 * `~/.shenron-neon.env` (conservé jusqu'à INFRA-3). L'URL n'est jamais journalisée.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { EnvSource } from "@shenron/db/config";
import { loadDatabaseUrl } from "@shenron/db/env";

/** Fichiers de repli de l'URL, dans l'ordre (le fichier systemd historique). */
export function pgFallbackFiles(env: EnvSource = process.env): { path: string }[] {
  return [{ path: env.SHENRON_PG_ENV?.trim() || join(homedir(), ".shenron-neon.env") }];
}

/** L'URL PostgreSQL du site pour le bot, ou `null` si la machine n'en a pas. */
export function resolveBotDatabaseUrl(env: EnvSource = process.env): string | null {
  const result = loadDatabaseUrl({ env, fallbackFiles: pgFallbackFiles(env) });
  return result.ok ? result.url : null;
}
