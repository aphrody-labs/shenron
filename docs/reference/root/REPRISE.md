<!-- SPDX-License-Identifier: Apache-2.0 -->
# Reprise : Chantiers Ouverts

> Lu au démarrage de chaque session (hook `scripts/dev/session-start.ts`).
> Référence canonique et unique de planification : [PLAN.md](PLAN.md).

## Chantiers Actifs en Cours

1. **Reverse Engineering Dragon Ball (`shenron-re`)** :
   * Consolidation du décodage CPK, CRILAYLA et formats de combat Dimps (BAC/BDM/CUS/PUP/MSG) [x].
   * Pipeline WASM/TypeScript opérationnel (20 tests Rust + 9 tests WASM validés).
   * 2026-10-10 : fusion de rescue/vps-home-shenron sur main (1874f332), extraction CPK/EMB et validations Xenoverse 3 conservées ; tests shenron-re natifs Windows verts (53 unitaires + 5 CLI).
   * Raccordement des données de techniques extraites au VFS et à l'API publique.
2. **Entraînement Continu Shenron Chat (`shenron-chat-v2`)** :
   * Exécution itérative de `scripts/ops/train-shenron-chat-loop.ts` sur les 1 495 rollouts partitionnés.
   * Suivi du Recall@5 sur les 1 091 cas cibles gold sans fuite de données.
3. **Packaging Shenron Studio (Tauri 3 / CEF)** :
   * Signature, détection dynamique des cibles GPU (CUDA/WARP) et qualification de l'installeur NSIS.
4. **Surveillance Production & Qualité** :
   * Maintien des gates vertes (`bun run typecheck`, `bun run lint`, `openapi.ts --check`).
   * Vérification continue de la santé de `https://dragonballfr.com/api/health` et de l'Agent Card A2A 1.0.
   * Prod Docker (2026-10-08) : builds sur le vps seulement, dbfr reçoit l'image scellée ; pile locale `compose.complete.yaml` alignée (pgvector pg18, passerelle compose, bot opt-in `--profile discord`), sondes 200. Le 2026-10-10, correction soft-404 poussée sur main (e456b096) avec sonde de release 404 ; la production restait à redéployer (slug absent encore en 200 lors du contrôle). Débit du LLM à requalifier.
5. **Conteneurisation Complète DBFR** :
   * Conteneur unique tout-en-un (`deploy/docker/all-in-one/`) et pile Compose (`deploy/docker/compose.complete.yaml`).
   * Intégration des secrets Aphrody (`scripts/ops/container-secrets.ts`), initialisation DB/migrations (`scripts/ops/container-db-init.ts`), surveillance OVH (`scripts/ops/ovh-shenron.ts`) et CLI unifié (`just container-*`).
   * Référence : [CONTAINER-COMPLET.md](../../operations/CONTAINER-COMPLET.md).
6. **Tunnel & Automatisation** :
   * Tunnel de dev vers le vps : `bun scripts/dev/env-pull.ts tunnel --host vps` (seul propriétaire) ; réseau wg1 : `aphrody infra wg` (dépôt Aphrody).
   * Aucun déploiement continu : le déploiement appartient à aphrody-infra.
   * À faire : ingestion RAG des captures du crawl officiel ; vrai entraînement (LoRA/SFT) — `train-shenron-chat-loop.ts` ne fait que générer et évaluer des rollouts.
7. **Connecteurs Multi-Agents (Codex, AGY, Claude Code, Omar)** :
   * Serveurs MCP (`aphrody-mcp` port 8793, `shenron-mcp` port 8790 / public `/mcp`) et A2A (`aphrody-a2a` port 8788, public `/api/a2a`).
   * Configurations d'agents (`scripts/ops/setup-agent-connectors.ts`, `just setup-connectors`).
8. **Secrets** :
   * Env de dev : `scripts/dev/env-pull.ts` (seul propriétaire, retire le jeton Discord de prod) ; secrets du conteneur : `scripts/ops/container-secrets.ts`.
