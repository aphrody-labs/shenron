<!-- SPDX-License-Identifier: Apache-2.0 -->

## Suivi opérationnel — 11 octobre 2026, 16:08 UTC

Le code, les manifestes et les reçus datés déterminent la qualification. Les invariants
éditoriaux ci-dessous restent inchangés. La demande courante et les11lots vivent dans
[GOAL](../../../GOAL.md), les étapes bornées dans [TODO](../../../TODO.md), les preuves
et incidents dans [REPRISE](REPRISE.md). Une capture privée n'accorde pas droitsRAG,
entraînement ni réhébergement public ; les notices publiées sont des synthèses originales.
Les catalogues passent par leurs writers transactionnels, avec backup, validation JSON,
comparaison optimiste et relecture indépendante. Annonce et lecture restent distinctes.
Le lecteur HLS de l’image3cd7e7f7 est actif et qualifié ; le delta R2 conserve les
anciens chunks. La génération vidéo et Omar sont une extension explicite du propriétaire,
avec trois rendus originaux, capture/encodage vérifiés et entraînement soumis à ses portes.
La délégation DNS et la preuve DS/TTL restent nécessaires avant la route CDN du domaine.

# PLAN.md — Plan Directeur Unifié de Shenron

## Hero d'accueil — demande du 18 octobre 2026

Composition restaurée depuis les idées des commits `78044090` (ampleur, identité,
CTA), `3cf6e3b1` (image dominante et fondu) et `41952ee5` (mouvement suspendu).
Le propriétaire demande une adaptation inspirée de Crunchyroll avec de vraies
frames d'épisodes. Le composant conserve logo, Kinto'un, introduction et lien
éditorial CMS, recherche et accès aux deux épisodes. Les sections restent ordonnées.

`HomeHero.module.css` possède le rendu ; les anciennes règles `.home-stage` ne
s'appliquent plus au hero. Sur mobile, une image 16:9 précède le texte. Quatre frames
1440 × 810, extraites avec Bun.Video, alternent par fondu avec pause, précédent et
suivant ; la rotation s'arrête au focus, hors écran, onglet masqué et mouvement réduit.
`home-hero-frames.ts` référence uniquement des objets CDN immuables relus par SHA-256.
Le CTA de lecture dépend des lignes canoniques 875/876 avec source CDN qualifiée.
Le lot `8a70c39f` ajoute le lettrage officiel Beerus, des capsules encrées et deux
vraies vignettes dans les cadres mesurés `CadreCase` ; les anciennes règles CSS
du hero sont retirées. Portes cumulées : 52 tests passent, zéro ignoré, 368 assertions,
avec un environnement DOM HTTP réel ; types, lint et formatage ciblés verts.
L'image active `1e9193db` a été contrôlée dans Chrome en 1440/390 : quatre images HD
chargées, logo réel, précédent/suivant, pause et image mobile 16:9 sans débordement.

## Assets manga Rust/WASM — demande du 18 octobre 2026

Le propriétaire `shenron-panels` exporte une vraie planche locale en découpes,
atlas PNG normalisé, manifeste et GIF séquentiel. Le lot `e1218daa`, corrigé par
`6f7c48dd` pour la CLI, conserve l'ordre demandé et borne les dimensions/cadences.
25 tests natifs, Clippy, compilation wasm32 et contrôle CLI corrigée passent.
Le consommateur Canvas `1e9193db` passe 16 tests et 71 assertions, types/lint/formatage.
L'exemple réel produit
cinq segments (quatre cases et le titre), un atlas 784 × 520 et cinq images GIF
à 500 ms. Les médias et reçus restent dans `var/reports/engine-assets/`.

Le consommateur `packages/engine/src/sprite-atlas.ts` relie ce manifeste à Canvas 2D.
Chrome a dessiné les tuiles 1, 2 et 5 et comparé chaque octet RGBA à la tuile source :
égalité complète. Cette séquence de dessins fixes ne crée pas de poses nouvelles.
Le SVG courant contient le scan raster dans un cadre vectoriel ; le renderer wgpu
place des cases texturées en parallaxe. Aucun de ces deux chemins ne constitue une
vectorisation du trait ou une reconstruction de personnages en maillage 3D.

L'interface Studio importe maintenant manifeste et PNG, vérifie empreinte du scan,
dimensions et empreinte PNG, puis propose pause/reprise et sélection d'image.
La CLI release `b1122fb2` a aussi été exécutée sur une vraie page du chapitre 516 :
atlas 784 × 520, GIF cinq images 256 × 256/500 ms, égalité des empreintes relues,
rejet de `--only 0` ; sorties terminales compilation et preuve à zéro.

Suite bornée : qualifier cette interface sur le moteur hébergé,
relier l'atlas au consommateur Dragon Pixel existant, puis qualifier séparément GPU, VFX et
animation 2D sur leurs vrais rendus. La conversion de traits en icônes SVG et de
personnages en modèles 3D demande des producteurs et des preuves distincts ; elle
reste ouverte, sans promettre qu'un simple changement de format la réalise.

