/**
 * Visibilité éditoriale du réplica SQLite du wiki (SH-P0-004).
 *
 * PostgreSQL `bot.*` est la source : une fiche se retire par `visible = false`,
 * jamais par DELETE. Le reverse-sync Neon→SQLite copie l'intersection des
 * colonnes des deux côtés : tant que la table SQLite n'avait pas `visible`, la
 * ligne masquée descendait sans son drapeau et les routes historiques du bot,
 * le GraphQL et la couverture la servaient. Ce module garantit la colonne
 * (défaut 1, ajout idempotent) ; chaque lecture publique du réplica filtre
 * ensuite `visible = 1`, comme `/api/public/wiki/categories` côté PostgreSQL.
 */
import type { Database } from "bun:sqlite";

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
