# Architecture : Dragon Ball 2.5D Sovereign Game Replica

Rédigé le 2026-11-11 avec `/replica-architect`. Sources : `replica/games/recon.md` (10 écrans, 5 parcours, 9 entités), `replica/games/features.csv` (28 fonctionnalités) et la suite d'extraction binaire `scripts/ops/game-asset-extractor-pipeline.ts`.

---

## 1. La Stack

La stack repose sur 100% Upstream Bun v1.4.4, Rust 2024 et WebGPU, sans aucune dépendance superflue.

| Couche                       | Choix                                    | Pourquoi                                                                                                                        |
| :--------------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **Moteur Graphique Web**     | WebGPU (WGPU 30) + WGSL                  | Exécution 60/120 FPS native sur GPU moderne (Ada Lovelace, DX12, Vulkan, Metal) avec pipelines de cel-shading ArcSys Toon.      |
| **Moteur Physique & Combat** | `crates/dragon-pixel` (Rust WASM)        | Déterminisme frame-par-frame strict (60 Hz), zéro allocation dans la boucle de rendu, rollback netcode mathématiquement exact.  |
| **Serveur & Netcode**        | Axum 0.8 + Tokio (Rust)                  | Gestion de milliers de rooms P2P WebRTC / WebSocket simultanées avec sub-millisecond tick latency (`/api/game/bevy/tick`).      |
| **Frontend Web**             | Next.js 16.5 + React 19 (Bun standalone) | Rendu hybride SSR pour le SEO des fiches d'arène et CSR haute fréquence pour le canvas de jeu.                                  |
| **Composants & HUD**         | `@aphrody/shenron-ui` (Tailwind CSS v4)  | Primitives vectorielles SVG haute-résolution (barre 15°, Dragon Radar) garantissant zéro flou sur écrans 4K/Retina.             |
| **Base de Données**          | PostgreSQL (`DATABASE_URL`) + RQLite D1  | Unicité des profils, transactions atomiques sur les Zénis et inventaires de Dragon Balls.                                       |
| **Stockage Fichiers**        | Cloudflare R2 / Garage S3                | Distribution géodistribuée des textures KTX2 et maillages Zstandard sous clé immuable `_objects/<sha256>`.                      |
| **Audio**                    | Web Audio API natif                      | Synthèse procédurale d'oscillateurs (Ki blasts, bruits d'impact, bourdonnement d'aura) sans charger de fichiers MP3 volumineux. |
| **Tâches d'Arrière-Plan**    | Bun native scripts (`scripts/ops`)       | Extraction et déchiffrement AES-256 des archives PAK/CPK, compilation automatique vers KTX2.                                    |

---

## 2. Le Schéma

Fichier de définition : `replica/games/schema.sql`. Il structure 9 tables relationnelles avec contraintes strictes.

| Table                        | Rôle                                                                              | Propriétaire             |
| :--------------------------- | :-------------------------------------------------------------------------------- | :----------------------- |
| `game_profiles`              | Battle Points (BP), Zénis, palier de rang, statistiques victoires/défaites        | Joueur (`user_id`)       |
| `game_fighters`              | 25 combattants canoniques, styles, PV/Ki de base, niveaux de puissance Daizenshuu | Éditorial / Catalogue    |
| `game_fighter_forms`         | Transformations (Kaiō-ken, SSJ, SSJ2, SSJ3, God), multiplicateurs et auras        | Éditorial / Catalogue    |
| `game_moves`                 | Catalogue des coups normaux, spéciaux, Kikōha et ultimes avec frame data          | Éditorial / Catalogue    |
| `game_stages`                | 7 arènes canoniques, polygone du ring Tenkaichi, destructibilité et pistes BGM    | Éditorial / Catalogue    |
| `game_canon_chapters`        | 10 chapitres majeurs (42 tomes Toriyama) reliant wiki, manga, anime et Daizenshuu | Éditorial / Catalogue    |
| `game_match_sessions`        | Sessions de combat 60 FPS, vainqueur, durée, activation Dramatic Finish           | Joueur & Arbitre Serveur |
| `game_dragon_ball_inventory` | Masque binaire des 7 Dragon Balls (0..127), historique des invocations Shenron    | Joueur (`user_id`)       |
| `game_leaderboard_entries`   | Classement compétitif par saison (S01, S02) indexé sur les BP                     | Système / Saisonnier     |

### Règles et Intégrité :

- Clés primaires `uuid` générées par `gen_random_uuid()` et horodatage UTC `timestamptz`.
- Contraintes `check` sur les masques de bits des 7 boules de cristal (`0 <= bitmask <= 127`).
- Règle `on delete cascade` sur les profils et inventaires pour respecter le droit à l'effacement RGPD.
- Règles d'autorisation : lecture publique pour les données encyclopédiques et de classement ; écriture restreinte à la session Better Auth du joueur actif.

---

## 3. Les API & Routes

### 3.1 Routes Web & Actions Serveur (Parcours F01 à F05)

