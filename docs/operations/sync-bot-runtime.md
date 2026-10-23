<!-- SPDX-License-Identifier: Apache-2.0 -->

# Réplica PostgreSQL de l'état du bot

Le SQLite du bot (`bot.db`, `DATABASE_PATH`) est la source de l'état d'exécution : XP, zéni,
inventaire, modération, économie. Le schéma PostgreSQL `bot` n'en est qu'un réplica, à sens unique
(SQLite vers PostgreSQL). Deux entrées, un seul moteur (`@aphrody/shenron-db/replica`,
`packages/db/src/replica/`) :

- **la synchronisation permanente**, dans le bot (`ReplicaSyncService` et `ReplicaSyncCron`),
  toutes les 15 minutes, incrémentale ;
- **le script manuel** `scripts/ops/sync-bot-runtime-sqlite-to-postgres.ts`, table entière,
  avec point de contrôle : reprise après incident, remplacement de base, vérification à la demande.

## Synchronisation permanente (bot)

Active dès que `DATABASE_URL` est dans l'environnement du bot (en production, celle du PostgreSQL du
site) : sans elle, rien n'est enregistré et le bot ne change pas. Le job `replica-state-sync` est
dans le registre des tâches (`GET /api/cron` : dernière exécution, durée, prochaine ;
`POST /api/cron/replica-state-sync/trigger` force une passe). Première passe 90 s après `clientReady`.

| Réglage (`/config`, `guild_settings`) | Défaut              | Effet                                                                                                                                                                      |
| ------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replica.sync.enabled`                | `true`              | Interrupteur, relu à chaque passe.                                                                                                                                         |
| `replica.sync.interval_minutes`       | `15` (1 à 1440)     | Cadence, appliquée à chaud (elle réécrit `cron.replica-state-sync.interval_ms`, le contournement que l'API de cadence utilise déjà).                                       |
| `replica.sync.journals`               | `true`              | Recopie aussi `action_logs` et `rag_eval_history`.                                                                                                                         |
| `replica.sync.source_id`              | `dbfr-bot-20261023` | Identité de la base SQLite dont dérivent les identifiants des journaux. **Ne changer qu'après un remplacement de base** (voir plus bas) ; motif `[a-z0-9][a-z0-9-]{5,80}`. |

### Ce qu'une passe fait

1. **État** (`BOT_STATE_REPLICA_TABLES`, parents avant enfants). SQLite est lu table par table, chaque
   lecture une instruction synchrone (table cohérente), la boucle d'événements cédée entre deux
   tables ; les entiers sont lus en `bigint` (un total d'XP au-delà de 2^53 arrive chiffre pour
   chiffre).
   - **Passe complète** (premier passage après démarrage, toutes les 4 h, ou dès qu'un écart est
     soupçonné) : même comparaison que le script, toute la table PostgreSQL lue, diff par clé
     primaire, écriture, relecture. Elle reconstruit la **mémoire** de la table : un condensé du
     contenu de chaque ligne et le nombre de lignes que PostgreSQL contient alors.
   - **Passe incrémentale** (toutes les autres) : chaque ligne SQLite est condensée (local, sans
     réseau) et comparée à la mémoire. Est candidate une clé nouvelle, une clé disparue, une ligne
     dont le condensé a bougé et, pour `users`, une ligne dont `updated_at` a bougé (le condensé
     rattrape un écrivain qui oublierait de le mettre à jour ; le rapport le compte dans
     `changedWithoutMark`). Aucun candidat : un seul `count(*)` confirme que PostgreSQL contient
     toujours le nombre de lignes laissé par la passe précédente, et c'est tout. Des candidats : une
     transaction prend le verrou consultatif, relit **seulement leurs lignes** PostgreSQL, refait le
     diff par clé primaire (une ligne touchée mais déjà égale n'écrit rien), applique la garde de
     suppression, écrit par lots, puis contrôle le nombre de lignes et relit les candidats ; le
     moindre écart annule la transaction.
   - **Repli** : un nombre de lignes PostgreSQL qui a bougé hors synchronisation, une erreur ou une
     table inconnue de la mémoire renvoie la table en passe complète, signalée en `warn` comme
     dérive. Une modification de valeur qui garde le même nombre de lignes attend la vérification
     complète suivante (4 h au plus) : personne d'autre n'écrit dans le réplica, ce n'est qu'un filet.
   - **Verrou** : `pg_try_advisory_xact_lock`, le même verrou que le script. Si le script (ou une
     autre instance du bot) écrit, la table est `busy`, rien n'est lu ni écrit, la passe suivante
     reprend. Une passe ne se chevauche jamais elle-même (garde en mémoire) ; chaque transaction
     porte un `statement_timeout` de 60 s et la passe entière 10 minutes.
   - **Garde de suppression** (inchangée) : plus de 25 % des lignes (et plus de 50), ou un SQLite vide
     face à un PostgreSQL qui ne l'est pas, bloque la table : rien n'est écrit, une ligne `error` est
     journalisée (une fois toutes les 6 h tant que ça dure), l'état de la passe devient `blocked`.
     Seul le script, avec `--allow-mass-delete` après lecture du `--dry-run`, la lève.
2. **Journaux** (ajout seul, jamais de suppression). Mêmes identifiants négatifs que la recopie
   manuelle (`stablePostgresId`, dérivés de `replica.sync.source_id`, de la table et de
   l'identifiant SQLite) : les 241 710 lignes copiées le 23/10 sont **reconnues, jamais
   dupliquées**. Un curseur persistant (`bot.sqlite_sync_cursor`) retient le plus grand identifiant
   déjà copié ; une passe lit les lignes suivantes par lots, compare chacune à son identifiant
   PostgreSQL (une ligne divergente arrête tout), insère les absentes en
   `ON CONFLICT (id) DO NOTHING`, relit ce qu'elle a inséré, puis avance le curseur (jamais en
   arrière). Au plus 100 000 lignes par journal et par passe : sans curseur (premier démarrage), les
   241 710 lignes existantes sont vérifiées en trois passes d'environ une seconde chacune, sans rien
   écrire. Le curseur n'est qu'un signet : le perdre coûte du temps, jamais un doublon. Un SQLite
   dont les identifiants sont **en dessous** du curseur (`sqlite_sequence`) est une base remplacée
   par une plus ancienne : `blocked`, rien n'est écrit, il faut un nouveau `replica.sync.source_id`.

Créer le curseur : le bot tente `CREATE TABLE IF NOT EXISTS` au premier besoin ; si son rôle n'en a
pas le droit, les journaux attendent (l'état est synchronisé quand même) et le statut le dit
(`journalsUnavailable`). Idempotent, additif, à appliquer par l'Infra :
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f apps/site/src/db/bot-sqlite-sync-cursor.sql`.

