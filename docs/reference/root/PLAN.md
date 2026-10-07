<!-- SPDX-License-Identifier: Apache-2.0 -->
# PLAN.md — Plan Directeur Unifié de Shenron

> **Autorité opérationnelle unique** — Relevé consolidé au `2026-10-07T18:26:57Z`.
> Synthèse unifiée absorbant `PLAN.md`, `REPRISE.md`, `PLAN-SHENRON-RE.md` et la cartographie du graphe monorepo (23 607 nœuds, 62 707 arêtes).

```json
{
  "schema": "shenron-plan/v2",
  "last_verified_at": "2026-10-07T18:24:32Z",
  "status": "CONSOLIDÉ",
  "authoritative_file": "docs/reference/root/PLAN.md",
  "freeze": { "databooks": true, "path": ".coord/FREEZE-databooks.json" },
  "baseline": {
    "rag_chunks": 241558,
    "wiki_pages": 181636,
    "databook_pages": 33738,
    "manga_pages": 11213,
    "canon_references": 6905,
    "graph_nodes": 23607,
    "graph_edges": 62707,
    "graph_communities": 242
  },
  "open_workstreams": 4
}
```

---

## 1. Invariants Non Négociables

1. **Hiérarchie des sources** : Le manga original et les déclarations d'Akira Toriyama priment toujours ; les databooks officiels font foi d'appui ; Fandom est strictement interdit.
2. **Intégrité éditoriale & Gel** : Aucune écriture OCR/traduction pendant le gel des databooks. Toute suppression éditoriale est logique (`visible = false`) et auditée dans `wiki_revisions`.
3. **Propriété des capacités** : Aphrody fournit les capacités lourdes (socle ML `aphrody-infer`, `aphrody-rag`, `aphrody-ocr`, `aphrody-models`, `aphrody-translate`, Tauri 3 `aphrody-tauri*`, paquets `@aphrody/*`) : Shenron les consomme via crates Rust ou FFI, sans les copier ni les dupliquer.
4. **Langues et interfaces** : Le code, les schémas et identifiants sont en anglais. La documentation (`docs/`) est exclusivement en français. Tout texte visible passe par les dictionnaires d'interface (`messages/{fr,en,ja}.json`).
5. **Gates de livraison obligatoires** : Tout lot qualifié doit valider `bun run typecheck` (TS 7.0), `bun run lint` (oxlint, 0 erreur), `bun packages/api/scripts/openapi.ts --check`, et les tests du périmètre.

---

## 2. Architecture de Fusion Unifiée (Graphe 23 607 Nœuds)

La cartographie native `aphrody-graph` unifie les quatre couches de la plateforme :

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          1. EXPÉRIENCE & UI SHENRON                         │
│  Site Web (Next.js 16 M3)  │  Shenron Studio (Tauri 3 / CEF)  │  CLI Native │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Protocole App-Server (JSON-RPC 2.0)
                                       │ + Responses API (/v1/responses)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    2. COLONNE VERTÉBRALE NATIVE (CODEX)                     │
│  Types [vendor/codex/app-server-protocol] · Cycles thread/turn · Compaction │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ SAC (Stdio Async Channel) + bun:ffi (ABI 5)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                       3. BACKEND & INFÉRENCE APHRODY                        │
│  aphrody-infer · llama-server (shenron-chat-v2 LoRA) · aphrody-memory / RAG │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ VFS SQLite / Ingestion batch
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                  4. EXTRACTION & REVERSE ENGINEERING                        │
│  crates/shenron-re (VFS CPK, formats Dimps BAC/BDM/CUS/PUP/MSG, live-scan) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. File d'Exécution Unique & Statut Consolidé

