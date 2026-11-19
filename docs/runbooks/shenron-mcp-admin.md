# shenron-mcp: niveau admin (PostgreSQL, Redis, mémoire, temps réel)

Le serveur `crates/shenron-mcp` sert deux niveaux (`crates/shenron-mcp/src/access.rs`). Anonyme: outils de lecture publics. Jeton `Authorization: Bearer` accepté, ou IP de `SHENRON_MCP_ALLOWED_IPS`: tous les outils, dont le plan de données ci-dessous. Ces outils n'apparaissent pas dans `tools/list` d'un appelant anonyme et un appel direct est refusé.

## Outils

| Outil | Effet | Garde-fous |
| --- | --- | --- |
| `db.schema` | relations, colonnes, index, clés étrangères, estimation de lignes | lecture seule, plafond de lignes et d'octets |
| `db.query` | un `SELECT`, `WITH`, `VALUES` ou `TABLE`, lignes en JSON | transaction `READ ONLY`, `statement_timeout`, plafonds, plusieurs instructions refusées |
| `db.exec` | une écriture ou un DDL | `confirm: true` exigé, transaction, `statement_timeout`, ligne d'audit dans la même transaction (écriture annulée si l'audit échoue), `dry_run` pour annuler |
| `db.explain` | plan JSON, `analyze: true` exécute en `READ ONLY` | une instruction |
| `redis.info`, `redis.get`, `redis.scan`, `redis.ttl` | lecture | `SCAN` seulement (jamais `KEYS`), plafonds, délai par commande |
| `redis.set`, `redis.del` | écriture | `confirm: true` exigé, 100 clés au plus, la valeur n'est ni hachée ni journalisée |
| `memory.learn`, `memory.recall` | faits appris avec URL source et horodatage (`shenron-memory`, SQLite) | URL http(s) obligatoire, un même fait met à jour sa fiche |

Chaque appel est limité par appelant (`SHENRON_MCP_RATE_LIMIT_PER_MIN`), journalisé (`tracing`, cible `shenron_mcp::audit`: appelant, outil, hachage des arguments, durée, résultat) et inscrit dans `bot.shenron_mcp_audit` quand PostgreSQL est configuré. L'appelant est `token:<12 hex de blake3>` (jamais le jeton), `ip:<adresse>` ou `stdio`.

Ressources (niveau admin, abonnement `resources/subscribe` ou `subscriptions/listen`):

- `shenron://events/<canal>`: charges utiles NOTIFY récentes d'un canal PostgreSQL.
- `shenron://db/table/<table>` ou `<schéma.table>`: échantillon de lignes; une notification de mise à jour part quand la table change.

Transport du temps réel: l'endpoint HTTP est sans session (voir `crates/shenron-mcp/src/http.rs`), donc la poussée passe par `subscriptions/listen` (protocole 2026-07-28, flux SSE tenu ouvert par le client avec `Mcp-Method: subscriptions/listen` et son jeton), ou par `resources/subscribe` en stdio. Un client qui ne sait faire ni l'un ni l'autre relit `shenron://events/<canal>` (200 derniers évènements, `seq` croissant). Un appelant anonyme n'a ni la méthode ni les ressources.

Le changement d'une table est annoncé par la fonction `bot.shenron_mcp_notify()` (migration opt-in, aucun déclencheur posé par défaut). Pour suivre une table:

```sql
CREATE TRIGGER shenron_mcp_notify AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
  ON bot.<table> FOR EACH STATEMENT EXECUTE FUNCTION bot.shenron_mcp_notify();
```

## Variables du serveur

