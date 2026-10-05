/**
 * Liste des tables du **wiki éditorial** dont PostgreSQL `bot.*` est la SOURCE DE
 * VÉRITÉ (édité par le site via Server Actions). Module sans side-effect, lu par
 * le reverse-sync `sync-neon-to-sqlite.ts` (PostgreSQL → SQLite, logique dans
 * `src/db/replica-sync.ts`), qui rafraîchit ces tables dans le réplica du bot.
 * L'ancien forward-sync SQLite → PostgreSQL (`sync-sqlite-to-neon.ts`), qui les
 * excluait, ne fait plus partie du dépôt. Elle doit couvrir
 * `WIKI_VISIBILITY_TABLES` (`src/db/wiki-visibility.ts`) : le reverse-sync le vérifie.
 *
 * `db_news` n'en fait PAS partie (écrite par le bot en runtime).
 */
export const WIKI_EDITORIAL = [
  "media_works",
  "media_editions",
  "media_volumes",
  "media_chapters",
  "media_page_assets",
  "media_page_refs",
  "narrative_timelines",
  "narrative_events",
  "narrative_event_aliases",
  "narrative_event_participants",
  "narrative_event_relations",
  "contributors",
  "contributor_credits",
  "db_media_publications",
  "db_characters",
  "db_planets",
  "db_transformations",
  "db_races",
  "db_techniques",
  "db_character_techniques",
  "db_sagas",
  "db_arcs",
  "db_episodes",
  "db_manga_volumes",
  "db_manga_chapters",
  "db_movies",
  "db_games",
  "db_game_characters",
  "db_tools",
  "db_sources",
  "db_licenses",
  "db_assets",
  // Piliers encyclopédiques : créés et enrichis directement dans PG
  // (scripts/ops/create-mega-data-tables.ts, enrich-lore-batch.ts). Mirrorés
  // SQLite→Neon, ils étaient DROP puis recréés toutes les 30 min avec `visible`
  // en bigint, ce qui cassait les requêtes booléennes du site et écrasait toute
  // édition faite dans PG.
  "db_battles",
  "db_items",
  "db_dragons",
  "db_wishes",
  "db_timeline_events",
  "db_power_levels",
  "db_locations",
  "db_tournaments",
  "db_voice_actors",
  "db_soundtracks",
] as const;
