<!-- SPDX-License-Identifier: Apache-2.0 -->

# Parité des bases PostgreSQL et SQLite

Contrôles de cohérence entre les schémas du dépôt, la base PostgreSQL de production
(`shenron_site`) et le SQLite du bot (`bot.db`). Dernier passage complet : 2026-10-30.

## Commandes

- `bun run --filter @aphrody/shenron-db audit:migrations` : le dossier des migrations correspond à
  l'instantané `packages/db/migration-audit.snapshot.json` (`--write` après toute nouvelle migration).
- `DATABASE_URL=… bun run --filter @aphrody/shenron-db audit:schema` : écarts entre les schémas
  Drizzle et la base réelle (tables, colonnes, types, `NOT NULL`, colonnes présentes seulement en
  base). Lecture seule ; code 1 au moindre écart.
- `shenron-bot --replica-sync --dry-run` (dans le conteneur du bot) puis `--manga-search --dry-run` :
  écart entre PostgreSQL et le réplica SQLite, tel que le projet le définit.
- SQLite : `PRAGMA integrity_check` et `PRAGMA foreign_key_check` en lecture seule (`?mode=ro`).

## Corrigé le 2026-10-30

Une sauvegarde complète précède les changements
(`/srv/shenron/deploy-backups/pg-shenron_site-pre-schema-fix-20261030.dump`).

- Migration 0026 jamais appliquée : les quatre tables `CardCatalog*` manquaient.
- Migration 0027 : `url_redirects.visible` et son index partiel, l'index de `db_media_publications`,
  `dragonballcn_volumes.isbn`. Index de `bot-indexes.sql` manquants sur `db_manga_pages` (unique
  `series, tome, planche` et GIN trigramme), appliqués après vérification qu'aucun doublon n'existait.
- Migration 0028 : 17 colonnes `jsonb` créées en `text` (`chronology.ts` attendait de vrais
  tableaux), 6 booléens créés en `bigint`, 54 colonnes `NOT NULL` déclarées mais nullables.
- `bot-schema.ts` aligné sur la base : colonnes de santé des lecteurs et des flux de
  `db_episodes`/`db_movies`, `official_metadata`, colonnes d'article de trois tables ;
  `db_tournaments.saga` et `db_voice_actors.biography` deviennent nullables (une valeur inconnue
  existe, aucun contenu n'est inventé).
- `bot.db_assets` 799 à 802 : sources `unknown`, `moi`, `mrsatantierlist` absentes de `db_sources`
  (violation de clé étrangère côté SQLite). Rattachées à la source `editor-upload`, l'étiquette
  déclarée est conservée dans l'attribution.

## Constaté et laissé volontairement

- 12 noms de personnages en double : chaque paire est un enregistrement visible et son doublon
  masqué (fusion éditoriale par suppression logique). Le réplica SQLite ignore la copie masquée.
- 12 tables du wiki (`db_battles`, `db_items`, `db_locations`…) n'existent que dans PostgreSQL :
  le réplica les marque `skipped`, par conception.
- 394 pages manga de PostgreSQL ne sont pas publiques : le SQLite en porte 12 199, exactement
  l'instantané public.
- Identifiants `user_id` sans ligne dans `bot.users` : identifiants de test (`admin-test-user`,
  `claude`) et membres Discord absents de la table. Aucune ligne n'est créée, XP et zeni seraient
  inventés.
- `source_id` libres de `db_news`, `discord_user_profiles`, `sqlite_runtime_*` : slugs de flux, pas
  des références à `db_sources`.
- Tables `backup_*` et `pre_restore_20261030_*` : copies de sécurité sans clé primaire, à purger par
  leur propriétaire après vérification.
