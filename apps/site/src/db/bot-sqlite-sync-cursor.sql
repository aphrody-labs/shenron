-- ============================================================================
-- Curseur de la synchronisation des journaux du bot — PostgreSQL du site.
--
-- Le bot recopie périodiquement ses journaux en ajout seul (`action_logs`,
-- `rag_eval_history`) vers le schéma `bot` (`apps/bot/src/services/ReplicaSyncService.ts`,
-- moteur `@aphrody/shenron-db/replica`). Pour chaque (source, table), ce curseur
-- retient le plus grand identifiant SQLite dont la ligne, et toutes les
-- précédentes, est déjà dans PostgreSQL : une passe ne relit que ce qui suit.
-- Ce n'est qu'un signet, pas la preuve : chaque ligne est vérifiée contre son
-- identifiant PostgreSQL stable (négatif, dérivé de la source et de la ligne)
-- avant d'être écrite, donc un curseur perdu coûte du temps, jamais un doublon.
--
-- Le bot crée cette table lui-même quand son rôle le peut ; sinon il l'attend
-- (journaux non recopiés, état toujours synchronisé) et le signale dans
-- `/api/health/monitoring`. Idempotent, additif, appliqué en une transaction :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f apps/site/src/db/bot-sqlite-sync-cursor.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot.sqlite_sync_cursor (
	source_id text NOT NULL,
	table_name text NOT NULL,
	last_id bigint NOT NULL,
	rows_synced bigint NOT NULL DEFAULT 0,
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (source_id, table_name)
);
