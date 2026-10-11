/**
 * Visibilité éditoriale du réplica SQLite du wiki (SH-P0-004).
 *
 * PostgreSQL `bot.*` est la source : une fiche se retire par `visible = false`,
 * jamais par DELETE. Le reverse-sync PostgreSQL → SQLite
 * (`scripts/sync-neon-to-sqlite.ts`, logique `./replica-sync.ts`) copie
 * l'intersection des colonnes des deux côtés, après avoir appelé
 * `ensureWikiReplicaSchema` puis `ensureWikiVisibility` : il fait donc descendre
 * les lignes masquées avec `visible = 0`. Tant que la table SQLite n'avait pas `visible`, la
 * ligne masquée descendait sans son drapeau et les routes historiques du bot,
 * le GraphQL et la couverture la servaient. Ce module garantit la colonne
 * (défaut 1, ajout idempotent) ; chaque lecture publique du réplica filtre
 * ensuite `visible = 1`, comme `/api/public/wiki/categories` côté PostgreSQL.
 */
import type { Database } from "bun:sqlite";
import { migrateEpisodeReplica } from "./migrations/0020_episode_replica";

/** Tables du réplica dont PostgreSQL porte la visibilité éditoriale. */
export const WIKI_VISIBILITY_TABLES = [
  "db_characters",
  "db_planets",
  "db_races",
  "db_techniques",
  "db_transformations",
  "db_sagas",
  "db_arcs",
  "db_movies",
  "db_games",
  "db_episodes",
  "db_manga_volumes",
  "db_manga_chapters",
  "db_tools",
] as const;

export type WikiVisibilityTable = (typeof WIKI_VISIBILITY_TABLES)[number];

/**
 * Ajoute `visible INTEGER NOT NULL DEFAULT 1` aux tables présentes qui ne
 * l'ont pas. Une table absente est ignorée (base neuve avant migrations).
 * Renvoie les tables modifiées.
 */
export function ensureWikiVisibility(sqlite: Database): WikiVisibilityTable[] {
  const added: WikiVisibilityTable[] = [];
  for (const table of WIKI_VISIBILITY_TABLES) {
    const columns = sqlite
      .query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)")
      .all(table);
    if (columns.length === 0 || columns.some((c) => c.name === "visible")) continue;
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN visible INTEGER NOT NULL DEFAULT 1`);
    added.push(table);
  }
  return added;
}

/**
 * Dérive entre les migrations SQL du bot et le schéma Drizzle (`schema.ts`) :
 * `db_episodes.video_url` et la table `db_tools` (avec `archived`, `pushed_at`,
 * `checked_at`) figurent dans le schéma, mais aucune migration SQL ne les crée.
 * Les bases existantes les ont (reverse-sync) ; une base neuve ne les avait pas,
 * et ses lectures publiques échouaient. Complément idempotent, appelé par `src/index.ts`
 * après les migrations (jamais avant : une base vide doit rester vide) et par le
 * reverse-sync (`./replica-sync.ts`) avant sa copie, qui refuse une base non migrée.
 */
export function ensureWikiReplicaSchema(sqlite: Database): void {
  migrateEpisodeReplica(sqlite);
  const columns = (table: string) =>
    sqlite
      .query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)")
      .all(table)
      .map((c) => c.name);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS db_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    author TEXT,
    language TEXT,
    category TEXT,
    target_game_id INTEGER,
    stars INTEGER DEFAULT 0,
    visible INTEGER DEFAULT true NOT NULL,
    archived INTEGER DEFAULT false NOT NULL,
    pushed_at INTEGER,
    checked_at INTEGER
  )`);
  for (const [table, column, type] of REPLICA_COLUMNS) {
    const present = columns(table);
    if (present.length > 0 && !present.includes(column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS db_tools_slug_unique ON db_tools (slug);
  CREATE INDEX IF NOT EXISTS idx_db_tools_game ON db_tools (target_game_id);`);
}

/** Colonnes du schéma Drizzle absentes des migrations SQL (`visible` a sa propre garantie). */
const REPLICA_COLUMNS = [
  ["db_episodes", "video_url", "TEXT"],
  ["db_tools", "target_game_id", "INTEGER"],
  ["db_tools", "stars", "INTEGER DEFAULT 0"],
  ["db_tools", "archived", "INTEGER DEFAULT false NOT NULL"],
  ["db_tools", "pushed_at", "INTEGER"],
  ["db_tools", "checked_at", "INTEGER"],
] as const;