| ID | Chantier | Priorité | Statut | Résultat & Preuve de Clôture |
| :--- | :--- | :---: | :---: | :--- |
| **SH-P0-001** | Sécurité OAuth & MCP | P0 | [x] | Fail-closed, égalités exactes, allowlists strictes sans secrets implicites. |
| **SH-P0-002** | Typecheck TS 7.0 global | P0 | [x] | `bun run typecheck` exit 0 sur l'ensemble des 13 paquets et scripts racine. |
| **SH-P0-003** | Intégrité des databooks sous gel | P0 | [x] | Garde commune CLI/HTTP, réception atomique, corruption active = 0. |
| **SH-P0-004** | Gouvernance des données | P0 | [x] | Remplacement des suppressions physiques par masquage logique et révision. |
| **SH-P0-005** | Qualité RAG & Anti-leak | P0 | [x] | Partitionnement anti-gold-leak vérifié : 1 495 rollouts / 1 091 cibles gold étanches. |
| **SH-P0-016** | Unification de la stack modulaire | P0 | [x] | Découpage propre en paquets `@shenron/*` (config, db, auth, api, ui, pipeline, native). |
| **SH-P0-017** | Sécurité staff & Bot admin | P0 | [x] | `checkAdmin` accorde les droits selon la politique staff (403 sinon, tests validés). |
| **SH-P1-001** | Production & Sondes live | P1 | [x] | `dragonballfr.com` HTTP/2 200, `/api/health` ok, agent-card A2A 1.0 en ligne. |
| **SH-P1-002** | Contrats OpenAPI & Tokens M3 | P1 | [x] | `openapi.ts --check` et `generate-tokens.ts --check` validés sans dérive. |
| **SH-P1-003** | Moteur RE Dragon Ball (`shenron-re`)| P1 | [x] | Parser CPK/CRILAYLA, formats Dimps (BDM/BAC/CUS/PUP/MSG), WASM/Bun, carte prototype ABI natif 5 et export récursif MSG vers destination neuve validés (32 tests Rust du crate, 10 tests pipeline WASM). |
| **SH-P1-004** | Entraînement continu `shenron-chat-v2`| P1 | [ ] | Exécution itérative de `train-shenron-chat-loop.ts` avec monitoring GPU VRAM. |
| **SH-P1-005** | Signature & Packaging Studio Desktop | P1 | [ ] | Packaging NSIS, mise à jour automatique Tauri 3, détection CUDA native. |

---

## 4. Chantier Reverse Engineering & Formats Jeux (`shenron-re`)

Absorption du plan technique de migration DBXV2 et des outils d'extraction d'assets Dragon Ball :

1. **Architecture de `crates/shenron-re`** :
   - `fs` : Décodage pur Rust des archives CRIWARE CPK et compression CRILAYLA (`zerocopy` + `binrw`).
   - `formats` : Décodage des formats Dimps :
     - `BAC` : Scripts d'animations, frappes et cinématiques de combat.
     - `BDM` : Matrices de dégâts, projection physique et types d'impacts.
     - `CUS` / `PUP` : Compétences, auras, éveils et multiplicateurs de statistiques.
     - `MSG` : Dialogues et descriptions multilingues injectables dans le RAG.
   - `live` : Inspection mémoire et scanners AOB non-invasifs en mode debug.
2. **Consommateurs Shenron** :
   - **RAG & LLM** : Dialogues de patrouille temporelle et lore contextualisé.
   - **Shenron Studio** : Visualiseur de modèles 3D et lecteur audio natif.
   - **Encyclopédie DBFR** : Fiches de techniques chiffrées avec multiplicateurs exacts.

---

## 5. Migration dbxv2 Rust/Bun (inventaire 2026-10-07)

- Dépôt source `aphrody-code/dbxv2` vérifié au sous-module `fabc19c0021e3e992786dc2a093a749c8a1c26f0`.
- Licence propriétaire; aucune donnée/asset du jeu dans le dépôt. La parité des 21 commandes
  reste incomplète; matrice et limites dans `docs/operations/dbxv2-rust-bun-parity-2026-10-07.md`.
- CLI Rust `shenron-re inventory <game-root>` inventorie chemins/tailles et empreintes limitées,
  sans copier de fichiers. WASM, `shenron-re map|catalog` et ABI natif FFI 5 donnent accès au
  prototype cartographique.
- CLI `shenron-re text <input-dir> --output-dir <new-dir>` convertit récursivement les fichiers
  MSG vers un nouvel arbre JSON, avec manifeste; refuse toute destination préexistante et
  ignore les liens symboliques.
  Aucun asset n'a été extrait; aucun flux Steam temps réel, import de sauvegarde, transfert
  d'assets ou déploiement CDN n'a été réalisé.

## 6. Exploitation & Portes de Contrôle

* **Contrôles CI obligatoires** :
  ```sh
  bun install --frozen-lockfile
  bun run typecheck
  bun run lint
  bun packages/api/scripts/openapi.ts --check
  bun packages/ui/scripts/generate-tokens.ts --check
  bun packages/pipeline/scripts/ai/check-contracts.ts
  ```
* **Déploiement en production** :
  - Délégué à `aphrody-infra` via `bun scripts/ops/release.ts --build-host vps`.
  - Sondes de santé après bascule : `/api/health`, `/api/canon`, `/.well-known/agent-card.json`.