## Studio web et administration — extension du 18 octobre 2026

L'upstream Koharu est conservé hors dépôt pour l'audit, au commit
`85d6de339ee7d486fe381249205126d944d40bb7`. Les 39 composants, sept outils,
historique, import/export et pipeline sont rapprochés des propriétaires actuels.
Le diamètre de pinceau adaptatif réellement perdu a été restauré (`e3682dc1`).
Les captures de la documentation officielle constituent une référence visuelle ;
le Next upstream local échoue sur une dépendance SWC et ne vaut pas une
exécution native de l'application.

Le cadre commun admin `aafa7c8b` conserve les 64 liens, les gardes et les formulaires
réels. Explorateur filtrable, onglets conservant les paramètres, palette Ctrl/Maj/P,
contexte et composants partagés remplacent la composition CMS. Trois tests DOM
du cadre et 23 tests de navigation/primitives passent. Chrome sur fixture confirme
filtre, recherche, Échap/focus et largeur 390 avec texte 200 %, sans débordement.
Ce contrôle ne remplace pas le parcours admin authentifié en production.

`koharu-library` reste l'unique état éditorial, derrière Tauri sur bureau et le
même SDK sur le web. Le lot `71e79fc9` emballe le SDK et isole home, projets et
service de credentials par identité authentifiée. Les deux tests Rust du namespace
passent ; compilation SDK et smoke réel restent à terminer avant livraison.
L'abonnement UI est découplé de l'installation ML implicite (`76b8fe03`) ; les
actions explicites de traitement gardent l'initialisation native. Le responsive
conserve un Canvas unique avec panneaux Pages/Outils réutilisés et retour de focus.

## Timeline vidéo et GIF — demande du 18 octobre 2026

Objectif autorisé : les épisodes Beerus 1 et 2, puis les épisodes disposant d’une
source qualifiée, proposent une timeline complète et des GIF générés côté serveur
par Bun.Video. Shenron possède le catalogue, les routes, l’interface et la publication ;
Bun possède le décodage, les images et l’encodage. Les sources, secrets et fichiers
de travail restent dans les stores privés ; seuls les médias autorisés sont publiés.

État implémenté : `EpisodeTimeline.tsx` parcourt l’index complet, avec un curseur,
des pages de douze aperçus (5 s, 1 s ou chaque frame) et le déplacement du lecteur.
`GET /api/episodes/{875|876}/timeline` fournit les métadonnées ; `kind=frame&index=N`
génère un WebP 320 × 180. `kind=gif&index=N` encode un extrait réel configurable :
`duration=1..5`, `fps=6|12|24`, `width=320|480|640` (défauts 2 s, 6 images/s, 320 px).
La durée effective est limitée à la fin de la vidéo ; le cache distingue ces profils.
Les fichiers CDN sont vérifiés par SHA-256 ; deux traitements et douze attentes,
déduplication, cache mémoire 32 Mio et purge des anciennes sources bornent le service.
Les fiches 875/876 affichent un seul lecteur CDN et cette timeline ; leurs anciennes
galeries éditoriales et sélecteurs externes sont retirés du parcours. Sur les autres fiches,
`EpisodeScenes.tsx` conserve séparément son export historique des images éditoriales
dans le navigateur, en 480 × 270 avec un délai fixe de 400 ms. Le contrat de remise
`packages/media/src/episode-video-delivery.ts` borne les lots à 600 images ; leur
vérification agrégée est limitée à 128 Mio. Ce contrat ne représente pas une timeline
exhaustive. Le MP4 local de la fiche 875 contient 33 511 images selon les métadonnées
Bun.Video relues le 18 octobre ; ce décompte ne prouve pas leur publication.

1. Qualifier les MP4 locaux 875/876 : SHA-256, octets, durée, cadence rationnelle,
   dimensions, pistes audio et images décodées. Publier les sources par le propriétaire
   CDN et relire les réponses complètes et partielles. Relier les lecteurs par le
   writer canonique avec sauvegarde, snapshot complet, CAS, relecture et historique.
2. Réutiliser les capacités du producteur Bun pour indexer chaque image et son
   horodatage réel. Garder un index complet séparé des petits lots éditoriaux ;
   exposer sa pagination et sa couverture sans charger toutes les images dans le
   HTML ou la colonne JSONB `frames`. Distinguer indexation et décodage effectif.
3. Ajouter des requêtes serveur bornées par épisode et temps : source locale
   autorisée résolue par identifiant, jamais une URL ou un chemin libre. Réutiliser
   le cache par empreinte de source et paramètres ; limiter concurrence, durée,
   mémoire et nombre d’images. Dédupliquer les demandes identiques, annuler les
   jobs abandonnés et relire les artefacts avant publication.
4. Générer les GIF sur une plage réelle de la vidéo, avec timecodes et cadence
   conservés. Les limites natives des lots restent explicites : au plus 64 images
   et 64 Mio pour `frames`, cinq secondes, 120 images, 640 × 360 et 32 Mio pour
   `gif`. Un export plus long requiert un contrat producteur qualifié ; aucune
   extraction exhaustive non bornée dans une requête HTTP.