9. **Lecteurs Médias & Rendu Canvas** :
   * Lecteurs Manga (`?edition=couleur|color` via `colorisationDemandee`, réinitialisation de page au changement de chapitre), Databooks (pages libérées après échec ou démontage), Épisodes vidéo (probing, langue, nettoyage audio).
   * `ShenronCanvasEngine` (`packages/engine/src/unified_canvas.ts`) : particules Ki en WebGPU avec repli Canvas 2D, planches manga procédurales en Canvas 2D ; composant `ShenronGpuCanvas`, fond `KiCanvas.tsx`, vitrine `/canvas`.

## 2026-10-11 — Fusion Omar et gates Shenron
- Fusion de origin/omar/integration-20261011 (66adf88d) dans main, merge 447eeeaa ; fix lint 31b1a9b3, les deux poussés. Lint, typecheck, format et OpenAPI verts ; aucun test lancé.
- Release DBFR en attente : Bun sur les hôtes VPS/DBFR 1.4.3-aphrody.4 ; image partagée aphrody-build:latest 1.4.3-aphrody.2 ; manifeste Shenron épinglé 1.4.3-aphrody.2. Le checkout Bun documente un candidat Linux 1.4.4-canary.1 (988d73b43), qualifié sur des suites ciblées et présent dans un répertoire isolé DBFR, mais aucune release stable bun-v1.4.4 n'est publiée et la fabrique n'a pas ce candidat. Ne pas qualifier ce candidat comme release stable. Reprendre après disponibilité du candidat sur le VPS et adaptation de l'image de build, ou publication stable.

## 2026-10-11 — Optimisation Cloudflare TLS/latence
- Réglages vérifiés sur la zone `dragonballfr.com`: HTTP/3, TLS 1.3, Brotli et HTTP/2 vers l’origine actifs; minimum TLS 1.2; SSL strict. Early Hints activé via API Cloudflare (200). 0-RTT laissé désactivé vu les routes applicatives non idempotentes.
- La zone est encore `pending`; la délégation publique et le serveur observé restent OVH (`dns109.ovh.net`, `ns109.ovh.net`). `curl.exe` reçoit `Server: nginx`, HTTP/1.1, sans `cf-ray`; aucun réglage Cloudflare ne peut réduire le trajet effectif avant délégation. Échantillons publics: `/` total 0,44–0,65 s (TTFB 0,31–0,49 s), `/api/health` 0,10–0,13 s (TLS 0,067–0,080 s). Ce ne sont pas des mesures de charge.
- Le résolveur public n’a plus retourné de DS; les NS apex OVH ont TTL observé 3600 s. La délégation attend toujours la fenêtre de cache de 24 h après retrait du DS (échéance estimée 2026-10-12 10:25 Europe/Paris), puis contrôle frais du parent, de la parité des enregistrements et de l’accès registrar avant mutation.

## 2026-10-11 — Reprise DNS, CDN et incidents DBFR
- DNSSEC : le DS est absent des réponses parentales actuelles, mais il a été retiré aujourd’hui et son ancien TTL observé était de 86 400 s. Il n’y a pas de raccourci sûr : des validateurs peuvent encore cacher le DS et retourner SERVFAIL après délégation. NS observés : `dns109.ovh.net`, `ns109.ovh.net`; Cloudflare reste `pending`, NS attendus `duke.ns.cloudflare.com`, `veda.ns.cloudflare.com`. Le client OVH Aphrody envoyait le mauvais champ (`nameServers` au lieu de `nameServer`); correctif `12ae5f7f7` poussé dans Aphrody, test Rust 60/60 et Clippy strict verts. La CLI locale reconstruite confirme le plan de délégation, sans mutation; attendre l’échéance DS puis refaire parent + parité.
- Cloudflare R2 : bucket dédié `shenron-cdn` créé vide, région WEUR, classe Standard, accès `r2.dev` désactivé et aucun domaine personnalisé attaché. Domaine custom et exposition restent après activation zone et inventaire explicite des assets.
- DBFR : audit live du 11/10, 6.4 Gio RAM disponibles, 25 Gio disque libre, conteneurs healthy lors du relevé. OOM corrélé à `shenron-bot` (limite 512 Mio, RestartCount 33 cumulatif, dernier OOM/redémarrage corrélés) et `shenron-server`/Next (768 Mio, code 137 puis ECONNRESET localhost). Profiler les pics et traiter via propriétaire Aphrody Infra; pas de redémarrage/purge automatique. Images et volumes protégés.
- Bun : VPS et DBFR restent en 1.4.3-aphrody.4; le candidat 1.4.4-canary.1 isolé sur DBFR est non stable, absent du builder; aucune release stable publiée. Claims release actifs, attendre les artefacts stables et leurs gates.

