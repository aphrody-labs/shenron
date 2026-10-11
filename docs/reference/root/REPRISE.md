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