| Méthode & Chemin | Rôle | Accès | Entrée | Sortie | Parcours |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GET `/api/game/bevy/health` | Télémétrie du moteur et cadence 60 FPS | Public | – | `{ status: "ok", target_fps: 60 }` | F01 |
| GET `/api/game/bevy/scene` | Bundle de scène migré (arène + maillages) | Public | `?character=GKU` | JSON BevySceneBundle | F01 |
| POST `/api/game/bevy/tick` | Frame step déterministe (horloge 60 Hz) | Joueur | Masque d'inputs bitmask | État des positions et PV | F01, F04 |
| GET `/api/game/canon/chapters` | Liste des chapitres d'histoire et sagas | Public | – | `CanonStoryManifest` JSON | F01 |
| GET `/api/game/fighters` | Roster des 25 combattants et forms | Public | – | Array `FighterDefinition` | F01, F02 |
| POST `/api/game/matches/start` | Démarre une session de combat | Joueur | `{ mode, chapter_id, stage_id }` | `{ match_id: uuid }` | F01-F05 |
| POST `/api/game/matches/finish` | Valide la fin de combat et rewards | Joueur | `{ match_id, winner_id, dramatic }`| `{ bp_gained, zenis, ball_awarded }` | F01, F02 |
| POST `/api/game/shenron/wish` | Exauce un des 4 vœux sacrés | Joueur | `{ wish_type: "full_heal" }` | `{ status: "granted", new_balance }` | F05 |
| GET `/api/game/leaderboard` | Top 100 compétitif de la saison | Public | `?season=S01` | Array de rangs et pseudos | F04 |

### 3.2 Tâches d'Extraction & Tâches d'Arrière-Plan

1. `game-asset-extraction` (CLI & Worker VPS) :
   - Déchiffre les fichiers `.pak` AES-256 avec la clé constructeur.
   - Désérialise les `.uasset` et exporte les textures au format KTX2 compressé.
   - Extrait les tables de chaînes bilingues `.locres` et peuple `data/games/canon-story-manifest.json`.
2. `leaderboard-snapshot` (Cron nocturne 03:00 UTC) :
   - Recalcule les paliers de rangs (Terrien -> Super Saiyan -> Dieu de la Destruction).
   - Distribue les récompenses de fin de saison en Zénis sur les profils des joueurs.

---

## 4. Les Pièges & Points d'Attention (The Parts that Bite)

1. **Déchiffrement AES-256 & Décompression Oodle** :
   - Les archives PAK UE4 chiffrent l'index de répertoire à la fin du fichier. La clé AES doit être fournie ou dérivée de l'exécutable officiel. Le script `scripts/ops/game-asset-extractor-pipeline.ts` résout l'offset d'index et gère le fallback si non-chiffré.
2. **Synchronisation Rollback Netcode** :
   - Deux clients distants peuvent diverger si la physique utilise des nombres à virgule flottante non déterministes.
   - Solution : Le moteur `crates/dragon-pixel` utilise une arithmétique à virgule fixe ou des calculs entiers de positions pour garantir 100% de concordance d'états.
3. **Politique Autoplay Web Audio API** :
   - Les navigateurs bloquent la création d'un `AudioContext` sans geste préalable de l'utilisateur.
   - Solution : L'initialisation de l'audio est différée au premier clic sur "Engager le Combat" ou sur une touche de déplacement.
4. **Tailles des Fichiers & Bande Passante R2** :
   - Une archive brute PAK pèse plus de 5 Go.
   - Solution : Pipeline d'extraction KTX2 + maillages quantifiés réduisant la taille globale de 38.2% et servant les assets à la demande par streaming content-addressed (`_objects/<sha256>`).

---

## 5. Ordre d'Implémentation par Tranches Verticales (Thin Slices)

- **Tranche 1 : Boucle de combat minimale 60 FPS (Fait)**
  - Canvas 2D/2.5D avec déplacement, saut, coups de poing, jauge de vie FighterZ 15° et sons Web Audio.
- **Tranche 2 : Scénario canonique et intégration des données du Wiki (Fait)**
  - Résolution des 10 sagas et chapitres Toriyama, calcul logarithmique des ratios Daizenshuu 7, liens vers le lecteur manga et le streaming anime.
- **Tranche 3 : Mécaniques de jeu avancées (Fait)**
  - Affrontement de rayons simultanés (Beam Clash), collecte des 7 Dragon Balls sur le radar et invocation de Shenron.
- **Tranche 4 : Pipeline d'extraction et déchiffrement binaire (Fait)**
  - Script `game-asset-extractor-pipeline.ts` traitant les footers PAK, blocs AES-256, en-têtes UAsset et tables `.locres`.
- **Tranche 5 : Mode Tournoi Tenkaichi & Salle de l'Esprit et du Temps**
  - Ajout des règles de ring-out et de l'inspecteur visuel de hitboxes/frame data dans `/games/canon`.
- **Tranche 6 : Rollback Netcode multijoueur sur Axum 0.8**
  - Connecter les sessions de combat distantes à l'endpoint `/api/game/bevy/tick`.
