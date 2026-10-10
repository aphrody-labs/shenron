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
