/**
 * Lectures publiques en SQL brut du réplica wiki du bot (`/api/public/wiki/episodes`,
 * `/api/public/wiki/search`, `/api/public/data/coverage`).
 *
 * Suppression logique (SH-P0-004) : chaque requête filtre `visible = 1`
 * (colonne garantie par `db/wiki-visibility`) et le drapeau n'est jamais rendu.
 */
import type { Database } from "bun:sqlite";
import { WIKI_VISIBILITY_TABLES } from "~/db/wiki-visibility";

type Row = Record<string, unknown>;

/** Retire le drapeau éditorial d'une ligne `SELECT *` déjà filtrée. */
function withoutVisible(row: Row): Row {
  const { visible: _visible, ...rest } = row;
  return rest;
}

export interface EpisodesPage {
  episodes: Row[];
  total: number;
  limit: number;
  offset: number;
}

/** Page d'épisodes visibles, triée par série puis numéro. */
export function listVisibleEpisodes(
  sqlite: Database,
  o: { series: string | null; limit: number; offset: number },
): EpisodesPage {
  const where = o.series ? "WHERE visible = 1 AND series = ?" : "WHERE visible = 1";
  const order = o.series ? "number_in_series" : "series, number_in_series";
  const filter = o.series ? [o.series] : [];
  const episodes = sqlite
    .query<Row, (string | number)[]>(
      `SELECT * FROM db_episodes ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    )
    .all(...filter, o.limit, o.offset)
    .map(withoutVisible);
  const total =
    sqlite
      .query<{ n: number }, string[]>(`SELECT COUNT(*) AS n FROM db_episodes ${where}`)
      .get(...filter)?.n ?? 0;
  return { episodes, total, limit: o.limit, offset: o.offset };
}

/** Recherche transverse (LIKE) sur les entités visibles du réplica. */
export function searchVisibleWiki(sqlite: Database, q: string) {
  const like = `%${q}%`;
  const all = (sql: string, n: number) =>
    sqlite.query<Row, string[]>(sql).all(...Array.from({ length: n }, () => like));
  return {
    q,
    characters: all(
      "SELECT id, name, name_ja, image, race FROM db_characters WHERE visible = 1 AND (name LIKE ? OR name_ja LIKE ? OR name_romaji LIKE ?) LIMIT 20",
      3,
    ),
    planets: all(
      "SELECT id, name, name_ja, image FROM db_planets WHERE visible = 1 AND (name LIKE ? OR name_ja LIKE ?) LIMIT 10",
      2,
    ),
    sagas: all(
      "SELECT id, slug, name, name_ja, series FROM db_sagas WHERE visible = 1 AND (name LIKE ? OR name_ja LIKE ?) LIMIT 10",
      2,
    ),
    movies: all(
      "SELECT id, slug, title, title_ja, series FROM db_movies WHERE visible = 1 AND (title LIKE ? OR title_ja LIKE ?) LIMIT 10",
      2,
    ),
    games: all(
      "SELECT id, slug, title, title_ja FROM db_games WHERE visible = 1 AND (title LIKE ? OR title_ja LIKE ?) LIMIT 10",
      2,
    ),
    // Techniques, transformations and races are wiki entities too:
    // without them `q=kamehameha` matched nothing.
    techniques: all(
      "SELECT id, slug, name, name_ja, type FROM db_techniques WHERE visible = 1 AND (name LIKE ? OR name_ja LIKE ? OR name_romaji LIKE ? OR slug LIKE ?) LIMIT 10",
      4,
    ),
    transformations: all(
      "SELECT id, name, image, character_id FROM db_transformations WHERE visible = 1 AND name LIKE ? LIMIT 10",
      1,
    ),
    races: all(
      "SELECT id, slug, name, name_ja FROM db_races WHERE visible = 1 AND (name LIKE ? OR name_ja LIKE ? OR slug LIKE ?) LIMIT 10",
      3,
    ),
  };
}

/**
 * Volume visible de chaque table wiki du réplica (`null` = table absente).
 * Une seule requête UNION ALL ; une table absente ne fait pas échouer la route.
 */
export function countVisibleWiki(sqlite: Database): Record<string, number | null> {
  const present = new Set(
    sqlite
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all()
      .map((r) => r.name),
  );
  const wiki: Record<string, number | null> = {};
  for (const t of WIKI_VISIBILITY_TABLES) wiki[t] = null;
  const usable = WIKI_VISIBILITY_TABLES.filter((t) => present.has(t));
  if (usable.length === 0) return wiki;
  const rows = sqlite
    .query<{ table_name: string; n: number }, []>(
      usable
        .map((t) => `SELECT '${t}' AS table_name, count(*) AS n FROM ${t} WHERE visible = 1`)
        .join(" UNION ALL "),
    )
    .all();
  for (const row of rows) wiki[row.table_name] = row.n;
  return wiki;
}