Lues dans l'environnement du processus `shenron-mcp` (en production, `$SHENRON_ROOT/config/compute.env`, `env_file` du service compute). Aucune n'est obligatoire; sans DSN, les outils `db.*` répondent « not configured ».

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `SHENRON_MCP_TOKENS` | aucun | jetons acceptés (virgules, 16 octets au moins); `SHENRON_ADMIN_TOKEN`, `SHENRON_API_ADMIN_TOKEN` et `DBFR_TOKEN` sont aussi acceptés |
| `SHENRON_MCP_DATABASE_URL`, sinon `DATABASE_URL` | aucun | DSN PostgreSQL; utiliser un rôle dédié aux privilèges minimaux, avec `INSERT` sur la table d'audit |
| `SHENRON_MCP_REDIS_URL`, sinon `REDIS_URL` | aucun | URL Redis (`redis://`, sans TLS) |
| `SHENRON_MCP_DB_POOL_SIZE` | 4 | taille du pool (1 à 32) |
| `SHENRON_MCP_DB_STATEMENT_TIMEOUT_MS` | 15000 | délai d'une instruction et plafond de `timeout_ms` (100 à 120000) |
| `SHENRON_MCP_DB_MAX_ROWS` | 500 | plafond de lignes par appel (1 à 5000) |
| `SHENRON_MCP_MAX_RESPONSE_BYTES` | 262144 | plafond d'octets par réponse (1024 à 4194304) |
| `SHENRON_MCP_REDIS_TIMEOUT_MS` | 5000 | délai d'une commande Redis |
| `SHENRON_MCP_REDIS_MAX_KEYS` | 200 | plafond de clés et d'éléments (1 à 5000) |
| `SHENRON_MCP_RATE_LIMIT_PER_MIN` | 120 | appels admin par appelant et par minute |
| `SHENRON_MCP_AUDIT_TABLE` | `bot.shenron_mcp_audit` | table d'audit |
| `SHENRON_MCP_LISTEN_CHANNELS` | `shenron_mcp_table` | canaux écoutés; valeur vide: tâche désactivée; la tâche démarre au premier abonnement, ou au démarrage si la variable est définie |
| `SHENRON_MCP_MEMORY_PATH` | `$SHENRON_HOME/mcp-memory.sqlite` (`~/.shenron` sans `SHENRON_HOME`) | fichier SQLite de la mémoire |
| `SHENRON_MCP_MEMORY_AGENT` | `shenron-mcp` | propriétaire des faits |

## Migrations (additives, appliquées par Infra, dans `deploy/sql/`)

1. `20261119_shenron_mcp_audit.sql` (retour: `20261119-shenron-mcp-audit.rollback.sql`): table `bot.shenron_mcp_audit`. À appliquer avant de configurer un DSN: sans elle, `db.exec` refuse toute écriture.
2. `20261119_shenron_mcp_notify.sql` (retour: `20261119-shenron-mcp-notify.rollback.sql`): fonction de déclencheur, optionnelle.

## Jeton côté client

1. Générer un jeton de 32 octets: `bun -e "console.log(crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''))"`, ou `openssl rand -hex 32`. Ne jamais l'écrire dans le dépôt ni dans un journal.
2. Côté serveur: l'ajouter à `SHENRON_MCP_TOKENS` dans l’env du service qui lance `shenron-mcp` sur prd (aujourd’hui `site` : `$SHENRON_ROOT/config/site.env`, `shenron-mcp --http` est un processus enfant de `shenron-server`), sous le verrou de déploiement défini dans `AGENTS.md`, puis recréer ce seul service. Rotation: ajouter le nouveau jeton, mettre à jour les clients, retirer l'ancien.
3. Côté poste: variable d'environnement `SHENRON_MCP_TOKEN` (Windows: variable utilisateur; Linux: profil du shell). `.mcp.json` reste anonyme (outils en lecture). Le niveau admin passe par une entrée locale non versionnée : `claude mcp add --scope local --transport http shenron-admin <origine>/mcp --header "Authorization: Bearer ${SHENRON_MCP_TOKEN}"`. Aucun secret n’est écrit ; variable absente, seul `shenron-admin` échoue (un `Bearer` vide est refusé en 401).
4. Vérifier: `/mcp` dans Claude Code liste `db.schema`, `redis.info` et `memory.recall` sous `shenron`; sans jeton, `curl https://dragonballfr.com/.well-known/mcp.json` montre ces outils dans `elevatedTools` seulement.

## Tests d'intégration

Hors poste Windows, sur fr2, avec des conteneurs temporaires (jamais les données de prd):

```sh
docker run -d --rm --name mcp-it-pg -e POSTGRES_PASSWORD=it -p 127.0.0.1:55432:5432 postgres:18-alpine
docker run -d --rm --name mcp-it-redis -p 127.0.0.1:56379:6379 redis:8-alpine
SHENRON_MCP_TEST_DATABASE_URL=postgres://postgres:it@127.0.0.1:55432/postgres \
SHENRON_MCP_TEST_REDIS_URL=redis://127.0.0.1:56379 \
  cargo test -p shenron-mcp --test admin_integration
docker stop mcp-it-pg mcp-it-redis
```

Sans ces variables, les tests d'intégration se terminent sans rien vérifier (message `skipped`).
