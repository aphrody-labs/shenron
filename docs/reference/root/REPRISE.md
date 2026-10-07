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
