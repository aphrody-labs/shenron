# Variables d'environnement — référence canonique

Document de référence unique pour les variables lues par le bot, le site et le pipeline.
Les autres documents renvoient ici au lieu de recopier les listes. Les résolveurs cités sont
la source de vérité : en cas d'écart, le code fait foi.

Règles :

- **Aucune valeur de production n'est écrite dans ce dépôt.** Les adresses, ports et secrets
  de production viennent de l'environnement fourni par `aphrody-infra`
  (catalogue de services et fichiers d'environnement de l'opérateur).
- Les défauts codés dans `@aphrody/shenron-config` ne servent qu'à garder un processus utilisable sans
  environnement (poste de dev, tests). C'est le seul endroit autorisé à les écrire.
- Les `.env` ne sont jamais affichés ni commités. Poste de développement : [`DEV-LOCAL.md`](DEV-LOCAL.md).
- Nom canonique d'abord ; les noms historiques restent acceptés en lecture. Quand plusieurs
  noms sont posés, la première valeur non vide dans l'ordre de lecture l'emporte.

## Paiements et monétisation du site

Variables consommées par `apps/site/src/lib/stripe.ts` et `apps/site/src/lib/env.ts` :

| Variable                                               | Portée                | Contrat                                                                                                                                                       |
| ------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                                    | secrète, runtime site | Clé Stripe restreinte de moindre privilège, propre à l'environnement ; aucune valeur de repli dans le code. Sans elle, les routes de paiement échouent fermé. |
| `STRIPE_WEBHOOK_SECRET`                                | secrète, runtime site | Secret du seul endpoint webhook correspondant à l'environnement Stripe. Les signatures sont vérifiées sur le corps HTTP brut.                                 |
| `STRIPE_PRICE_VIP_MONTHLY` / `STRIPE_PRICE_VIP_ANNUAL` | runtime site          | Price IDs correspondant au catalogue public, provisionnés séparément en sandbox et en production ; aucun ID de test codé en dur.                              |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`                   | publique              | Facultative pour les pages utilisant uniquement Checkout hébergé ; jamais une clé secrète.                                                                    |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`            | secrets runtime site  | Identifiants OAuth API propre à l'environnement, transmis à PayPal uniquement côté serveur.                                                                   |
| `PAYPAL_WEBHOOK_ID`                                    | runtime site          | ID du webhook enregistré dans l'environnement PayPal ; utilisé par l'API officielle de vérification avant toute mutation.                                     |
| `PAYPAL_ENV`                                           | runtime site          | Obligatoire pour les opérations PayPal : `sandbox` ou `live`, sans détection depuis la requête navigateur.                                                    |
| `PAYPAL_PLAN_VIP_MONTHLY` / `PAYPAL_PLAN_VIP_ANNUAL`   | runtime site          | Plan IDs PayPal actifs correspondant aux mêmes offres que Stripe.                                                                                             |
| `NEXT_PUBLIC_ADSENSE_CLIENT`                           | publique/build site   | Identifiant éditeur AdSense fourni après approbation du compte. Vide ou invalide : aucun tag publicitaire.                                                    |
| `NEXT_PUBLIC_ADSENSE_SLOT_*`                           | publique/build site   | Identifiants de blocs réels créés dans AdSense. Aucun emplacement de remplissage n'est inventé.                                                               |

Les Price IDs Stripe et plan IDs PayPal sont des références de configuration non secrètes mais propres à l'environnement ; ils doivent être vérifiés contre les consoles prestataires avant activation commerciale. Les secrets sont provisionnés par Aphrody Infra, jamais inclus dans une image ou un fichier versionné. L'état des abonnements provient des webhooks vérifiés ; un callback navigateur PayPal déclenche une capture relue côté serveur et n'accorde pas seul de privilège.

## Moteur Studio hébergé

`apps/server/src/site.ts` monte le moteur canonique pour un compte authentifié.
Le rôle admin reste requis pour les routes de publication du catalogue ; un projet
Studio personnel ne donne pas ce rôle.

