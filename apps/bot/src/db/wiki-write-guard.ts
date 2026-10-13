/**
 * Garde d'écriture du wiki éditorial dans le SQLite LOCAL.
 *
 * PostgreSQL `bot.*` est la SOURCE DE VÉRITÉ du wiki éditorial ; le SQLite du bot
 * est un replica de lecture rafraîchi par le reverse-sync
 * `scripts/sync-neon-to-sqlite.ts` (logique : `src/db/replica-sync.ts`, timer
 * systemd toutes les 15 min). Tout seed/ingest qui écrit l'éditorial ICI serait
 * SILENCIEUSEMENT ÉCRASÉ au prochain pull → travail perdu + faux succès.
 *
 * Importer pour le side-effect EN TÊTE de tout script qui écrit les tables
 * éditoriales du SQLite : `import "~/db/wiki-write-guard";` (scripts) ou
 * `import "./wiki-write-guard";` (src/db).
 *
 * Exemptions (aucune autre) :
 * - le runtime du bot : il importe dynamiquement `runWikiSeed` pour l'auto-seed
 *   self-healing au boot (DB vide après perte de bot.db). On ne doit JAMAIS
 *   `process.exit(1)` dans ce cas (le top-level échappe au try/catch de
 *   l'auto-seed → crash-loop) ;
 * - le reverse-sync lui-même, seule voie légitime d'écriture du réplica hors du
 *   runtime : exemption nommée par chemin exact, une copie ou un homonyme
 *   ailleurs reste refusé.
 *
 * Override (risqué, perdu au prochain pull) : `ALLOW_SQLITE_WIKI_WRITE=1`.
 * Le seed/ingest éditorial doit désormais cibler PostgreSQL, pas ce replica.
 */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const entry = Bun.main ?? process.argv[1] ?? "";
// Exécutable `bun build --compile` (shenron-bot) : seul le runtime du bot y est compilé.
// Native standalone metadata is independent of a versioned runtime filename.
const isCompiled =
  typeof Bun.isStandaloneExecutable === "boolean"
    ? Bun.isStandaloneExecutable
    : import.meta.url.includes("$bunfs");
// Runtime du bot = src/index.ts ou src/entry-standalone.ts → exempté (auto-seed légitime, idempotent).
const isBotRuntime =
  isCompiled || /(?:^|[\\/])(?:src[\\/])?(?:index|entry-standalone)\.ts$/.test(entry);

/** Le reverse-sync PostgreSQL → SQLite, seul script autorisé à écrire le réplica éditorial. */
export const REPLICA_SYNC_SCRIPT = resolve(import.meta.dir, "../../scripts/sync-neon-to-sqlite.ts");

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

const isReplicaSync =
  !isCompiled && entry !== "" && canonicalPath(entry) === canonicalPath(REPLICA_SYNC_SCRIPT);

if (!isBotRuntime && !isReplicaSync && !Bun.env.ALLOW_SQLITE_WIKI_WRITE) {
  console.error(
    "✗ Wiki migré sur PostgreSQL (source de vérité). Ce script écrit le SQLite local,\n" +
      "  écrasé par le reverse-sync scripts/sync-neon-to-sqlite.ts. Seed/ingest éditorial\n" +
      "  doit cibler PostgreSQL. Override (risqué, perdu au prochain pull) : ALLOW_SQLITE_WIKI_WRITE=1.",
  );
  process.exit(1);
}
