<!-- SPDX-License-Identifier: Apache-2.0 -->

# Réplica PostgreSQL de l'état du bot

Le SQLite du bot (`bot.db`, `DATABASE_PATH`) est la source de l'état d'exécution : XP, zéni,
inventaire, modération, économie. Le schéma PostgreSQL `bot` n'en est qu'un réplica, mis à jour
**à la main** par `scripts/ops/sync-bot-runtime-sqlite-to-postgres.ts`. Aucun timer, `justfile`,
fichier `deploy/` ni autre document ne le lance : sans exécution, le réplica reste figé.

## Ce que le script copie

| Famille      | Tables                                                                                                                                                                                                                                                                                                                                                                                          | Règle                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **journaux** | `action_logs`, `rag_eval_history`                                                                                                                                                                                                                                                                                                                                                               | ajout seul, identifiants négatifs dérivés de `--source-id` et de la ligne, jamais de suppression, comme avant |
| **état**     | `users`, `inventory`, `shop_items`, `achievements`, `achievement_triggers`, `fusions`, `warns`, `bans`, `tickets`, `vocal_tempo*`, `giveaways`, `giveaway_entries`, `level_rewards`, `race_level_roles`, `guild_settings`, `message_templates`, `command_permissions`, `card_themes`, `economy_flags`, `economy_index`, `ursaf_notices`, `discord_members`, `discord_roles`, `discord_channels` | miroir par clé primaire : insertion, mise à jour, **suppression** des lignes disparues du SQLite              |

La liste de référence est `BOT_STATE_REPLICA_TABLES` dans `packages/db/src/bot-schema.ts`. Hors
périmètre, parce qu'un autre propriétaire les écrit : `jails`, `dm_contacts`, `dm_messages`
(`sync-bot-private-sqlite-to-postgres.ts`, identifiants négatifs : les recopier par identifiant
brut supprimerait ses lignes), `discord_user_profiles`
(`sync-discord-profiles-sqlite-to-postgres.ts`), le wiki éditorial (PostgreSQL est la source, le
reverse-sync descend vers SQLite), `ba_*` (authentification, ne quitte jamais le SQLite),
`invites_log` et les tables du cockpit admin (propriété PostgreSQL non tranchée).

## Comment l'état est recopié

