# ADR 0009 : Auto-hébergement Rust intégral, sans PaaS, Docker, SSH ni nginx

- **Statut** : Accepté
- **Date** : 2026-11-19
- **Décideurs** : aphrody-dev
- **Pilier(s) concerné(s)** : deploy, apps, crates, CI, hôtes `prd`, `fr1`, `fr2`
- **Remplace** : la bascule « Cloudflare Workers, Vercel, Neon, quota-guard » du commit `b16dc8ee`

## Contexte

Le 2026-11-19, dragonballfr.com passait par Cloudflare, puis le répartiteur nginx de `fr2`, puis Vercel (poids 100) avec `prd` en secours. Trois pannes en production venaient de cette chaîne :

1. Neon (projet `shenron-overflow`) refusait toutes les requêtes avec « exceeded the quota » : `/api/me` en 500, `/news`, `/rankings` et la page d'accueil sans données.
2. `/_next/image` répondait 404 : le HTML rendu par Vercel pointait vers l'optimiseur, mais nginx envoyait ce chemin à `prd`, qui est construit avec `SHENRON_IMAGES_UNOPTIMIZED=1`. Résultat : toutes les images de l'accueil étaient cassées.
3. Le Worker `shenron-bot` capturait `bot.dragonballfr.com/*` et renvoyait 404 sur l'API publique du bot (`/api/openapi.json`), alors que `prd` la sert (200). Discord passe par la gateway (`interactions_endpoint_url` vaut null), donc ce Worker ne servait à rien.

Correctifs appliqués en direct le 2026-11-19 :

- Le pool `fr2` ne contient plus que `prd` (`127.0.0.1:18082`). Les caches nginx SSR et images ont été vidés, ainsi que le cache Cloudflare.
- Les routes Workers `bot.` et `ai.` sont supprimées, ainsi que les scripts `shenron-bot` et `shenron-ai` et l'enregistrement DNS `ai.`.
- Le projet Vercel `shenron-site` est supprimé.
- Le projet Neon `shenron-overflow` reste en place sans aucune référence. Ses données ne sont pas lisibles tant que le quota bloque le calcul. Il faut l'exporter après la remise à zéro du quota, comparer avec `prd`, puis le supprimer.

Le propriétaire demande d'aller au bout : une infrastructure de bout en bout en Rust, hébergée sur nos propres machines, sans PaaS (Vercel, Neon, Workers), sans Docker, sans SSH ni `git pull` pour déployer, et sans nginx.

## Décision

Chaque brique tierce est remplacée par un binaire Rust supervisé par systemd sur la flotte (`prd` production, `fr1` build et artefacts, `fr2` bord et tests). L'ordre de bascule est celui de l'ADR 0004 (étrangleur) : à chaque étape, l'ancien chemin reste disponible jusqu'à ce que le nouveau soit prouvé en production.