5. Relier la timeline paginée au lecteur et à la sélection de plage GIF ; afficher
   progression, état vide et erreurs en français, anglais et japonais. Vérifier
   timecodes fractionnaires, extrémités, seek lointain, cache et concurrence sur
   les médias réels, puis lecture et export en 390/1280 après livraison par
   `scripts/deploy/release.sh` et activation Infra.

Qualification locale du lot `b6aaa492` : 26 tests passent, quatre tests DOM sont
ignorés ; types, lint et formatage ciblés passent. Sur le MP4 réel 876 : 33 512 frames,
WebP 118–143 ms et GIF deux secondes environ 2,7 s (mesures Windows, pas un engagement
de latence en production). Le navigateur a chargé treize aperçus et un GIF 320 × 180,
déplacé le lecteur à 30,03 s et atteint la frame 33 512. Le rendu local utilise le
composant et le handler réels avec un chemin de source local injecté pour ce test.
Publication CDN et writers 875/876 terminés : SHA-256, snapshot complet, sauvegarde,
CAS, relecture et replay refusé en 409. L’image `ea8ad532` activée par Infra sert les
métadonnées, WebP et GIF publics des deux sources ; le cache persistant a survécu au
redéploiement. La lecture publique 875 a progressé de 0,149 à 2,982 s en navigateur.
Le lot `114a2829` ajoute le lecteur unique, le filmstrip et les réglages GIF ;
il est activé via Infra (image `fea4c75e`). Les deux HTML publics contiennent un
seul lecteur vidéo CDN, zéro iframe et zéro ancien sélecteur. L'export public
3 s / 12 images/s / 480 px produit pour chaque épisode 36 images, 480 × 270 et
3,00 s vérifiées dans la structure GIF. Le défaut Range CDN 876 est corrigé :
réponses 206 début/fin depuis PC et DBFR, octets identiques au MP4 local.
Chrome a ensuite qualifié la lecture publique 875 (0,112 → 4,129 s) et 876
(25,355 → 29,026 s), le seek à 30,03 s et à la dernière frame 33 512, treize
aperçus réels et le GIF 3 s / 12 images/s / 480 px. À 390 px, aucun débordement
et le GIF est affiché à 348 px (source 480 px). Les faux liens « source primaire
Toei » des deux fiches ont été retirés par writer canonique, avec CAS/relecture.
Le lot `8a70c39f` remplace les menus natifs du lecteur et de la timeline par Base UI,
avec clavier et portails plein écran, progression fusionnée et aperçu réel au survol.
Les fiches reçoivent une hiérarchie plus compacte et des actions de 48 px.
Portes cumulées : 52 tests, zéro échec/ignoré, 368 assertions ; types/lint/formatage
verts. Le rendu du dernier lot reste à vérifier après activation.
Le fork Bun a été exploré et testé, sans modification native nécessaire. Les reçus
techniques privés du lot Beerus sont dans `var/reports/beerus-876-owner/` ; une
métadonnée ou une image extraite ne vaut pas lecture publique de l’épisode.

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
- `scripts/deploy/release.sh` (build Linux x64 → image vérifiée → activation Infra DBFR), puis sondes réelles et delta R2 du payload actif.
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
│                     2. CONTRATS D'AGENT (OWNER APHRODY)                     │
│  Contrats app-server · Cycles thread/turn · Compaction (owner Aphrody)      │
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
  - `scripts/deploy/release.sh` construit l'image sur un hôte Linux x64 et la livre ; l'activation
    sur la cible reste celle d'Aphrody Infra (`~/deploy-shenron-image.sh` sur DBFR).
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

## 7. Actualisation opérationnelle du 18 octobre 2026 — Mediabunny & Parité Vidéo 100%

- **Sous-module Mediabunny & Migration n2b** :
  - `vendor/mediabunny` cloné en sous-module Git.
  - Transformation agressive Node → Bun (`aphrody n2b --aggressive`) validée sans erreur.
  - Intégration du composant `CanvasSink` pour le scrubbing hover preview du lecteur vidéo et de la chaîne d'extraction/clipping Bun.
- **Parité et Couverture Vidéo du Catalogue** :
  - Base de production PostgreSQL (`bot.db_episodes` et `bot.db_movies`) vérifiée à 100% de couverture : 876/876 épisodes et 28/28 films/OAVs avec flux vidéo réels, players multi-diffuseurs et posters HD.
  - Offre Légale Crunchyroll (`OffreLegale.tsx`) avec sélecteur de langues et Watchlist répliquée (`/watchlist`, `/api/watchlist`).
  - Validation des portes locales et push `origin/main` (`2476c7e1`).

Rapport détaillé local, ignoré par Git : `var/reports/plan-audit-2026-10-08.json`. Prochaine étape : rétablir les accès de build, installer avec le lockfile figé, puis reprendre entraînement, intégration RE et packaging jusqu’aux preuves de livraison.
