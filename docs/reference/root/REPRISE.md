<!-- SPDX-License-Identifier: Apache-2.0 -->
# Reprise : Chantiers Ouverts

> Lu au démarrage de chaque session (hook `scripts/dev/session-start.ts`).
> Référence canonique et unique de planification : [PLAN.md](PLAN.md).

## Chantiers Actifs en Cours

1. **Reverse Engineering Dragon Ball (`shenron-re`)** :
   * Consolidation du décodage CPK, CRILAYLA et formats de combat Dimps (BAC/BDM/CUS/PUP/MSG) [x].
   * Pipeline WASM/TypeScript opérationnel (20 tests Rust + 9 tests WASM validés).
   * Raccordement des données de techniques extraites au VFS et à l'API publique.
2. **Entraînement Continu Shenron Chat (`shenron-chat-v2`)** :
   * Exécution itérative de `scripts/ops/train-shenron-chat-loop.ts` sur les 1 495 rollouts partitionnés.
   * Suivi du Recall@5 sur les 1 091 cas cibles gold sans fuite de données.
3. **Packaging Shenron Studio (Tauri 3 / CEF)** :
   * Signature, détection dynamique des cibles GPU (CUDA/WARP) et qualification de l'installeur NSIS.
4. **Surveillance Production & Qualité** :
   * Maintien des gates vertes (`bun run typecheck`, `bun run lint`, `openapi.ts --check`).
   * Vérification continue de la santé de `https://dragonballfr.com/api/health` et de l'Agent Card A2A 1.0.
   * Prod Docker (2026-10-08) : builds sur le vps seulement, dbfr reçoit l'image scellée ; pile locale `compose.complete.yaml` alignée (pgvector pg18, passerelle compose, bot opt-in `--profile discord`), sondes 200. Reste : soft-404 du wiki (slug inconnu en 200 noindex) et débit du LLM de prod.
5. **Conteneurisation Complète DBFR** :
   * Conteneur unique tout-en-un (`deploy/docker/all-in-one/`) et pile Compose (`deploy/docker/compose.complete.yaml`).
   * Intégration des secrets Aphrody (`scripts/ops/container-secrets.ts`), initialisation DB/migrations (`scripts/ops/container-db-init.ts`), surveillance OVH (`scripts/ops/ovh-shenron.ts`) et CLI unifié (`just container-*`).
   * Référence : [CONTAINER-COMPLET.md](../../operations/CONTAINER-COMPLET.md).
6. **Tunnel Natif & Automatisation Continue (Auto-Deploy, RAG Crawl, Fine-Tuning CUDA)** :
   * Tunnel natif SSH & WireGuard multi-ports (`scripts/ops/native-tunnel.ts`, `just tunnel-*`).
   * Auto-deploy continu dès push origin/main (`scripts/ops/auto-deploy.ts`, `just auto-deploy`).
   * Auto-crawl web et synchronisation RAG (`scripts/ops/auto-crawl-rag.ts`, `just auto-crawl-rag`).
   * Auto-évaluation et fine-tuning continu du LLM avec accélération CUDA sur RTX 4070 (`scripts/ops/auto-eval-finetune.ts`, `just auto-finetune`).
   * Master Daemon autonome (`scripts/ops/shenron-daemon.ts`, `just daemon`).
7. **Connecteurs Multi-Agents & Serveurs Distants (Codex, AGY, Claude Code, Omar)** :
   * Serveurs MCP (`aphrody-mcp` port 8793, `shenron-mcp` port 8790 / public `/mcp`) et A2A (`aphrody-a2a` port 8788, public `/api/a2a`) opérationnels et testés.
   * Forwarding natif multi-ports SSH et profil WireGuard pour Omar (`10.200.77.5/32`).
   * Configurations universelles d'agents (`scripts/ops/setup-agent-connectors.ts`, `just setup-connectors`) et pack de déploiement sécurisé pour Omar sous `deploy/connectors/omar/`.
8. **Secrets Unifiés & Infrastructure Serverless (Google, Discord, SQL/Neon, Redis, Aphrody)** :
   * Gestionnaire unifié `scripts/ops/unified-secrets.ts` (`just secrets-*`) fédérant 90+ variables sur 7 catégories.
   * Déploiement serverless prêt à l'emploi (`.env.serverless`, Vercel, Cloudflare, Neon, Docker serverless).
   * Zéro fuite de secret dans Git, permissions 0600 et audit de sécurité masqué.
9. **Mission Nocturne Autonome /goal pour le Codex d'Omar & Déploiement Discord** :
   * Pack complet sous `deploy/connectors/omar/GOAL-NOCTURNE.md` détaillant les 6 phases de travail nocturne.
   * Transmission et notification sur Discord (`#prompts` et `#admin-console`) avec pièces jointes intégrales.
   * Synchronisation et validation des 6 quality gates monorepo.
10. **Lecteurs Médias & Rendu Canvas / WebGPU WASM Unifié** :
   * Correction des bugs des lecteurs Manga (normalisation des éditions, réinitialisation de page), Databooks (résilience des requêtes d'OCR) et Épisodes vidéo (gestion du probing timeout, synchronisation de langue, nettoyage audio au démontage).
   * Moteur universel `ShenronCanvasEngine` (`packages/engine/src/unified_canvas.ts`) unifiant WebGPU, WASM (`koharu-canvas`) et Canvas2D avec rendu de bulles procédurales et typographie japonaise.
   * Intégration frontend complète : composant `ShenronGpuCanvas` (`apps/site/src/components/canvas/ShenronGpuCanvas.tsx`), fond Ki énergétique réactif (`KiCanvas.tsx`) et vitrine interactive WebGPU/WASM (`/canvas`).
   * 100% typecheck et tests validés, commit `f3532461` et déploiement synchronisé sur `origin/main`.



