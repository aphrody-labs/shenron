<!-- SPDX-License-Identifier: Apache-2.0 -->

## Suivi opérationnel — 11 octobre 2026, 14:45 UTC

Le code, les manifestes et les reçus datés déterminent la qualification. Les invariants
éditoriaux ci-dessous restent inchangés. La demande courante et les11lots vivent dans
[GOAL](../../../GOAL.md), les étapes bornées dans [TODO](../../../TODO.md), les preuves
et incidents dans [REPRISE](REPRISE.md). Une capture privée n'accorde pas droitsRAG,
entraînement ni réhébergement public ; les notices publiées sont des synthèses originales.
Les catalogues passent par leurs writers transactionnels, avec backup, validation JSON,
comparaison optimiste et relecture indépendante. Annonce et lecture restent distinctes.
La nouvelle image19f503de et le delta de28images sont encore en qualification.


# PLAN.md — Plan Directeur Unifié de Shenron

> **Autorité opérationnelle unique** — Relevé consolidé au `2026-10-07T18:36:38Z`.
> Synthèse unifiée absorbant `PLAN.md`, `REPRISE.md`, `PLAN-SHENRON-RE.md` et la cartographie du graphe monorepo (23 607 nœuds, 62 707 arêtes).

```json
{
  "schema": "shenron-plan/v2",
  "last_verified_at": "2026-10-07T18:36:38Z",
  "status": "CONSOLIDÉ",
  "authoritative_file": "docs/reference/root/PLAN.md",
  "freeze": {
    "databooks": false,
    "path": ".coord/FREEZE-databooks.json",
    "owner_lifted_at": "2026-10-11"
  },
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

## État opérationnel vérifié le11octobre2026

Le bloc consolidé du7octobre ci-dessus reste un instantané historique, pas un nouvel
inventaire des corpus. La priorité et les onze lots ouverts sont dans
[GOAL.md](../../../GOAL.md) ; les livraisons datées sont dans [REPRISE.md](REPRISE.md).

- Cinq actualités Super officielles publiées par CMS/PostgreSQL ; épisode bonus et lecture
  effective restent non confirmés. Miroir Redis propriétaire19articles/TTL24h ; writer dans
  release active `bfb1280c`, preuve d'écriture end-to-end distincte du backfill.
- Scope npm `@aphrody/shenron-*`, apps privées, GitHub `aphrody-labs/shenron` et équipe
  `aphrody` ; crates.io conserve ses noms globaux et requiert des ownerships prouvés.
- Sources publiques, notices et allowlists auditées avant publication ; secrets, corpus,
  bases et assets protégés exclus. Migrations historiques immuables.
- Fabrique VPS→artefact scellé→Infra DBFR, puis sondes réelles et delta R2 du payload actif.
  Worker en lecture seule, anciens chunks conservés ; DNSSEC/DS/TTL et délégation restent
  des portes externes avant bascule CDN.
- Générateurs plugin et relevé registry automatisés selon
  [le runbook](../../operations/source-synchronization.md), sans transformer un état ancien
  ou une métadonnée registry en preuve de production.

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

| ID            | Chantier                               | Priorité | Statut | Résultat & Preuve de Clôture                                                                                                                                                                                                                  |
| :------------ | :------------------------------------- | :------: | :----: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SH-P0-001** | Sécurité OAuth & MCP                   |    P0    |  [x]   | Fail-closed, égalités exactes, allowlists strictes sans secrets implicites.                                                                                                                                                                   |
| **SH-P0-002** | Typecheck TS 7.0 global                |    P0    |  [x]   | `bun run typecheck` exit 0 sur l'ensemble des 13 paquets et scripts racine.                                                                                                                                                                   |
| **SH-P0-003** | Intégrité des databooks sous gel       |    P0    |  [x]   | Garde commune CLI/HTTP, réception atomique, corruption active = 0.                                                                                                                                                                            |
| **SH-P0-004** | Gouvernance des données                |    P0    |  [x]   | Remplacement des suppressions physiques par masquage logique et révision.                                                                                                                                                                     |
| **SH-P0-005** | Qualité RAG & Anti-leak                |    P0    |  [x]   | Partitionnement anti-gold-leak vérifié : 1 495 rollouts / 1 091 cibles gold étanches.                                                                                                                                                         |
| **SH-P0-016** | Unification de la stack modulaire      |    P0    |  [x]   | Découpage propre en paquets `@aphrody/shenron-*` (config, db, auth, api, ui, pipeline, native).                                                                                                                                               |
| **SH-P0-017** | Sécurité staff & Bot admin             |    P0    |  [x]   | `checkAdmin` accorde les droits selon la politique staff (403 sinon, tests validés).                                                                                                                                                          |
| **SH-P1-001** | Production & Sondes live               |    P1    |  [x]   | `dragonballfr.com` HTTP/2 200, `/api/health` ok, agent-card A2A 1.0 en ligne.                                                                                                                                                                 |
| **SH-P1-002** | Contrats OpenAPI & Tokens M3           |    P1    |  [x]   | `openapi.ts --check` et `generate-tokens.ts --check` validés sans dérive.                                                                                                                                                                     |
| **SH-P1-003** | Moteur RE Dragon Ball (`shenron-re`)   |    P1    |  [x]   | Parser CPK/CRILAYLA et extraction arborescente, formats Dimps (BDM/BAC/CUS/PUP/MSG/EMB), WASM/Bun, carte prototype ABI natif 5, export récursif MSG et extraction de texte par WASM validés (39 tests Rust du crate, 12 tests pipeline WASM). |
| **SH-P1-004** | Entraînement continu `shenron-chat-v2` |    P1    |  [ ]   | Exécution itérative de `train-shenron-chat-loop.ts` avec monitoring GPU VRAM.                                                                                                                                                                 |
| **SH-P1-005** | Signature & Packaging Studio Desktop   |    P1    |  [ ]   | Packaging NSIS, mise à jour automatique Tauri 3, détection CUDA native.                                                                                                                                                                       |

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

- **Contrôles CI obligatoires** :
  ```sh
  bun install --frozen-lockfile
  bun run typecheck
  bun run lint
  bun packages/api/scripts/openapi.ts --check
  bun packages/ui/scripts/generate-tokens.ts --check
  bun packages/pipeline/scripts/ai/check-contracts.ts
  ```
- **Déploiement en production** :
  - Délégué à `aphrody-infra` via `bun scripts/ops/release.ts` (tout build sur le vps).
  - Sondes de santé après bascule : `/api/health`, `/api/canon`, `/.well-known/agent-card.json`.

## 6. Revalidation locale du 8 octobre 2026

Les cases historiques ci-dessus décrivent le relevé du 7 octobre ; elles ne prouvent pas la qualification du checkout actuel. L’objectif de terminer tous les chantiers reste ouvert.

- Agent home DBFR lu : `~/.aphrody/workspaces/dbfr/SOUL.md`. Ce dossier contient également `training/triples.jsonl`, mais aucun autre document natif de l’agent home.
- OpenAPI, tokens UI et contrats IA (12 fixtures) : contrôles réussis. Lint : code 0, avec avertissements. Typecheck global : échec lié aux dépendances locales absentes `@aphrody/bun` et `cmdk` ; aucune validation globale revendiquée.
- Corpus local de chat : 1 091 lignes gold, zéro ligne dans `rollouts.jsonl`. Les 1 495 rollouts du relevé historique restent à retrouver ou à produire et vérifier. La boucle `train-shenron-chat-loop.ts` génère et évalue, mais ne lance pas encore `aphrody-train` : le raccordement LoRA reste à implémenter et qualifier.
- Accès SSH rétabli (WireGuard, `docs/operations/ssh-wireguard.md`). Tout build tourne sur `vps` ; `dbfr` ne reçoit que l'image Docker scellée. Release `docker-5c09af18` active le 8 octobre : conteneurs sains, pages, RAG, MCP anonyme (48 outils en lecture seule annotés) et CDN sondés. Signature et qualification NSIS restent à exécuter.
- Pile Docker locale (`compose.complete.yaml`) alignée sur la production (pgvector pg18) et restaurable depuis un `pg_dump` de prod ; sondes locales 200.
- Restent ouverts : soft-404 du wiki (slug inconnu en 200 `noindex`, `app/loading.tsx` racine) et débit du LLM de prod (4,5 tok/s).
- Le raccordement VFS/API des données de jeux et les consommateurs Studio restent ouverts comme indiqué dans `REPRISE.md` ; les claims non libérées sur `crates/shenron-re/**` et `REPRISE.md` ont été respectées.
- Sondes publiques `/api/health`, `/.well-known/agent-card.json` et `/api/canon` : HTTP 200 le 8 octobre. Ce contrôle de disponibilité ne qualifie pas le contenu métier ni la conformité A2A.
- Le gel des databooks décrit dans le relevé du 8 octobre a été levé explicitement par le propriétaire le 11 octobre. La configuration protégée DBFR `databooks-freeze.json` déclare `frozen:false` et son activation Infra est qualifiée. Chaque job distant utilise le fichier hôte `/srv/shenron/shared/server/config/databooks-freeze.json` (chemin conteneur `/var/lib/shenron/config/databooks-freeze.json`) ; les erreurs de lecture restent bloquantes. Les notices éditoriales passent toujours par l'API propriétaire et leurs révisions.

Rapport détaillé local, ignoré par Git : `var/reports/plan-audit-2026-10-08.json`. Prochaine étape : rétablir les accès de build, installer avec le lockfile figé, puis reprendre entraînement, intégration RE et packaging jusqu’aux preuves de livraison.