| Variable                  | Propriétaire              | Contrat                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHENRON_STUDIO_SDK_BIN`  | Serveur / image scellée   | Chemin absolu du `koharu-sdk` qualifié et livré dans l'image. Sans binaire, la capacité reste indisponible.                                                                                                                                                           |
| `SHENRON_STUDIO_HOME`     | Infra / volume protégé    | Racine privée des espaces de travail ; chaque identité reçoit un sous-dossier nommé par son SHA-256, créé en mode 0700.                                                                                                                                               |
| `KOHARU_SECRET_NAMESPACE` | Runtime Studio uniquement | SHA-256 de l'identité, transmis au processus enfant pour isoler ses identifiants. Sur Linux hébergé : fichiers privés dans `SHENRON_HOME/.credentials` (0700/0600), sans Keyutils ; le nom du foyer doit correspondre au namespace. Non modifiable par le navigateur. |

L'environnement des processus Studio est reconstruit depuis une liste limitée :
aucune clé de fournisseur, base de données ou session d'opérateur n'est héritée.
Les modèles ne sont pas embarqués par le build de ce moteur ; leur activation reste
une opération explicite du compte dans son espace isolé.

## Release — `scripts/deploy` (`build-image.sh`, `ship-image.sh`, `release.sh`)

Lues par `scripts/deploy/release.sh [--build-only | --ship-only] [revision]` sur l'hôte de
build Linux x64 ; toutes facultatives. Les en-têtes des scripts font foi.

| Variable                       | Défaut                                  | Contrat                                                                                                                                               |
| ------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHENRON_SOURCE_REPO`          | dépôt du script                         | Checkout Git d'où la révision est extraite.                                                                                                           |
| `SHENRON_BUILD_REPO`           | `$HOME/build/shenron`                   | Worktree de build réutilisé (garde `target/`, `node_modules` et le cache Turbopack).                                                                  |
| `SHENRON_BUILD_LOCK`           | `<worktree>.lock`                       | Fichier `flock` qui sérialise les builds d'un worktree.                                                                                               |
| `SHENRON_BUILD_REVISION`       | `origin/main`                           | Révision construite quand aucun argument n'est donné.                                                                                                 |
| `SHENRON_VFS_SOURCE`           | `dist/vfs/shenron-vfs.public.sqlite`    | VFS public : fichier local, URL http(s) ou `hôte:chemin` scp.                                                                                         |
| `SHENRON_CONTAINER`            | `docker`, sinon `podman`                | Moteur de conteneurs.                                                                                                                                 |
| `SHENRON_IMAGE`                | `localhost/shenron`                     | Nom de l'image, étiquetée par le SHA.                                                                                                                 |
| `SHENRON_COMPILE_BUN`          | `bun` du `PATH`                         | Bun qui compile les binaires de release.                                                                                                              |
| `SHENRON_CARGO_JOBS`           | tous les CPU                            | Jobs Cargo.                                                                                                                                           |
| `SHENRON_FORCE_<LANE>`         | `0`                                     | `1` reconstruit la lane SITE, BOT ou RUST même si son empreinte est inchangée.                                                                        |
| `SHENRON_ENV_DIR`              | `/etc/rose-griffon`                     | Répertoire des fichiers d'environnement Infra (`shenron-{site,bot}.env`) ; lu par le compose, `env-pull`, `container-secrets` et `admin-access-host`. |
| `SHENRON_REMOTE_KEEP_IMAGES`   | `4`                                     | Révisions d'image conservées sur la cible `ssh:` après activation (cibles de rollback, ~1,8 Gio chacune) ; `0` désactive le nettoyage.                |
| `SHENRON_MEDIA_STAGING_DIR`    | `~/.local/share/aphrody/media-staging`  | Racine de mise en scène des médias (`deploy/cloudflare/cli/stage-file.ts`).                                                                           |
| `SHENRON_STAGING_RECEIPTS_DIR` | `~/.aphrody/private/shenron/…/receipts` | Reçus de mise en scène (`stage-file.ts`).                                                                                                             |
| `SHENRON_NEXT_BUILD_CACHE`     | `1`                                     | Conserve le cache de build Turbopack entre builds.                                                                                                    |
| `SHENRON_SITE_BUILD_CPUS`      | `6`                                     | CPU du build du site, qui chevauche les lanes Rust, VFS et bot.                                                                                       |
| `SHENRON_SITE_BUILD_MIN_GIB`   | `20`                                    | Mémoire disponible attendue avant le build du site (évite le SIGTERM d'un tueur OOM, sortie 143).                                                     |
| `SHENRON_PAYLOAD_ZSTD_LEVEL`   | `6`                                     | Niveau zstd du payload embarqué.                                                                                                                      |
| `SHENRON_KEEP_IMAGES`          | `3`                                     | Images conservées localement.                                                                                                                         |
| `SHENRON_DEPLOY_TARGET`        | `ssh:dbfr`                              | `ssh:<hôte>` (image diffusée en zstd), `registry:<dépôt>` (push) ou `local` (Compose de `deploy/docker`).                                             |
| `SHENRON_DEPLOY_COMMAND`       | `bash ~/deploy-shenron-image.sh` (ssh)  | Commande d'activation lancée avec `<sha> <image>` ; en ssh, l'entrée Infra de DBFR.                                                                   |
| `SHENRON_ACTIVE_COMMAND`       | basename de `/srv/shenron/current`      | Affiche la release active (garde de rollback) ; vide désactive le garde.                                                                              |
| `SHENRON_ALLOW_ROLLBACK`       | `0`                                     | `1` autorise un commit qui ne descend pas de la release active.                                                                                       |
| `SHENRON_COMPOSE_FILE`         | `deploy/docker/compose.yaml`            | Fichier Compose de la cible `local`.                                                                                                                  |
| `SHENRON_WEB_CRAWL_ENV_FILE`   | `/etc/aphrody/shenron-web-crawl.env`    | Fichier privé fourni au conteneur du bot ; il peut définir `SHENRON_ADMIN_WEB_CONFIG` et `APHRODY_VPS_MCP_HTTP_TOKEN`. Vide ou absent, la file distribuée reste désactivée. |
| `SHENRON_WEB_CRAWL_CONFIG_DIR` | `/etc/aphrody/shenron-web-crawl`       | Dossier privé monté en lecture seule sur `/run/aphrody/web-crawl` ; contient le JSON web et les configurations MCP privées.                               |

## Décisions Jev — `@aphrody/shenron-config/jev`

Le résolveur `resolveJev` active Jev si `SHENRON_JEV=on` ou si le backend reçoit
`TYPESAFE_API_KEY`. `SHENRON_JEV=off` le désactive explicitement. La clé reste
dans le fichier d'environnement protégé injecté par Infra, jamais dans une
variable `NEXT_PUBLIC_*`, un bundle, une réponse HTTP ou une image.

Les décisions, la validation et le transport appartiennent au crate
`aphrody-jev` du dépôt Bun, partagé avec `bun:yolo`. Le chat Shenron ne transmet
que la question courante et les extraits dont la visibilité publique est
établie. Les conversations, souvenirs, profils et pièces OCR restent locaux.
Les sources sans preuve de visibilité sont conservées par le chemin local et
signalées comme non évaluées. Une panne Jev exclut les extraits publics concernés
et conserve les erreurs expurgées. La hiérarchie éditoriale est appliquée en code ;
une source réfutant une prémisse fausse reste recevable.

## Origines publiques — `@aphrody/shenron-config/public-urls`

Résolveurs `resolveSiteUrl`, `resolveApiUrl`, `resolveAssetsUrl`, table `PUBLIC_URL_ENV`.
Le miroir `NEXT_PUBLIC_*` est lu en premier : c'est la valeur que Next inscrit dans les bundles
client, serveur et client doivent donc résoudre la même origine.

| Origine      | Canonique                   | Ordre de lecture                                                                             | Repli                     |
| ------------ | --------------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| site         | `SHENRON_PUBLIC_SITE_URL`   | `NEXT_PUBLIC_SITE_URL`, `SHENRON_PUBLIC_SITE_URL`, `SITE_PUBLIC_URL`, `BETTER_AUTH_URL`      | origine publique du site  |
| API du bot   | `SHENRON_PUBLIC_API_URL`    | `NEXT_PUBLIC_SHENRON_API_URL`, `SHENRON_PUBLIC_API_URL`, `API_PUBLIC_URL`, `SHENRON_API_URL` | origine publique de l'API |
| assets / CDN | `SHENRON_PUBLIC_ASSETS_URL` | `NEXT_PUBLIC_SHENRON_ASSETS_URL`, `SHENRON_PUBLIC_ASSETS_URL`                                | origine de l'API          |

`ownImageRemotePatterns(env)` dérive de ces mêmes origines les `images.remotePatterns` de Next
(assets, CDN miroir, médias Discord) ; `assetMirrorUrl` bascule une URL d'asset entre le CDN et
l'API, qui servent le même arbre `/assets/**`.

## Services internes — `@aphrody/shenron-config/services`

Résolveurs `resolveRedisUrl`, `resolveSiteInternalUrl`, `resolveBotApiInternalUrl`,
`resolveBotApiServerUrl`, `resolveRelectureOcrUrl`, table
`INTERNAL_SERVICE_ENV`. Les défauts sont des adresses de boucle locale pour le dev ; en
production, l'environnement les fournit.

| Service                              | Ordre de lecture                                      |
| ------------------------------------ | ----------------------------------------------------- |
| Redis / Valkey                       | `REDIS_URL`, `VALKEY_URL`                             |
| Site interne (appels bot → site)     | `SITE_INTERNAL_URL`                                   |
| API du bot (bind et appels internes) | `API_HOST` + `API_PORT`                               |
| API du bot (appels serveur du site)  | `BOT_INTERNAL_URL`, sinon l'origine publique de l'API |
| Sidecar de relecture OCR             | `RELECTURE_OCR_URL`                                   |

Le rate limit d'authentification du site (`apps/site/src/lib/auth-rate-limit.ts`) utilise
`REDIS_URL` s'il est posé et se replie sur un stockage en mémoire sinon ; il n'a pas d'URL par
défaut.

## Alias de secrets et de chemins — `@aphrody/shenron-config/env`, `@aphrody/shenron-config/paths`

`ENV_ALIASES` : paires qui doivent porter la même valeur quand les deux sont posées
(`checkAlias` signale l'écart en nommant les variables, jamais les valeurs).

| Rôle                          | Canonique             | Historique        |
| ----------------------------- | --------------------- | ----------------- |
| Jeton admin de l'API          | `SHENRON_ADMIN_TOKEN` | `API_ADMIN_TOKEN` |
| Secret d'utilisateur agissant | `SHENRON_USER_SECRET` | `API_USER_SECRET` |
| Boîtes A2A `.coord`           | `A2A_COORD_DIR`       | `COORD_DIR`       |
| Jeu gold RAG                  | `RAG_GOLD_PATH`       | `RAG_GOLD`        |

`DATA_PATH_ENV` (chemins de données inscriptibles, défaut relatif au dépôt) : `RAG_GOLD_PATH`,
`SHENRON_ADMIN_DOCS_DIR`, `A2A_COORD_DIR`, `DATABOOKS_FREEZE_FILE`, `RAG_LEXIQUE`,
`SHENRON_PRIVATE_DOWNLOADS_DIR`. En production, un chemin encore issu du défaut est signalé une
fois par processus.

- `SHENRON_PRIVATE_DOWNLOADS_DIR` (défaut `/srv/shenron/shared/private-downloads`, hors release) :
  fichiers réservés aux administrateurs, servis par `GET /api/private-downloads` (index) et
  `GET /api/private-downloads/<nom>` (reprise par `Range`). Seuls les fichiers listés dans le
  `SHA256SUMS` du dossier sont servis ; garde `hasValidApiToken` (jeton admin ou IP de
  `SHENRON_ADMIN_IPS`), sinon `404`. `.md`, `.txt` et `.json` sont servis en ligne.
- A2A : sans `APHRODY_A2A_URL` (cas de la production depuis le retrait du service Aphrody du
  2026-09-25), `/api/a2a` est servi par le hub Shenron du site (A2A 1.0 `SendMessage`, `GetTask`,
  `ListTasks` et dialecte historique). Stockage durable : `APHRODY_A2A_COORD_API` s'il est posé,
  sinon `SHENRON_A2A_STORE_DIR`, sinon `<A2A_COORD_DIR>/shenron-dragonball` en production. Les
  écritures exigent `SHENRON_A2A_TOKEN`, un jeton admin ou une IP d'administration. Le bot relaie
  carte et JSON-RPC au site et diffuse ses événements publics sur `/api/a2a/events`.

## Base de données — `@aphrody/shenron-db`

| Variable                  | Rôle                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | PostgreSQL `shenron_site`, schéma `postgres://` ou `postgresql://` obligatoire (`resolveDatabaseUrl`).              |
| `SITE_BUILD_DATABASE_URL` | Base de lecture d'un build du site qui en a besoin ; le build public de `shenron-server` compile le site sans base. |
| `DATABASE_PATH`           | Fichier SQLite du bot (runtime + réplica wiki).                                                                     |

## DBXV2 (privé) — `@aphrody/shenron-dbxv2`

Données Bandai Namco / Dimps : jamais publiques, jamais dans Git, le VFS ou un artefact de build.
Désactivé par défaut ; `isDbxv2Enabled(env)` exige l'URL et le jeton, et reste faux pour
`NODE_ENV=production`, `SHENRON_PROFILE=public`, `SHENRON_PUBLIC_RENDER=1` ou `SHENRON_PUBLIC_BUILD=1`.

| Variable           | Rôle                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `DBXV2_SERVER_URL` | Origine http(s) du serveur privé `scripts/ops/dbxv2-serve.ts` (mesh ou loopback), sans identifiants ni `0.0.0.0`. |
| `DBXV2_TOKEN`      | Jeton Bearer du serveur (16 caractères minimum), transmis en en-tête, jamais en URL ni journalisé.                |
| `DBXV2_DB_PATH`    | Fichier SQLite de la base privée DBXV2 (`packages/db/src/dbxv2`), ouvert en lecture seule.                        |

Usage : [`docs/products/dbxv2-plugin.md`](../products/dbxv2-plugin.md).

## Authentification — `@aphrody/shenron-auth`

| Variable                                                                                  | Rôle                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                                                                      | Secret Better Auth, lu par `resolveBetterAuthSecret` ; repli `SESSION_SECRET`. Obligatoire en production, une valeur trop courte est refusée.                                                                                                                                                                                                                                           |
| `BETTER_AUTH_URL`                                                                         | Base URL Better Auth de l'app (aussi dernier repli de l'origine du site).                                                                                                                                                                                                                                                                                                               |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                | Client Google OAuth Web, hôte Better Auth et site ; laisser les deux absents pour désactiver Google. Callback : `<origine>/api/auth/callback/google`. Ne jamais exposer le secret au client.                                                                                                                                                                                            |
| `SMTP_PASSWORD`                                                                           | Secret de la boîte OVH, suffisant pour activer SMTP. Le compte par défaut est `contact@aphrody.com`, expéditeur `Dragon Ball France <contact@aphrody.com>`, serveur TLS implicite `ssl0.ovh.net:465`. À provisionner par Aphrody Infra, jamais dans le dépôt ou un journal.                                                                                                             |
| `SMTP_USER`, `AUTH_EMAIL_FROM`                                                            | Surcharges facultatives du compte et de l’expéditeur SMTP OVH. Sans `SMTP_PASSWORD`, l’API HTTPS Resend de repli demande `RESEND_API_KEY` et `AUTH_EMAIL_FROM`.                                                                                                                                                                                                                         |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM`                                                       | Transport HTTPS Resend de repli pour les e-mails transactionnels. L’adresse expéditrice doit être vérifiée dans Resend.                                                                                                                                                                                                                                                                 |
| `SHENRON_ADMIN_TOKEN`                                                                     | Jeton d'administration maître. Utilisable via le formulaire `/admin-access` (POST, jamais dans une URL), `Authorization: Bearer <token>`, `x-admin-token` ou le cookie HMAC signé `dbfr_admin` (30 jours après connexion durable). `aphrody shenron auth url` n'affiche que l'URL du formulaire.                                                                                        |
| `SHENRON_ADMIN_IPS`                                                                       | Postes d'administration (adresses ou CIDR, séparés par virgules) : staff sans session ni jeton pour `/admin`, la session (`ADMIN_IP_ACTOR`) et les routes « admin ou jeton » (desktop, CLI, scripts). Adresse lue dans `X-Real-IP` posé par nginx (`@/lib/admin-ip`). Tenue à jour par `scripts/ops/admin-access.ts`, avec `SHENRON_MCP_ALLOWED_IPS` du MCP. Vide : aucun accès par IP. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `OAUTH_ALLOWED_USERS` | OAuth Discord.                                                                                                                                                                                                                                                                                                                                                                          |
| `AgentKey` (table PG)                                                                     | Jetons d'agents autonomes (`dbfr_agent_...`) avec portées explicites (`moderate`, `write:articles`, etc.) acceptés par le proxy et `getCurrentUser()`.                                                                                                                                                                                                                                  |

### E-mails de confirmation des paiements

`SHENRON_BILLING_OUTBOX_TOKEN` est un jeton aléatoire d’au moins 32 caractères pour
`POST /api/cron/billing-outbox`. Aphrody Infra doit l’appeler périodiquement avec
`Authorization: Bearer <jeton>`. Les confirmations restent en file jusqu’à configuration du jeton
et de `SMTP_PASSWORD` ; les échecs SMTP sont repris avec un délai progressif puis terminés après
six tentatives. La file contient temporairement l’adresse e-mail et le texte de confirmation ;
prévoir une purge Infra des éléments envoyés après 90 jours. La livraison est au moins une fois :
un arrêt après acceptation SMTP mais avant l’enregistrement local peut provoquer un doublon.
L’expéditeur SMTP par défaut est `contact@aphrody.com` via `ssl0.ovh.net:465`. Aucun mot de passe
SMTP ni jeton de planification n’est conservé dans le dépôt ; Aphrody Infra doit les configurer
dans le coffre et planifier le worker avant l’activation en production.

## Serveur MCP — `apps/site/src/lib/ai-access.ts` et `crates/shenron-mcp`

`shenron-mcp --http <adresse> --public` sert deux paliers sur `/mcp` : les appelants anonymes ne voient et n'appellent que les outils en lecture seule ; un appelant **élevé** reçoit tous les outils (lecture, écriture, admin). Est élevé : un `Authorization: Bearer <jeton>` accepté, ou une IP cliente de `SHENRON_MCP_ALLOWED_IPS`. Un jeton présent mais inconnu donne `401` avec `WWW-Authenticate: Bearer` (jamais de repli silencieux en anonyme, même depuis une IP autorisée). Le transport est sans session (`application/json`, aucun `mcp-session-id`) : chaque requête est classée sur ses propres identifiants, un redémarrage (release) reste invisible aux clients et un `mcp-session-id` périmé est ignoré ; un `Accept` incomplet est complété. La carte `/.well-known/mcp.json` annonce `authentication: { read: "none", write: "bearer token or allow-listed IP" }`, les outils publics (`tools`) et les outils élevés (`elevatedTools`, `elevatedToolCount`).

| Variable                                                     | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHENRON_MCP_URL`                                            | Origine HTTP(S) du serveur `shenron-mcp --http <adresse> --public`, lue côté serveur seulement (validée par `apps/site/src/lib/env.ts`). Le site relaie `/mcp` vers `<origine>/mcp` en transmettant `Authorization`, `X-Forwarded-For` et `X-Real-IP`. **Aucun défaut** : sans valeur (ou avec une URL invalide), `/mcp` répond 503 et ni `llms.txt` ni `/.well-known/mcp.json` n'annoncent le serveur.                    |
| `SHENRON_HOST_URL`                                           | Origine de l'hôte Bun (`shenron-server`), optionnelle (`@aphrody/shenron-config/public-urls` `resolveHostUrl`). Site : si posée, `/api/auth/*` lui est relayé et la session se lit chez lui (cookie ou Bearer transmis) ; absente, le site garde son Better Auth (aucun changement). Bureau : `agent-home` valide le jeton Bearer sur `<origine>/api/auth/get-session`, à défaut sur le site public.                       |
| `SHENRON_AUTH_ALLOWED_HOSTS`, `SHENRON_AUTH_TRUSTED_ORIGINS` | Listes CSV ajoutées aux hôtes et origines de confiance du Better Auth de l'hôte Bun (`packages/api/src/host/auth.ts`), par exemple la boucle locale d'un profil bureau. Le groupe auth de l'hôte exige `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (et `BETTER_AUTH_SECRET` en production) ; sinon il reste désactivé avec sa raison.                                                                     |
| `SHENRON_MCP_TOKENS`                                         | Jetons porteurs acceptés (liste séparée par des virgules, 16 octets minimum chacun, comparaison à durée constante). Process `shenron-mcp`.                                                                                                                                                                                                                                                                                 |
| `SHENRON_API_ADMIN_TOKEN`, `DBFR_TOKEN`                      | Acceptés aussi comme jetons porteurs d'élévation quand ils sont posés (16 octets minimum). Ce sont également les jetons que les outils d'écriture envoient aux API : voir ci-dessous.                                                                                                                                                                                                                                      |
| `SHENRON_MCP_ALLOWED_IPS`                                    | IP ou CIDR (v4 et v6, séparés par des virgules) élevés sans jeton. Entrée invalide ignorée (journalisée). Défaut : aucune.                                                                                                                                                                                                                                                                                                 |
| `SHENRON_MCP_TRUSTED_PROXIES`                                | IP/CIDR des proxys dont les en-têtes `X-Forwarded-For` (entrée la plus à droite non fiable) puis `X-Real-IP` sont crus. Défaut : `127.0.0.0/8, ::1`. Un pair non listé ne peut pas usurper une IP autorisée : ses en-têtes sont ignorés. Le proxy frontal (nginx) doit **écraser** ces en-têtes, pas relayer ceux du client. Sans en-tête, l'IP cliente est celle du proxy : n'autorisez pas `127.0.0.1` derrière le site. |
| `SHENRON_MCP_ALLOWED_HOSTS`                                  | En-têtes `Host` acceptés (anti DNS rebinding). Défaut : loopback, `dragonballfr.com`, `mcp.dragonballfr.com`.                                                                                                                                                                                                                                                                                                              |
| `SHENRON_MCP_LOG`                                            | Filtre de journal (`tracing`) du processus, sur stderr. Défaut : `warn`.                                                                                                                                                                                                                                                                                                                                                   |

### Jetons des outils d'écriture (environnement du processus `shenron-mcp`)

Quand le serveur est élevé, les outils appellent les API avec les variables du processus ; le palier anonyme ne les utilise jamais (les outils concernés ne lui sont pas exposés, et `dbfr_*` n'attache plus de jeton à une lecture anonyme).

| Variable                                                                                         | Utilisée par                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DBFR_TOKEN` (repli `SHENRON_ADMIN_TOKEN`)                                                       | `dbfr_databooks` (`include_hidden`), `dbfr_deposit`                                                                                                                                                                     |
| `SHENRON_DATABOOKS_API_TOKEN` (repli `DATABOOKS_API_TOKEN`, `SHENRON_ADMIN_TOKEN`, `DBFR_TOKEN`) | `dragonball.admin_databooks_deposit`, `databook_create/update/delete/page_edit/anomalies/ocr_review`, `site_config_get/put`, `reports_list/update` (jeton porteur du site, `apps/site/src/lib/api-token.ts`)            |
| `SHENRON_API_ADMIN_TOKEN`                                                                        | `dragonball.admin_bot_*`, `admin_services`, `admin_service_action` (API bot)                                                                                                                                            |
| `SHENRON_AGENT_API_KEY`                                                                          | `dragonball.agent_*` (`/api/agent/v1/*`) : clé `dbfr_agent_...` créée dans `/admin/agents`, ses portées (`read`, `write:articles`, `publish:articles`, `comment`, `moderate`, `contribute`) décident ce qui est permis. |
| `SHENRON_API_URL`, `SHENRON_SITE_API_URL`, `SHENRON_SITE_URL`, `DBFR_BASE_URL`                   | Cibles des appels (défauts : bot et site publics).                                                                                                                                                                      |

## IA Aphrody — `@aphrody/shenron-pipeline/ai/config` (contrat `aphrody-infra`)

Les noms suivent le contrat IA local v1 d'`aphrody-infra` :
fichier `local-ai.json` de la configuration d'`aphrody-infra`
(noms canoniques, alias hérités, forme d'URL de chaque alias, index `shenron-rag` et valeurs
de la cible `vps`). Le résolveur unique est `@aphrody/shenron-pipeline/ai/config` (table `AI_ENV`) : bot,
site, façades `@aphrody/shenron-pipeline/aphrody`, pipeline et scripts passent tous par lui. Il lit le nom
canonique d'abord, puis chaque alias dans l'ordre du contrat ; un alias de forme `origin`
reçoit `/v1`, un alias de forme `endpoint` perd son chemin d'opération. **Aucune adresse par
défaut** : sans valeur, la capacité est désactivée, et un appel explicite (client de calcul,
scripts) échoue avec une erreur qui nomme les variables, jamais leurs valeurs. Toutes les URL
doivent être en HTTP sur une adresse de boucle locale. Le test
`packages/pipeline/test/ai/config.test.ts` vérifie la parité avec le contrat quand le dépôt voisin
`aphrody-infra` est présent.

| Rôle                                                | Canonique                                                  | Alias lus ensuite (forme)                                                                                                     | Défaut                         |
| --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Origine d'`aphrody-ai-http` (RAG, LLM, OCR, vision) | `APHRODY_AI_HTTP_URL`                                      | `APHRODY_SHENRON_API_URL` (origin)                                                                                            | aucun                          |
| Jeton bearer d'`aphrody-ai-http`                    | `APHRODY_AI_HTTP_TOKEN`                                    | `APHRODY_SHENRON_API_TOKEN`                                                                                                   | aucun                          |
| Modèle de chat envoyé à `/llm/chat`                 | `APHRODY_AI_CHAT_MODEL`                                    | `APHRODY_LLM_MODEL`, `APHRODY_SHENRON_LLM_MODEL`                                                                              | `gemini-web/flash`             |
| Modèle de relecture visuelle (`/vision/structured`) | `APHRODY_AI_VISION_MODEL`                                  | `APHRODY_SHENRON_VISION_MODEL`                                                                                                | `gemini-web/flash`             |
| Embedder E5 direct (`/v1/embeddings`)               | `APHRODY_AI_EMBED_BASE_URL` (base)                         | `APHRODY_SHENRON_EMBED_BASE_URL` (base), `EMBED_URL` (origin), `APHRODY_RAG_EMBED_ENDPOINT` (endpoint)                        | aucun (recherche lexicale)     |
| Modèle d'embedding                                  | `APHRODY_AI_EMBED_MODEL`                                   | `APHRODY_SHENRON_EMBED_MODEL`, `APHRODY_RAG_EMBED_MODEL`                                                                      | `Xenova/multilingual-e5-small` |
| Dimensions d'embedding                              | `APHRODY_AI_EMBED_DIMENSIONS`                              | `APHRODY_RAG_EMBED_DIM`                                                                                                       | `384`                          |
| Reranker (optionnel)                                | `APHRODY_AI_RERANK_BASE_URL` (base, dialecte llama-server) | `RERANK_URL` (endpoint, dialecte sidecar Shenron `{query, passages}`), `APHRODY_RAG_RERANK_ENDPOINT` (endpoint, llama-server) | désactivé                      |
| Modèle du reranker                                  | `APHRODY_AI_RERANK_MODEL`                                  | `APHRODY_RAG_RERANK_MODEL`                                                                                                    | aucun                          |

**Espace d'embedding (règle `never-mix-spaces`).** Le modèle et la dimension configurés sont
comparés à l'index au démarrage du bot (`assertRagEmbeddingSpace`) et avant toute écriture de
vecteurs par les scripts (`requireScriptEmbeddingSpace`) : l'index `shenron-rag` du contrat
(`Xenova/multilingual-e5-small`, q8, 384 dimensions) en mode `RAG_BACKEND=aphrody`, la ligne
`rag_meta` de l'index SQLite sinon. Un écart est une erreur fatale : le bot refuse de démarrer,
le script s'arrête avant d'écrire. Changer d'espace impose une réindexation.

**Serveur de chat direct (vLLM ou llama-server).** `APHRODY_AI_CHAT_BASE_URL` (forme `base`,
alias lus ensuite : `APHRODY_SHENRON_LLM_BASE_URL`, `APHRODY_OSS_BASE_URL`, puis
`APHRODY_LOCAL_MODEL_URL` de forme `origin`) désigne un serveur OpenAI-compatible
(`POST <base>/chat/completions`) ; résolu par `resolveDirectChat`, appelé par
`createOpenAiChat` et le fournisseur AI SDK natif `createShenronProvider`. Déclaré, il sert la génération du
chat du site (`/api/chat`, `chatAphrodyRag`) et du bot (`APHRODY_SHENRON_INFERENCE=http`) à la
place de `/llm/chat` ; la recherche RAG reste sur `aphrody-ai-http`. Aucune adresse par défaut ;
le modèle envoyé est `APHRODY_AI_CHAT_MODEL` (ou ses alias), sinon `gemma4-e2b`
(`DIRECT_CHAT_MODEL_ID` de `@aphrody/shenron-config/services`). Infra fournit l'adresse de boucle
locale du tunnel vers l'hôte GPU et l'identifiant réellement servi. Aucun modèle Gemma de base
ne reçoit l'identité `shenron-chat-v2` par simple renommage.

`APHRODY_AI_CHAT_API_KEY` est la clé privée du serveur amont ; alias lu ensuite :
`APHRODY_AI_CHAT_TOKEN`, `VLLM_API_KEY`, puis `SHENRON_OPENAI_API_KEY`. Les adaptateurs site/bot et le fournisseur AI SDK envoient
`Authorization: Bearer …` seulement à cet amont. Une clé contenant plusieurs lignes est
refusée avec le nom de la variable, sans sa valeur. Sans clé, les installations historiques
de boucle locale restent utilisables. Une URL de chat explicite active le modèle `chat`
même sans passerelle de calcul ; les embeddings, le RAG, l'OCR et la vision conservent
leur propriétaire et leur espace vectoriel.

Le serveur autonome relaie `/v1/models`, `/v1/chat/completions`, `/v1/responses` et
`/v1/responses/compact` sans traduire les événements ni fabriquer les capacités absentes.
`SHENRON_OPENAI_TOKEN` protège les clients distants du relais ; il reste distinct de la clé
amont et n'est jamais transmis au modèle. L'origine, le modèle et les secrets viennent
du fichier privé d'environnement qualifié par Infra.

Non lu par Shenron : `APHRODY_AI_VISION_BASE_URL` (la vision passe par `aphrody-ai-http`,
jamais directement par un serveur de modèle).

Autres variables Aphrody :

| Variable                                              | Rôle                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `RAG_BACKEND`                                         | `aphrody` (égalité exacte) : recherche, contexte et statistiques RAG par `aphrody-ai-http`. |
| `EMBED_TIMEOUT_MS`, `RERANK_TIMEOUT_MS`, `RAG_RERANK` | Délai du chemin chaud d'embedding, délai du reranker, `RAG_RERANK=0` coupe le rerank.       |
| `APHRODY_WEB_API_URL`, `APHRODY_BXC_API_TOKEN`        | API web/crawl d'Aphrody.                                                                    |
| `APHRODY_BIN`                                         | Chemin du CLI `aphrody` quand il n'est pas sur le `PATH`.                                   |

## Acquisition native des sources — bot Shenron

Le bot peut exécuter le pipeline de sources Bun dans son registre de tâches existant.
`SHENRON_SOURCE_PIPELINE_CONFIG` désigne un fichier privé régulier (permissions `0600`)
sous le répertoire de `DATABASE_PATH`, donc `/app/data` dans le conteneur de production.
`SHENRON_SOURCE_PIPELINE_INTERVAL_MS` fixe explicitement la cadence, entre 1 000 et
86 400 000 ms ; les deux variables sont nécessaires pour activer le traitement.
Sans configuration, aucune collecte ne démarre. Les variables restent dans le fichier
Infra privé `/etc/rose-griffon/shenron-bot.env`, déjà injecté dans le conteneur.
Le job `source-pipeline` effectue un premier cycle au démarrage, empêche les cycles
concurrents et est annulé puis attendu avant la fermeture des bases. Chaque cycle
utilise les sources et politiques épinglées du pipeline ; aucun contenu n'est promu
implicitement au canon. Les fichiers de configuration et reçus restent privés.

## Repérage des preuves Canon avec Bun Yolo

`SHENRON_CANON_YOLO_ENABLED=1` active le bouton de suggestion de citation sur
`/wiki/canon` et, à la demande, `/api/canon?q=…&assessEvidence=1`. La saisie et la
consultation seules ne déclenchent aucune inférence. Il faut un runtime qualifié
avec `bun:yolo`, le SDK `@aphrody/bun-runtime-sdk` avec son export `/yolo`, un
`TYPESAFE_API_KEY` privé et `SHENRON_CANON_YOLO_MODEL` explicitement choisi.
La clé reste exclusivement côté serveur dans la configuration Infra protégée.

`SHENRON_CANON_YOLO_MIN_CONFIDENCE` vaut `0.8` par défaut ; l'abstention est
calculée par le validateur natif. `SHENRON_CANON_YOLO_TIMEOUT_MS` vaut `3000`
(250 à 10 000 ms), sans nouvelle tentative. Chaque demande utilise au plus
16 citations visibles déjà présentes dans le corpus. Le serveur partage une
inférence active et conserve au plus 32 résultats pendant une minute.
Les nouvelles inférences utilisent les compteurs Redis atomiques existants, partagés
entre instances : `SHENRON_CANON_YOLO_PER_HOUR` (défaut 30, maximum 60),
`SHENRON_CANON_YOLO_PER_DAY` (défaut 120, maximum 1 440) et
`SHENRON_CANON_YOLO_MIN_SPACING_MS` (défaut 1 000, minimum 1 000 ms).
Ces réglages restent dans l'environnement serveur privé. Un compteur inaccessible
refuse l'inférence ; une réponse en cache ne consomme aucun quota. Le délai couvre
aussi l'admission et le chargement du fournisseur, sans annuler une demande partagée
lorsqu'un seul visiteur ferme sa connexion.
La doctrine curée demeure propriétaire des verdicts ; cette aide ne modifie ni
les citations, ni leur visibilité, ni les rangs. Une dépendance indisponible
laisse la consultation des preuves et le verdict fonctionner.

## Modèles de chat locaux (Shenron Studio) — `@aphrody/shenron-config/chat-model`, `apps/server/src/chat-model.ts`

Dans le profil `desktop`, sans URL de chat déclarée (`APHRODY_AI_CHAT_BASE_URL`,
`APHRODY_SHENRON_LLM_BASE_URL`, `APHRODY_LOCAL_MODEL_URL`) et avec `local` dans
`SHENRON_CHAT_BACKENDS` (défaut hors production : `local,gemini-web`), `shenron-server` lance
un seul `llama-server` enfant en mode routeur (un préréglage par modèle,
`$SHENRON_HOME/models/llama-presets.ini`, un modèle en mémoire à la fois, chargé à la demande)
sur un port de boucle locale, et pose `APHRODY_LOCAL_MODEL_URL` (et `APHRODY_AI_CHAT_MODEL` à
`shenron-chat-v2` s'il est absent). Modèles, par identifiant stable (`ChatRequest.model`) :

| Identifiant        | Modèle                                                                   | Provisionnement                                                                                                        |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `shenron-chat-v2`  | Qwen3-4B Instruct 2507 (GGUF Q4_K_M) + adaptateur LoRA `shenron-chat-v2` | Défaut. Base téléchargée au premier lancement ; adaptateur livré par l'installeur ou importé (aucune source publique). |
| `gemma4-e2b`       | Gemma 4 E2B instruct (GGUF Q4_K_M)                                       | Téléchargé après le défaut au premier lancement (`auto`), ou sur demande (`manual`).                                   |
| `gemini-web/flash` | Application web Gemini (distante), cookies Google d'Aphrody, sans clé    | Présent quand `aphrody-gemini-web` et un magasin de cookies existent (`~/.aphrody/google-cookies.json`…).              |

Les téléchargements passent par `aphrody model pull` (aphrody-models, magasin
`$SHENRON_HOME/models/aphrody`) quand le CLI `aphrody` est présent, sinon par le
téléchargeur du serveur : URL Hugging Face `resolve/<révision>` épinglée, reprise, SHA-256
vérifié, dans `$SHENRON_HOME/models/`. Un modèle déjà dans le magasin Aphrody de l'utilisateur
(`aphrody model path <id>`) est utilisé en place. Tous les modèles reçoivent le même prompt
système (persona de l'agent home, index du plugin `shenron`, mémoire).

`GET /api/v1/models` liste `models` (`ChatModelEntry` : `id`, `label`, `backend`,
`available`, `default`, `remote`, `state` `ready | loading | downloading | installable |
failed | unavailable`, `progress`, `installUrl`, `importUrl`, `detail`) et
`defaultModel`. Sur la machine seulement : `GET /api/local/models`,
`POST /api/local/models/gemma4-e2b/install` (téléchargement, 202) et
`POST /api/local/models/shenron-chat-v2/import` (`{ "path": "<adapter.gguf>" }`, empreinte
vérifiée, copie dans `$SHENRON_HOME/models/`). Le groupe `chat` de `/api/local/health` donne
l'étape du modèle par défaut (téléchargement en %, chargement, échec) puis les modèles servis.
L'installeur livre `llama/` (llama.cpp `b11312`, Vulkan) et `models/shenron-chat-v2.gguf`
(`scripts/build/desktop.ts`, `--skip-chat-model` pour s'en passer). Journal :
`$SHENRON_HOME/logs/llama-server.log`.

| Variable                     | Rôle                                                                                                                         | Défaut                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `SHENRON_CHAT_MODEL`         | `auto`, `off` ou chemin du GGUF de base. `auto` hors `desktop` l'active aussi (jamais en production).                        | `auto` en `desktop`, `off` sinon                                                     |
| `SHENRON_CHAT_MODEL_URL`     | Source de téléchargement de la base ; une source propre n'est pas vérifiée par empreinte.                                    | Hugging Face `unsloth/Qwen3-4B-Instruct-2507-GGUF`, révision épinglée                |
| `SHENRON_CHAT_LORA`          | Chemin de l'adaptateur, `off` pour la base seule.                                                                            | `$SHENRON_HOME/models/`, `models/` de l'installeur, puis `APHRODY_SHENRON_CHAT_LORA` |
| `SHENRON_CHAT_LORA_URL`      | Source de téléchargement de l'adaptateur (aucune publique : installeur ou import).                                           | aucune                                                                               |
| `SHENRON_GEMMA_MODEL`        | `auto` (téléchargé au premier lancement), `manual` (sur demande), `off` (absent de la liste) ou chemin du GGUF.              | `auto`                                                                               |
| `SHENRON_GEMMA_MODEL_URL`    | Source de téléchargement de Gemma 4 E2B (URL fournie pour le VPS, sinon la valeur provisoire).                               | Hugging Face `unsloth/gemma-4-E2B-it-GGUF`, révision `0314792` (provisoire)          |
| `SHENRON_GEMMA_MODEL_SHA256` | Empreinte de cette source ; sans elle, une URL propre n'est pas vérifiée.                                                    | empreinte épinglée du fichier Hugging Face                                           |
| `SHENRON_LLAMA_BIN`          | `llama-server` à lancer (fichier ou dossier), avant `APHRODY_LLAMA_BIN`.                                                     | `llama/` de l'installeur, puis le `PATH`                                             |
| `SHENRON_CHAT_CTX`           | Taille du contexte de chaque modèle.                                                                                         | `8192`                                                                               |
| `SHENRON_RESOURCE_DIR`       | Dossier des ressources de l'installeur (`llama/`, `models/`), posé par `shenron-desktop` ; sinon le dossier de l'exécutable. | dossier de l'exécutable                                                              |
| `SHENRON_PLUGIN_DIR`         | Plugin `shenron` (index dans le prompt de chaque modèle, `/api/public/plugin*`).                                             | `plugin/` du payload, à côté de l'exécutable, puis du dépôt                          |

Au build, l'adaptateur vient de `--chat-lora`, `SHENRON_CHAT_LORA` ou
`APHRODY_SHENRON_CHAT_LORA` et doit avoir l'empreinte épinglée ; les poids n'entrent jamais dans
Git.

## Traduction manga (Shenron Studio) — `crates/koharu-translator`, `crates/shenron-manga`

Le glossaire protège les termes canoniques pendant la traduction : chaque terme source reconnu
(le plus long d'abord, sans chevauchement) devient un jeton numéroté (`Zeta001`) que le moteur
recopie, puis la forme officielle le remplace ; un jeton que la table ne connaît pas fait
échouer la requête (`GlossaryTokens`) au lieu d'atteindre la planche. Le lexique canonique
(`data/lexicon/terms.json`, crate `shenron-lexicon`, paquet `@aphrody/shenron-lexicon`) est embarqué
dans les binaires et sert le français et l'anglais ; `docs/architecture/lexicon.md` décrit le
format et la fin de vie de `data/lexique-db-canonique.json`, désormais un fichier dérivé.

| Variable                 | Rôle                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KOHARU_GLOSSARY`        | Chemin d'un glossaire JSON lu par `Translator::from_config` (`Glossary::from_env`, `crates/koharu-translator/src/glossary.rs`) : ancien tableau `{ "source", "target" }` ou format du lexique. Un fichier posé mais illisible ou invalide est une erreur. Posée, elle remplace le lexique embarqué ; vide, elle ne retire pas le lexique Shenron. |
| `KOHARU_GLOSSARY_TARGET` | Langue cible du glossaire de `KOHARU_GLOSSARY` (`fr` ou `en`) ; une langue inconnue est une erreur. Défaut : toutes les langues cibles.                                                                                                                                                                                                           |
| `SHENRON_LEXIQUE`        | Chemin d'un lexique remplaçant celui qui est embarqué (`crates/shenron-manga`, fonctionnalité `koharu` de `shenron-mcp` et `shenron-cli`). L'ancien format ne s'applique qu'au français ; un fichier invalide est ignoré avec un avertissement. `shenron-server` le pose vers le fichier du payload quand il est absent.                          |
| `SHENRON_KOHARU_SDK_BIN` | Chemin explicite de `koharu-sdk` pour `shenron-server` (pont `/api/local/koharu` de l'éditeur en navigateur local). Défaut : le binaire voisin du serveur.                                                                                                                                                                                        |
| `KOHARU_SHENRON_URL`     | URL de l'API Shenron utilisée par `koharu-sdk` (équivalent de son option `--shenron-url`).                                                                                                                                                                                                                                                        |

Le build de `shenron-server` (`scripts/build/server.ts`) embarque `data/lexique-db-canonique.json`
dans son payload (extrait sous `$SHENRON_HOME/cache/payload-<id>/data/`). Les projets de l'éditeur
vivent sous `$SHENRON_HOME/data/koharu/projects`, ses modèles sous
`$SHENRON_HOME/cache/koharu/packages` ; les réglages restent dans `~/.koharu/config.toml`
(`koharu-config`, Aphrody, n'accepte pas d'autre emplacement).

## Mémoire persistante du chat — `@aphrody/shenron-config/memory`, `apps/server/src/memory.ts`

L'hôte de l'API (`shenron-server`, Shenron Studio) garde une mémoire par agent home dans le
fournisseur SQLite d'Aphrody (`aphrody-memory`, `SqliteLocalProvider`), atteint par
`shenron-ffi` (ABI 3, `@aphrody/shenron-native`). L'agent-id est celui de l'agent home de
l'utilisateur : `discord:<user_id>` quand l'utilisateur Discord est connu, `local` sinon ; le
même pour tous les modèles. À chaque tour, les souvenirs pertinents sont joints à la question
(comme données, jamais comme sources ni instructions) ; après la réponse, les faits saillants
du message (« je m'appelle… », préférences, « souviens-toi que… ») sont écrits.
`memoryOptIn: false` dans la requête de chat tient le tour à l'écart. Le résolveur d'agent
home choisit la base de chaque home (`memoryLocation` de `createLocalApi`, option de
`startBackend`) ; sans lui, toutes partagent le fichier par défaut. Les enregistrements
`shenron/<propriétaire>` de la première version sont déplacés une fois dans le home au premier
accès. Routes : `GET /api/v1/memory`, `POST /api/v1/memory/{id}/delete`,
`POST /api/v1/memory/clear` ; sans bibliothèque native, le groupe `memory` de
`/api/local/health` est indisponible et le serveur continue.

| Variable                | Rôle                                                                      | Défaut                            |
| ----------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| `SHENRON_MEMORY`        | `off` coupe la mémoire (rappel et écriture)                               | active                            |
| `SHENRON_MEMORY_DB`     | fichier SQLite par défaut (homes sans base propre ; créé en mode 600)     | `$SHENRON_DATA_DIR/memory.sqlite` |
| `SHENRON_MEMORY_RECALL` | souvenirs joints à un tour (0–20 ; 0 écrit sans rappeler)                 | `5`                               |
| `SHENRON_MEMORY_REMOTE` | `off` retire les souvenirs du prompt des backends distants (`gemini-web`) | active : tous les backends        |

## Chat du bot en messages privés — `@aphrody/shenron-config/dm-chat`, `apps/bot/src/events/DirectMessageRelay.ts`

Tout membre de la guilde `GUILD_ID` reçoit une réponse du modèle en DM (persona Shenron, agent
home `discord:<id>` et sa mémoire) ; un non-membre, banni compris, reçoit un refus unique. Le
modèle de production (Gemma 4 E2B sur CPU, environ 15 tokens/s) sert peu de requêtes à la fois :
chaque DM passe par une file globale bornée, un utilisateur n'a qu'une requête en cours et un
quota par fenêtre ; les owners ne sont pas limités et passent en tête de file. Pas de streaming
(le serveur de chat répond d'un bloc) : l'indicateur « en train d'écrire » reste affiché
pendant la génération. Textes visibles : `apps/bot/src/locales/{fr,en,ja}.json`, langue
détectée dans le message.

| Variable                     | Rôle                                                           | Défaut |
| ---------------------------- | -------------------------------------------------------------- | ------ |
| `SHENRON_DM_CHAT`            | `off` : seuls les owners obtiennent une réponse du modèle      | active |
| `SHENRON_DM_CONCURRENCY`     | générations simultanées, toutes conversations confondues (1–8) | `2`    |
| `SHENRON_DM_QUEUE_MAX`       | demandes en attente au-delà (0–200) ; position annoncée        | `20`   |
| `SHENRON_DM_USER_MESSAGES`   | réponses par utilisateur et par fenêtre (1–100)                | `5`    |
| `SHENRON_DM_USER_WINDOW_S`   | durée de cette fenêtre, en secondes (10–86400)                 | `600`  |
| `SHENRON_DM_TIMEOUT_S`       | délai d'une génération, attente en file exclue (5–600)         | `90`   |
| `SHENRON_DM_MAX_TOKENS`      | `max_tokens` envoyé au serveur de chat direct (32–2048)        | `320`  |
| `SHENRON_DM_MAX_CHARS`       | longueur de la réponse envoyée, coupée à une phrase (200–2000) | `1800` |
| `SHENRON_DM_MAX_INPUT_CHARS` | caractères du message gardés pour la génération (100–4000)     | `1000` |

Mémoire : celle de l'agent home (`aphrody-memory` via `shenron-ffi`), active seulement quand
`SHENRON_FFI_LIB` désigne la bibliothèque native ; fichier `SHENRON_MEMORY_DB`, sinon
`memory.sqlite` à côté de `DATABASE_PATH` (`SHENRON_MEMORY`, `SHENRON_MEMORY_RECALL` comme
ci-dessus). Sans elle, le chat répond sans mémoire persistante (l'historique Redis de session
reste).

## Bot Discord — `apps/bot/src/lib/env.ts`

Validées par zod ; un identifiant absent désactive la fonctionnalité concernée. Modèle commenté :
`apps/bot/.env.example`.

- Discord : `DISCORD_TOKEN_SHENRON` (repli `DISCORD_TOKEN`), `APPLICATION_ID_SHENRON`
  (repli `APPLICATION_ID`), `DISCORD_PUBLIC_KEY`, `GUILD_ID`, `OWNER_ID` / `OWNER_IDS`,
  `BOT_DEV_ID`. Les variantes `*_BEERUS`, `*_WHIS`, `*_GRAND_PRETRE`, `*_ENMA`, `*_KAIO` sont
  des alias de compatibilité : elles ne créent aucun client.
- Salons et rôles : `*_CHANNEL_ID`, `JAIL_ROLE_ID`, `URL_IN_BIO_ROLE_ID`,
  `TICKET_CATEGORY_ID`, `VOCAL_TEMPO_HUB_ID`, `SERVER_INVITE_URL`.
- API : `API_ENABLED`, `API_HOST`, `API_PORT`, `API_ADMIN_TOKEN`, `API_USER_SECRET`.
- Divers : `LOG_LEVEL`, `NODE_ENV`.
- Canvas : `SHENRON_BOT_ASSETS_DIR`, dossier de repli des polices et bannières livrées à côté
  du binaire (`share/` de `dist/bot/<cible>`, copié par `apps/bot/scripts/ship-canvas-assets.ts`).
  L'image le pose à `/usr/local/share/shenron-bot`, hors du montage `/app/assets` ; un fichier
  présent dans l'arbre source reste prioritaire. Emoji et CJK viennent des polices système
  de l'image (`fonts-noto-color-emoji`, `fonts-wqy-microhei`).
- Rendu des cartes (`apps/bot/src/render/pool.ts`) : les cartes sont dessinées par un pool de
  workers, `min(cœurs − 1, render.workers)` ; le réglage `render.workers` (`guild_settings`)
  prime sur `SHENRON_RENDER_WORKERS`, `0` dessine sur le fil principal. `SHENRON_RENDER_POOL=0`
  coupe le pool, `1` le force sous `bun test` (où il est coupé par défaut).
  `SHENRON_FRAME_CACHE_DIR` : copie disque des frames d'épisodes servant de fonds (défaut :
  `shenron-frames` dans le dossier temporaire du système), partagée par les workers et gardée
  entre deux redémarrages.

## File Web distribuée — `apps/bot/src/api/admin-web-queue.ts`

Le Compose de production fixe `SHENRON_ADMIN_PIPELINE_HOME=/app/data/admin-web-pipeline`, dans
le volume persistant du bot (`/srv/shenron/shared/bot/data`). Le fichier privé
`SHENRON_WEB_CRAWL_ENV_FILE` fournit `SHENRON_ADMIN_WEB_CONFIG=/run/aphrody/web-crawl/web.json`
et `APHRODY_VPS_MCP_HTTP_TOKEN` uniquement après la qualification du worker. Le fichier
`web.json` référence `/run/aphrody/web-crawl/vps-mcp.toml`; ces fichiers proviennent du dossier
`SHENRON_WEB_CRAWL_CONFIG_DIR`, monté en lecture seule.

Le fichier d'environnement peut rester vide avant la qualification : sans
`SHENRON_ADMIN_WEB_CONFIG`, le bot ne construit pas la file distribuée. Ne jamais mettre le
bearer, le JSON web ou la configuration MCP dans Git ou dans l'image. Le host doit garder les
fichiers privés et fournir le bearer au conteneur sans l'imprimer dans les journaux. Seul un
`workerReady: true` après sonde MCP authentifiée et vérification du rendu rend une action
disponible.

## Activité « Arène Shenron » — `@aphrody/shenron-config/env` (`ACTIVITY_ENV`), `apps/bot/src/api/activity.ts`

Le serveur de l'Activité ne crédite jamais rien : il signe un reçu de règlement et le bot le
vérifie, applique ses plafonds et verse (`docs/products/bot-discord-refonte.md` §7.2).

| Variable                  | Où                    | Rôle                                                                                                                                                                        |
| ------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHENRON_ACTIVITY_SECRET` | bot et serveur        | Clé HMAC-SHA256 des reçus (16 octets au moins, secret **distinct** de `API_USER_SECRET`). Absente ou trop courte : `/api/activity/settle` répond 503 `not_configured`.      |
| `SHENRON_ACTIVITY_TOKEN`  | bot et serveur (opt.) | Jeton porteur du serveur de l'Activité sur `/api/activity/*`. Sans lui, seul `API_ADMIN_TOKEN` est accepté ; les deux sont toujours acceptés quand le jeton dédié est posé. |

- Les routes `POST /api/activity/settle` et `GET /api/activity/budget/{userId}` ne sont jamais
  publiques : jeton porteur obligatoire (503 si aucun jeton n'est configuré, 401 sinon).
- Réglages du bot (`/config`, table `guild_settings`) : `activity.enabled` (lancement par
  `/arena`, `false` tant que l'application n'est pas vérifiée), `features.games.arena`
  (interrupteur des gains, `true`), `activity.daily_budget` (zénis de jeux par membre sur 24 h,
  600, au plus 5 000), `activity.min_account_days` (7) et `activity.min_level` (2, gains de zénis
  seulement).

### Serveur de l'Activité — `apps/activity/src/config.ts`

`bun apps/activity/src/main.ts` (ou le binaire de `bun run --filter @aphrody/shenron-activity-app compile`)
lit l'environnement une seule fois. Une variable absente désactive la capacité concernée sans arrêter
le serveur : `GET /health` répond 200 avec `status: "degraded"` et dit laquelle (`client`, `oauth`,
`settlement`). Les secrets ne sont jamais journalisés ni renvoyés au client.

| Variable                      | Rôle                                                                                                                                                                                                                                    | Défaut                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `DISCORD_CLIENT_ID`           | Identifiant (snowflake) de l'application Discord, le même que `APPLICATION_ID_SHENRON` du bot. Public : `GET /api/config` le donne au client, qui construit le SDK avec.                                                                | aucun : connexion impossible                               |
| `DISCORD_CLIENT_SECRET`       | Secret OAuth2 de l'application, utilisé seulement par `POST /api/token` pour échanger le `code` de `authorize()` contre un jeton (`https://discord.com/api/oauth2/token`). Ne sort jamais du serveur.                                   | aucun : `/api/token` répond 503 `not_configured`           |
| `SHENRON_ACTIVITY_SECRET`     | Clé HMAC des reçus (voir ci-dessus, 16 octets au moins). Le serveur signe chaque fin de manche qui paie quelqu'un.                                                                                                                      | aucun : les reçus sont journalisés puis abandonnés         |
| `SHENRON_ACTIVITY_TOKEN`      | Jeton porté en `Authorization: Bearer` vers l'API du bot (voir ci-dessus).                                                                                                                                                              | aucun : le bot refuse (401, nouvel essai plus tard)        |
| `SHENRON_BOT_API_URL`         | Base de l'API du bot pour `POST /api/activity/settle`, sans barre finale.                                                                                                                                                               | `http://${API_HOST}:${API_PORT}` du bot (`127.0.0.1:5006`) |
| `SHENRON_ACTIVITY_HOST`       | Interface d'écoute (le proxy inverse de l'hôte de l'Activité la joint).                                                                                                                                                                 | `127.0.0.1`                                                |
| `SHENRON_ACTIVITY_PORT`       | Port d'écoute (0 : éphémère, pour les tests).                                                                                                                                                                                           | `5013`                                                     |
| `SHENRON_ACTIVITY_PUBLIC_URL` | Origine publique de l'hôte, par exemple `https://activity.dragonballfr.com` ; ajoutée sous sa forme `wss://` à `connect-src` de la CSP. Dans Discord, la CSP nomme déjà `wss://*.discordsays.com`.                                      | aucun                                                      |
| `SHENRON_ACTIVITY_DIST`       | Dossier du client construit (`bun run --filter @aphrody/shenron-activity-app build`). Ignoré par le binaire compilé, qui embarque ses fichiers.                                                                                         | `apps/activity/dist/client`                                |
| `SHENRON_ACTIVITY_DEV_AUTH`   | `1` : accepte les identités de développement du faux SDK (`?mock=1`, `bun run dev`). Le serveur refuse de démarrer avec `NODE_ENV=production` ou sur une interface autre que la boucle locale ; ne jamais le poser sur un hôte déployé. | désactivé                                                  |

- Aucun de ces secrets n'est un jeton de bot : l'Activité ne détient jamais celui du bot.
- Un reçu que le bot ne peut pas encore régler (endpoint absent : 404, bot arrêté, 5xx, 429, ou
  configuration en cours : 401, 403, 503) reste dans une file bornée en mémoire (100 reçus, deux
  heures), réessayée avec un délai de 5 s doublé jusqu'à 5 min ; chaque essai signe une nouvelle
  fenêtre de validité et garde les mêmes clés d'idempotence, donc un essai répété ne paie jamais deux
  fois. Un refus du reçu lui-même (400, 409, 410, 422) l'abandonne. La file n'est pas persistée : un
  redémarrage perd les reçus en attente (des gains non versés, jamais des gains versés deux fois).
- En-têtes : jamais d'`X-Frame-Options` ; une CSP dont `frame-ancestors` nomme `discord.com`,
  `*.discord.com` et `*.discordsays.com`. Le HTML est servi `no-store`, les autres fichiers (noms
  hachés) `immutable`, car le proxy de Discord retire les en-têtes de cache des réponses HTML.
