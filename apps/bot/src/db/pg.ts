// SPDX-License-Identifier: Apache-2.0
/**
 * PostgreSQL du site, côté bot (B2) : un seul pool paresseux et nullable.
 *
 * Le bot doit démarrer sans PostgreSQL (le SQLite `data/bot.db` reste son
 * runtime) : `PgService.get()` renvoie `null` quand aucune URL n'est trouvée,
 * et chaque consommateur dégrade (menus d'épisodes muets, synchronisation des sources
 * refusée). Quand une URL existe, UN appel `createBunDb` (Bun.SQL, max 2,
 * `application_name = shenron-bot`) fournit à la fois Drizzle et le client
 * brut : le driver `drizzle-orm/bun-sql` ne modifie pas le client Bun.SQL
 * (contrairement au driver postgres-js), les gabarits `sql\`…\`` restent sûrs.
 *
 * Résolution de l'URL : `resolveBotDatabaseUrl` (`./pg-url`, partagé avec le
 * reverse-sync `scripts/sync-neon-to-sqlite.ts`).
 */
import type { SQL } from "bun";
import type { EnvSource } from "@aphrody/shenron-db/config";
import { createBunDb, type ShenronBunDb } from "@aphrody/shenron-db/bun-sql";
import { singleton } from "tsyringe";
import { logger } from "~/lib/logger";
import { resolveBotDatabaseUrl } from "./pg-url";

export { pgFallbackFiles, resolveBotDatabaseUrl } from "./pg-url";

export const BOT_PG_APPLICATION_NAME = "shenron-bot";
export const BOT_PG_POOL_MAX = 2;

export interface PgHandle {
  /** Client Bun.SQL brut (gabarits étiquetés), partagé avec Drizzle. */
  readonly sql: SQL;
  /** Drizzle (schéma public) sur le même pool. */
  readonly db: ShenronBunDb;
}

/** Construit le pool unique (aucune connexion avant la première requête). */
export function createPgHandle(url: string): PgHandle {
  const { client, db } = createBunDb({
    url,
    applicationName: BOT_PG_APPLICATION_NAME,
    max: BOT_PG_POOL_MAX,
  });
  return { sql: client, db };
}

@singleton()
export class PgService {
  private handle: PgHandle | null = null;
  private attempted = false;
  private env: EnvSource = process.env;
  private createHandle: (url: string) => PgHandle = createPgHandle;

  /** Instance hors conteneur DI avec un environnement explicite (tests, scripts). */
  static withEnv(env: EnvSource, createHandle?: (url: string) => PgHandle): PgService {
    const service = new PgService();
    service.env = env;
    if (createHandle) service.createHandle = createHandle;
    return service;
  }

  /** Le pool partagé, créé au premier appel ; `null` sans PostgreSQL configuré. */
  get(): PgHandle | null {
    if (this.handle || this.attempted) return this.handle;
    this.attempted = true;
    // Même contrat que sans URL : un fichier de repli illisible ou une URL
    // refusée par Bun.SQL ne doit pas faire tomber le démarrage du bot. On
    // journalise (sans l'URL, qui porte le mot de passe) et on dégrade à null ;
    // `attempted` évite de retenter et de spammer le journal à chaque appel.
    try {
      const url = resolveBotDatabaseUrl(this.env);
      if (!url) return null;
      this.handle = this.createHandle(url);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[pg] PostgreSQL du site indisponible, fonctions dépendantes désactivées",
      );
      this.handle = null;
    }
    return this.handle;
  }

  /** Ferme le pool (arrêt du process, tests). */
  async close(timeoutSeconds = 5): Promise<void> {
    const h = this.handle;
    this.handle = null;
    this.attempted = false;
    if (h) await h.sql.close({ timeout: timeoutSeconds });
  }
}