## 2026-10-11 — Exécution de GOAL.md : inventaire du catalogue

- PostgreSQL DBFR relu en transactions READ ONLY : 826 épisodes (SDBH/ARALE absents), 254 volumes, 480 notices databook, 8 éditions ja/fr, 32 événements de chronologie. Manifeste privé des 11 lots et identifiants : `var/reports/catalog-expansion/coverage-2026-10-11.json`, état initial dans `baseline-2026-10-11.json`.
- Les 18 volumes Sōshūhen 701–718 correspondent par ISBN aux notices databook 465,469–485 masquées ; conserver les identifiants. Quatre paires d'éditions identiques (1/5,2/6,3/7,4/8) et la couverture Full Color 32/42 exigent une réconciliation des supports avant correction.
- Collecte primaire et audit des routes réalisés ; trois corrections ISBN Kanzenban préparées, non exécutées. Le writer media_* et les champs de langue/sous-titres/source des épisodes manquent dans le CRUD inspecté. Aucune écriture catalogue, OCR ou traduction, aucun import ni déploiement.
- Bun stable 1.4.4 reste indisponible : Windows, VPS et DBFR utilisent 1.4.3-aphrody.4 ; aucune installation figée ni gate Bun du goal exécutée. Gel databooks maintenu dans le plan, fichier local absent, aucune levée établie. Aucun accès admin utilisable dans l'environnement de cette session. Prochaine étape : runtime qualifié, writer propriétaire complet et accès éditorial, puis lots dédupliqués et livraison Infra.

## 2026-10-11 — Catalogue : collecte étendue et code préparé

- Collecte privée supplémentaire : 82 notices de mangas dérivés, dont sept ISBN déjà présents, et 48 épisodes SDBH identifiés par ID vidéo officiel ; 47 dates d'annonces confirmées. Les spéciaux, bandes-annonces et placeholder sont séparés. Pas de numérotation globale inventée ni de disponibilité VOST déduite. Listes Toei Dr. Slump refusées en HTTP 403 ; aucune liste individuelle collectée.
- Changements source préparés, non committés : CRUD `media_*` avec identifiants PostgreSQL, déduplication ISBN-10/13 et notices sans ISBN, restauration historique dédiée ; validation des métadonnées d'épisodes et snapshots JSON ; VF/VOSTFR/VOST distincts dans lecteurs, API, offres et badges, libellés fr/en/ja. Les sources sans version connue restent séparées. Les écritures génériques de pages databook sont refusées pendant le gel.
- Diagnostics TypeScript 7.0.2 natifs site et paquet DB réussis après correction ; relecture indépendante et contrôle du diff réalisés. Cela ne remplace pas les tests Bun, lint, format, contrats ni une preuve PostgreSQL réelle. Tests préparés, aucune suite Bun exécutée avec le runtime 1.4.3.
- Bun stable 1.4.4 et accès éditorial manquent toujours ; l'API admin répond 403 depuis Windows et DBFR. Aucun ajout catalogue, OCR, traduction, import, build ou déploiement. Reprendre les gates avec le runtime requis, puis relire les candidats contre PostgreSQL avant les lots éditoriaux et la livraison Infra.

## 2026-10-11 — Qualification effective et extension Cloudflare/SQL

Les notes précédentes sur l'attente Bun et l'accès admin décrivent un état antérieur : Bun 1.4.4 debug Windows et canary Linux sont désormais isolés, installation figée et gates Linux complètes vertes. Source principale f034c7e3, garde native 9fb19e97, commits vérifiés sur origin/main. Qualification Windows toujours en cours : délais de tests adaptés au debug, seuils de performance conservés, DLL RE en construction sur la fabrique. Image de production au SHA 9fb19e97 en construction dans un worktree isolé ; aucune nouvelle activation déclarée.