- Les colonnes PostgreSQL sont lues dans `information_schema` à chaque exécution : seules les
  colonnes présentes des deux côtés sont copiées, chaque valeur est convertie au type PostgreSQL
  (booléen SQLite 0/1, JSON texte vers `jsonb`, millisecondes vers `timestamptz`). Le rapport liste
  `sqliteOnlyColumns` (colonnes à demander à Infra, jamais créées par le script) et `pgOnlyColumns`
  (laissées intactes). Une table absente de PostgreSQL est signalée `skipped`, pas une erreur (une table sur laquelle
  le rôle n'a aucun droit est invisible dans `information_schema` et passe pour absente).
- Une transaction par table, verrou consultatif (deux exécutions ne s'entrelacent pas), écriture
  par lots bornés (`--batch-size`, 500 par défaut, jamais plus de 60 000 paramètres), puis relecture
  de la table : si PostgreSQL ne vaut pas exactement SQLite, la transaction est annulée.
- Idempotent : une seconde exécution sans changement du SQLite n'écrit rien (`in-sync`).
- **Garde de suppression** : le script s'arrête sur une table dont plus de 25 % des lignes (et plus
  de 50) disparaîtraient, ou dont le SQLite est vide alors que PostgreSQL ne l'est pas
  (`blocked`). Après lecture du `--dry-run`, `--allow-mass-delete` lève la garde, `--no-delete`
  garde toutes les lignes absentes.

## Commandes de production (DBFR, Linux, checkout d'`origin/main`)

La clé de connexion vient du magasin protégé, jamais d'un argument. Le répertoire du checkpoint est
en `700`, le fichier en `600`. Le checkpoint lie l'exécution au fichier (chemin, périphérique, inode) :
la base restaurée le 22/10 est un autre fichier, donc un `--source-id` neuf est nécessaire si un
checkpoint existe déjà pour l'ancienne.

```bash
export DATABASE_URL="…"                       # magasin protégé
BOT_DB=…/bot.db                               # hôte du volume monté sur /app/data/bot.db
CP=$HOME/.shenron-private/bot-runtime-sync-dbfr-bot-20261023.json
SYNC="bun scripts/ops/sync-bot-runtime-sqlite-to-postgres.ts --sqlite $BOT_DB --source-id dbfr-bot-20261023"

$SYNC --tables state --dry-run                                  # 1. écarts par table, rien n'est écrit
$SYNC --tables state --checkpoint $CP --prepare-checkpoint      # 2. fige l'identité de la base
$SYNC --tables state --checkpoint $CP --apply                   # 3. recopie l'état
$SYNC --tables state --dry-run                                  # 4. contrôle : tout est `in-sync`
```

`--tables state` laisse volontairement les journaux de côté : les identifiants de `action_logs` et
`rag_eval_history` dépendent du `--source-id`, donc un identifiant neuf recopie une seconde fois
les lignes déjà présentes (et un ancien identifiant sur la base restaurée refuse toute ligne
divergente). Décider séparément avant `--tables journals`.

Sortie : un tableau par table sur stderr, le rapport JSON complet sur stdout (`ok`, `state`,
`tables`). Code retour 1 si une table est `error` ou `blocked`.

Sans checkout sur l'hôte, le script se compile en un seul fichier autonome :
`bun build scripts/ops/sync-bot-runtime-sqlite-to-postgres.ts --target bun --outfile sync-bot-runtime.js`,
copié puis lancé avec le `bun` de l'hôte. Les deux autres synchronisations
(`sync-bot-private-sqlite-to-postgres.ts` pour `jails`, `dm_contacts` et `dm_messages`, et
`sync-discord-profiles-sqlite-to-postgres.ts`) se compilent de la même façon.

Les tables du miroir de la guilde (`discord_members`, `discord_roles`, `discord_channels`) sont
créées dans PostgreSQL par `apps/site/src/db/bot-discord-mirror.sql` (additif, idempotent :
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f apps/site/src/db/bot-discord-mirror.sql`) ; tant
qu'elles manquent, le script les signale `skipped`.

## Synchronisation complète du 2026-10-23

Après la restauration du 22/10 et la correction de l'inflation d'XP, tout le réplica a été remis
à niveau depuis le SQLite de production, chaque étape précédée d'un `pg_dump` (droits 600) dans
`~/audit/` sur DBFR :

1. **État** (`--tables state`, source `dbfr-bot-20261023`) : 25 tables recopiées puis contrôlées
   `in-sync` (362 membres, 4 254 signalements et 408 succès manquaient).
2. **Miroir de la guilde** : DDL ci-dessus appliqué, puis recopie des trois tables.
3. **Journaux** : `bot.action_logs` (import du 20/09 et anciennes passes mêlés) et
   `bot.rag_eval_history` vidés, puis recopiés intégralement sous la source `dbfr-bot-20261023`.
   PostgreSQL ne fait que les lire (pages d'audit de l'admin) : aucune donnée n'y naît.
4. **Données privées et profils** (source `dbfr-bot-runtime-20261013`) : les lignes PostgreSQL
   antérieures à la table de provenance `bot.sqlite_runtime_sources` (import du 20/09) ont été
   retirées, puis réinsérées depuis le SQLite avec leur provenance ; trois isolements en double
   dans le SQLite (copie de restauration) ont été supprimés. Contrôle final : `pending` à 0.

## Tests

- Purs : `bun test scripts/ops/sync-bot-runtime-state.test.ts scripts/ops/sync-bot-runtime-sqlite-to-postgres.test.ts`.
- Live (PostgreSQL jetable, schéma temporaire supprimé en fin de test) :
  `SHENRON_LIVE=1 SHENRON_TEST_DATABASE_URL=postgres://… bun test scripts/ops/sync-bot-runtime-state.live.test.ts`.
- Cohérence des déclarations : `apps/bot/tests/db-schema-parity.test.ts` (SQLite migré contre
  `schema.ts`) et `apps/bot/tests/db-schema-pg-alignment.test.ts` (`bot-schema.ts` contre le SQLite).