| Brique actuelle | Remplacement Rust | Hôte |
| --- | --- | --- |
| nginx (`fr2` LB, `prd` vhosts), certbot | `shenron-edge` : Pingora (proxy, cache disque, répartition, contrôles de santé) + rustls + ACME (`instant-acme`) | `fr2`, `prd` |
| `cloudflared` (tunnels) | WireGuard noyau entre hôtes (déjà en place sur `10.200.77.0/24`), `shenron-edge` exposé en direct | tous |
| Docker et compose | binaires statiques (musl) dans `/opt/shenron/releases/<version>`, unités systemd durcies (`DynamicUser`, `ProtectSystem=strict`, `MemoryMax`, `CPUQuota`) | tous |
| SSH et `git pull` pour déployer | `shenron-deployd` : agent qui tire un manifeste signé (ed25519), télécharge les artefacts, vérifie le sha256, bascule le lien `current` de façon atomique, contrôle la santé, puis revient en arrière en cas d'échec. Pilotage par une API mTLS, plus aucun shell distant | tous |
| GitHub Actions hébergées par GitHub | runner auto-hébergé sur `fr1` (`cargo build --release`, tests), qui publie les artefacts et le manifeste signé | `fr1` |
| Cloudflare R2 et Worker `shenron-cdn` | Garage (stockage objet S3 écrit en Rust) répliqué sur trois nœuds, servi par `shenron-edge` sur `cdn.` | `fr1`, `fr2`, `prd` |
| Vercel (Next.js SSR, optimiseur d'images) | `crates/shenron-site` : Leptos SSR sur Axum (ADR 0001), variantes AVIF/WebP précalculées à la publication (`image` / `ravif`) | `prd` |
| Neon | PostgreSQL natif sous systemd sur `prd`, sauvegardes `pg_basebackup` + WAL vers Garage | `prd` |
| Redis | cache en mémoire (`moka`) et limiteur de débit dans le processus. Les files de tâches passent en tables Postgres (`SKIP LOCKED`) | `prd` |
| Bot discordx | `crates/shenron-bot` (twilight : gateway, commandes) | `prd` |
| Workers AI et Vectorize | `shenron-rag` + `shenron-rag-core` (déjà en Rust), modèles servis localement | `prd`/`fr1` |
| Observabilité (Vercel, Workers) | `tracing` + OpenTelemetry vers OpenObserve (Rust), avec les journaux et métriques sur `fr2` | `fr2` |
| Secrets en variables de plateforme | fichiers chiffrés `age` (rage) livrés par `shenron-deployd`, déchiffrés en `tmpfs` au démarrage | tous |
| DNS et proxy Cloudflare | dernière étape : DNS autoritaire Hickory DNS sur deux hôtes, anti-DDoS OVH sur les IP publiques | `fr2`, `prd` |

Hors du périmètre : PostgreSQL reste en C, faute d'équivalent Rust prêt pour la production. Git reste l'outil de gestion des sources sur GitHub, mais aucun serveur n'en a besoin. Le courrier reste chez OVH (MX).

## Étapes et critères de sortie

| # | Étape | Sortie prouvée par |
| --- | --- | --- |
| 0 | Purge Vercel, Neon et Workers dans le code et les comptes (fait le 2026-11-19, sauf l'export Neon) | `git grep -iE 'vercel\|neon'` ne renvoie que des mentions historiques, le site répond 200 sans `x-vercel-id` |
| 1 | `shenron-deployd` + manifeste signé + runner `fr1` | un déploiement de `shenron-tv` (déjà en Rust) sans SSH, puis un retour arrière forcé réussi |
| 2 | Sortie de Docker : Postgres et Redis natifs, chaque service en unité systemd | `docker ps` vide sur `prd`, la sauvegarde restaurée sur `fr2` |
| 3 | `shenron-edge` remplace nginx sur `fr2`, puis sur `prd`, avec le même cache et les mêmes en-têtes (CSP, HSTS, `link`) | diff d'en-têtes vide sur un échantillon d'URL, nginx désinstallé |
| 4 | Garage remplace R2 et le Worker `shenron-cdn` | `cdn.` servi par `shenron-edge`, 0 objet manquant sur le manifeste de publication |
| 5 | Redis retiré (moka, files Postgres) | `REDIS_URL` absent de tous les services |
| 6 | Bot en Rust (`shenron-bot`) | unité `bot` en `rust` dans `migration/rust.toml` |
| 7 | Site en Rust (Leptos), route par route derrière `shenron-edge` | unité `site` en `rust`, Next.js supprimé |
| 8 | Sortie de `cloudflared` et du proxy Cloudflare (Hickory DNS, anti-DDoS OVH) | zone servie par nos NS, plus aucun appel à l'API Cloudflare |

Les étapes 1 à 5 sont de l'infrastructure (quelques semaines). Les étapes 6 et 7 correspondent aux 380 000 lignes TypeScript du registre de l'ADR 0004 et suivent son cliquet.

## Options considérées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| Auto-hébergement Rust intégral (retenue) | coût fixe, aucun quota tiers, une seule chaîne de compilation, contrôle complet | DDoS et TLS à notre charge, astreinte sur trois hôtes |
| Garder Vercel, Neon et Workers avec un garde-fou de quotas | moins d'exploitation | trois pannes en production le même jour, logique de repli complexe (`quota-guard`) |
| Kubernetes (k3s) au lieu de systemd | ordonnanceur standard | Go, pas Rust, et trop lourd pour trois hôtes |

## Conséquences

- Positives : plus aucune panne due à un quota tiers ; un seul langage du bord jusqu'aux services ; déploiements reproductibles et signés ; plus d'accès shell nécessaire en production.
- Négatives : il faut écrire et maintenir `shenron-edge` et `shenron-deployd` ; la protection DDoS dépend d'OVH à l'étape 8.
- Versions de référence : [`docs/research/rust-stack-2026-11-19.md`](../research/rust-stack-2026-11-19.md) (relevé daté, à relancer avant de figer une dépendance). Avancement par étape : `.claude/goal.json` et `migration/rust.toml`.
- Suivi : défaut restant côté client, l'erreur React #418 (hydratation) sur l'accueil, à corriger dans `apps/site` puis à vérifier dans `crates/shenron-site`.

## État mesuré au 2026-11-19 (annexe datée)

Relevé fait en fin de journée ; il ne remplace pas la décision, il dit où l'écrit et la réalité divergent.

- **Garage** : le cluster compte deux zones actives (`fr1`, `fr2`, facteur de réplication 2). `prd` a rejoint puis a été arrêté après une coupure de ses tunnels WireGuard pendant la resynchronisation (`docs/runbooks/cdn-garage-cutover.md`). Le tableau ci-dessus écrit « trois nœuds » : c'est la cible, pas l'état.
- **Site** : la ligne « Vercel » du tableau et l'étape 7 prévoient Leptos (ADR 0001), alors que l'ADR 0008 remplace Leptos et Dioxus par `gpui-kit`. Les deux textes se contredisent ; la décision est ouverte, voir `docs/plans/base-ui-vers-gpui.md`. Les pages publiques doivent rester rendues côté serveur en HTML (indexation, lecteurs d'écran), ce qu'un canevas GPUI ne fournit pas.
- **Déploiement** : `shenron-deployd` (manifestes signés, bascule atomique, retour arrière) est prouvé sur `fr2` avec un service factice ; `.github/workflows/server-artifact.yml` reste inerte tant que `AUTO_DEPLOY_ENABLED` n'est pas `true`. La construction domine le délai : le build de l'image du 2026-11-19 a tourné plus de 39 minutes (12:25 à 13:04) avant d'être arrêté, sur un hôte chargé. Un déploiement en une minute après un push suppose des artefacts déjà construits et signés par CI ; la minute ne couvre que téléchargement, vérification et bascule.
- **Dépendances Rust déjà retenues** (relevé `docs/research/rust-stack-2026-11-19.md`) : `pingora` 0.9.1, `rustls` 0.23.46, `instant-acme` 0.8.5, `ed25519-dalek` 3.0.0, `axum` 0.8.9, `tokio` 1.54.1. Aucune nouvelle brique n'est à écrire quand une crate publiée couvre le besoin.
