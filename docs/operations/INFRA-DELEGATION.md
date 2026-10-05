# Délégation de l'exploitation à `aphrody-infra`

Référence unique de la frontière d'exploitation. Ce dépôt livre des artefacts ;
il ne modifie aucun hôte.

## Ce que possède `aphrody-infra`

- Le catalogue des services, leurs unités systemd et timers, les hôtes et les
  ports.
- Les routes Nginx publiques, le CDN et les certificats.
- Les releases, la bascule, le retour arrière et les sondes de santé.
- Les sauvegardes, la rétention et le nettoyage des hôtes.
- L'application des migrations PostgreSQL de production (runbook
  `aphrody-infra`) ; `db:push` est interdit.
- Les fichiers d'environnement et les secrets de production.

Toute procédure d'hôte se lit et s'exécute côté `aphrody-infra` ; elle n'est pas
recopiée ici.

## Ce que livre ce dépôt

| Artefact | Commande | Sortie |
| --- | --- | --- |
| Binaire `shenron-server` (front, site embarqué, API locale) | `bun run build:server` | `dist/server/<cible>/` |
| Binaire du bot | `bun run build:bot` | `dist/bot/<cible>/` |
| Installeur Windows du bureau | `bun scripts/build/desktop.ts` | `dist/desktop/<cible>/` |
| Binaires Rust (`shenron-cli`, `shenron-mcp`, `shenron-desktop`) | `cargo build --release -p <crate>` | `target/release/` |
| Migrations du site | — | `apps/site/src/db/migrations` (appliquées par le runbook) |
| Proxy média | — | `deploy/privoxy/` (voir `deploy/README.md`) |

Le build public passe la garde de données privées de
`scripts/build/server.ts` : aucune base, aucun corpus, aucun identifiant ni
`.env` dans un artefact. Le fonctionnement des binaires est décrit dans
[`RUNTIME.md`](../architecture/RUNTIME.md).

## Services consommés

Shenron lit les adresses et jetons de ses dépendances (PostgreSQL,
`aphrody-ai-http`, `aphrody-shenron-embed`, `aphrody-web-api`) dans son
environnement, jamais dans le code ; noms canoniques dans [`ENV.md`](ENV.md),
frontière de calcul dans [`APHRODY-ECOSYSTEM.md`](../architecture/APHRODY-ECOSYSTEM.md).
Sans ces services, le bot et le site démarrent et dégradent explicitement.

## Règles

- Ne jamais éditer un checkout sur un serveur ni lancer depuis ce dépôt une
  commande qui modifie un hôte.
- Une documentation ou un commit ne prouve pas un déploiement : seule la
  release active, sondée par `aphrody-infra`, fait foi.
- Exception voulue par le propriétaire : `scripts/ops/admin-access.ts` tient la liste
  des postes d'administration (IP publique du poste, VPS, WireGuard, comptes désignés)
  sur `vps` et `dbfr` par `aphrody-infra ssh exec` — ufw, fail2ban, PostgreSQL
  (`listen_addresses`, bloc `pg_hba` en SCRAM), `SHENRON_ADMIN_IPS` et
  `SHENRON_MCP_ALLOWED_IPS`. Plan sans `--apply`, idempotent, minuteur utilisateur WSL
  toutes les 15 minutes (`--install-timer`). Redis reste en boucle locale :
  `aphrody-infra ssh tunnel` (port local 16379).