### Journal et statut

- Une ligne `info` par passe : `[replica] pass` avec `outcome` (`ok`, `partial` si une table est
  `busy` ou absente de PostgreSQL, `blocked`, `error`), `ms`, tables, `inSync`, `applied`, `full`,
  `insert`/`update`/`delete`, `journalRead`/`journalWritten`.
- `warn` : dérive réparée (PostgreSQL n'était pas ce que la passe précédente avait laissé), tables
  en erreur, colonnes SQLite non répliquées (migration Infra à faire), curseur absent. `error` :
  suppression massive bloquée. Un message identique n'est répété qu'après 6 h.
- Un échec (PostgreSQL injoignable, délai dépassé) est journalisé, compté (`consecutiveFailures`) et
  sans autre effet : le bot ne dépend pas du réplica.
- `GET /api/health/monitoring` (admin, lecture seule) expose `replicaSync` : `configured`,
  `enabled`, `running`, cadence, `sourceId`, nombre de passes, échecs consécutifs, `lastOkAt`, et
  `lastPass` (déclencheur, état, durée, totaux, tables à surveiller avec leur raison, curseurs des
  journaux). Aucune nouvelle route.

### Remplacement de la base SQLite

Restaurer ou remplacer `bot.db` change l'identité de la source : donner un **nouveau**
`replica.sync.source_id` (les journaux seraient sinon comparés à des identifiants qui ne leur
correspondent plus et la passe s'arrêterait sur une ligne divergente). Les lignes déjà copiées
restent ; les journaux sont alors recopiés une seconde fois sous la nouvelle identité, comme pour
le script. L'état, lui, converge sans changement.

## Ce que le script copie

Le script et la synchronisation permanente copient les mêmes tables avec le même moteur ; le script
lit tout SQLite dans une transaction et compare chaque table entière.

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

- Purs : `bun test scripts/ops/sync-bot-runtime-state.test.ts scripts/ops/sync-bot-runtime-sqlite-to-postgres.test.ts`
  (enveloppes du script), `cd packages/db && bun test src/replica/replica.test.ts` (moteur :
  valeurs, classement des changements, journaux, curseur), `cd apps/bot && bun test --isolate tests/replica-state-sync-*.test.ts`
  (service, réglages, cron).
- Live (PostgreSQL jetable, schéma temporaire supprimé en fin de test ; le moteur est qualifié par
  postgres-js **et** par Bun.SQL, le client du bot) :
  `SHENRON_LIVE=1 SHENRON_TEST_DATABASE_URL=postgres://… bun test scripts/ops/sync-bot-runtime-state.live.test.ts packages/db/src/replica/replica.live.test.ts`,
  puis `cd apps/bot && bun test --isolate tests/replica-state-sync-service.live.test.ts` (service de
  bout en bout sur le pool du bot).
- Cohérence des déclarations : `apps/bot/tests/db-schema-parity.test.ts` (SQLite migré contre
  `schema.ts`) et `apps/bot/tests/db-schema-pg-alignment.test.ts` (`bot-schema.ts` contre le SQLite).