Trois ISBN Kanzenban corrigés par API admin et vérifiés par PG/révisions/public ; réplica synchronisé via le script propriétaire, zéro divergence sur les neuf colonnes comparées. Séquence bot.db_databooks_id_seq réparée via Infra : prochain ID attendu486, 480 lignes/max485 et empreinte inchangés. Création de l'artbook Dragon Quest non encore réessayée après réparation. Gel OCR/traduction conservé.

L'utilisateur a ajouté explicitement la consolidation SQL/doublons et la migration du CDN Shenron sur Cloudflare, puis le setup complet du CLI Cloudflare sur SSH DBFR (R2, Worker, DNS, tunnel et automatisation). Inventaire RO :127 tables,126PK,43FK,1099536 lignes. Quatre aliases d'éditions proposés ; aucun regroupement de tables exécuté. Source/provenance/RAG/conversations et sauvegardes ne sont pas des doublons par seule similarité.

Wrangler4.149.0 installé via Bun sur DBFR, cloudflared2026.10.0 présent, profil CLI non authentifié. Bucket R2 shenron-cdn vide au début du lot, zone dragonballfr.com pending. Tunnel shenron-dbfr créé et configuré, credential au store protégé DBFR sans valeurs dans les notes. Worker préparé : allowlist manifests, corps dédupliquésSHA256, validation checksum, bootstrap borné, ranges/304 et CORS ; aucun DNS modifié. Inventaire CDN initial88589 fichiers/86995 contenus uniques,32,7Go logiques/31,7Go uniques. Relevé complémentaire en cours pour les formats audio/Markdown, fichiers vides et aliases historiques. Prochaine étape : services Infra, qualification Worker/R2 et transfert vérifié, authentification CLI et bascule DNS contrôlée.


## 2026-10-11 — Livraison effective et stockage Cloudflare en cours

La release 9fb19e97 est activée par Infra : six services sains, vraie réponse chat HTTP200 et API catalogues200. L'image de rollback manquante a été reconstruite depuis son Dockerfile canonique et qualifiée. Les slugs HTML inexistants restent en200 ; ce contrôle n'est pas terminé. Les corrections Windows 640e2b50/a52985ff passent leurs suites ciblées ; deux benchmarks de performance debug restent rouges, seuils conservés. DLL RE Windows réelle : 29 tests verts.

Le propriétaire a explicitement levé les gels Shenron. Configuration frozen:false protégée et activation Infra vérifiées ; la route de transcription non authentifiée répond désormais401. Artbook Dragon Quest créé par API sous ID486, PG/révision/public relus ; le champ ISBN existant manque encore au mapping applicatif et fait l'objet du lot suivant.

Quatre aliases d'éditions ont été appliqués via migration Infra scellée et ledger SHA256 : 8 éditions et84 volumes inchangés, sauvegarde/restauration et replay qualifiés ; source ad7387dc poussée. Le Worker CDN a été publié en qualification, ranges/checksum/HEAD réels et9 tests97 assertions verts ; correctif a66a3dc6 poussé. La production CDN n'a pas encore basculé.

Credential Cloudflare natif existant réutilisé depuis son store, CLI authentifiée ; tunnel sain, audit journalier actif. S3 Shenron fonctionne en local et DBFR avec credentials temporaires limités aux préfixes _objects/ et _migration/, DPAPI Windows et profils DBFR root0400 ; renouvellements automatiques qualifiés. Infra source8paths publiée27433582 ; la validation récente conserve l'erreur de baseline omar-redis unknown topology host local, aucune nouvelle erreur Cloudflare. Copie R2 en cours : inventaire110014routes/87149corps,31,7Go uniques, reprise durable par reçus SHA256,64workers et mémoire bornée256MiB. La session S3 doit être rechargée même si accessKeyId ne change pas lors du renouvellement.

Avant bascule : capturer le delta Next public/static après la livraison finale (payload9fb actuel26a900da33b98a54, inventaire initial864f7d6307167794), préserver les anciens chunks et les routes CDN dynamiques, vérifier tous les objets, désactiver import et vérification mutable du Worker. Zone Cloudflare pending ; parent DNS sans DS au contrôle live, délégation OVH inchangée. OVH domain info accessible, dns info échoue sur missing field isSigned : corriger le contrat propriétaire ou utiliser une route propriétaire qualifiée, sans confondre lecture et droit de mutation. Aucun secret dans ces notes.
