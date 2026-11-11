# Reconnaissance : Dragon Ball 2.5D Sovereign Game Replica

Date : 2026-11-11. Rédigé d'après l'analyse des exécutables, archives PAK/CPK, protocoles réseau et formats de données de Dragon Ball FighterZ (UE4 ArcSys), Xenoverse 2 (CRIWARE) et Budokai Tenkaichi 3.

---

## 1. Inventaire des Écrans (10 Écrans)

| ID | Écran | Route | Composants Principaux | Rôle & États |
| :--- | :--- | :--- | :--- | :--- |
| **S01** | Hub Principal | `/games/canon` | Navigation Sagas, Status Bar Gamescope (60 FPS), Roster Preview, Sélecteur de Mode | Sélection du mode de jeu et de la saga active |
| **S02** | Sélection Combattants | `/games/canon/select` | Grille 25 combattants, sélecteur de forme/transformation (Base, SSJ, SSJ2, SSJ3, God), carte de stats | Choix de l'équipe (1v1 ou 3v3 Tag Team) et des assists |
| **S03** | Arène de Combat 2.5D | `/games/canon/battle` | Canvas WebGPU/WASM 60 FPS, HUD FighterZ (barre 15°, Dragon Radar 7 boules), jauge de Ki 0..7 | Exécution du combat en temps réel avec shaders ArcSys |
| **S04** | Duel de Rayons (Beam Clash) | `/games/canon/clash` | Overlay de duel de rayons, jauge de mash rate [J]/[K], caméra dynamique, speedlines | Mini-jeu de confrontation décisive lors de Kikōha simultanés |
| **S05** | Invocation de Shenron | `/games/canon/shenron` | Animation cinématique du dragon céleste Shenron, carte des 4 vœux (Vie, Réanimation, Ki, Invincibilité) | Déclenchée lorsque 7 Dragon Balls sont collectées par combos |
| **S06** | Coupure Manga Narrative | `/games/canon/dialogue` | Bulles manga bilingues (Kanji/Kana + FR), lien vers tome manga, lien épisode anime | Cutscene pré-combat et dialogue de victoire canonique |
| **S07** | Dramatic Finish | `/games/canon/finish` | Écran de victoire cinématique avec destructibilité d'arène (Namek, Cell Games, Wasteland) | Déclenché lors du coup final canonique sur le boss |
| **S08** | Tournoi Tenkaichi | `/games/canon/tournament`| Arbre d'élimination 8/16 combattants, annonceur Tenkaichi, jauge de Ring-Out | Mode championnat avec élimination hors de l'arène |
| **S09** | Salle du Temps (Training) | `/games/canon/training` | Visualisateur de hitboxes (vertes/rouges), affichage frame data (Startup, Active, Recovery), replay d'inputs | Entraînement technique et perfectionnement des combos |
| **S10** | Hall Multijoueur Rollback | `/games/canon/lobby` | Liste des salons P2P WebRTC, ping, jauge de delay frames (0..3), match classé | Affrontement en ligne synchronisé par Axum 0.8 |

---

## 2. Parcours Utilisateur (5 Parcours)

- **F01 : Histoire Canonique (S01 → S06 → S03 → S04 → S05 → S07)**
  - Choix d'un chapitre (ex: Ch. 6 Goku vs Vegeta ou Ch. 7 Goku vs Freezer).
  - Lecture du dialogue manga bilingue avec liens vers le tome/chapitre et l'épisode anime.
  - Combat WebGPU 60 FPS avec adaptation logarithmique des niveaux de puissance Daizenshuu.
  - Résolution des clashs de rayons et invocation de Shenron si 7 sphères détectées.
  - Déclenchement du Dramatic Finish et inscription de la victoire au classement.

- **F02 : Championnat Tenkaichi Budōkai (S01 → S08 → S02 → S03 → S08)**
  - Sélection de 8 ou 16 guerriers pour l'arbre du tournoi.
  - Combats successifs sur l'arène avec détection stricte du Ring-Out (coordonnées hors du polygone du ring).
  - Remise du trophée Tenkaichi et récompenses en Zénis.

- **F03 : Laboratoire de Frame Data (S01 → S09 → S03)**
  - Choix du guerrier et de l'adversaire pantin.
  - Bascule de l'affichage des hitboxes (zones d'impact rouges) et hurtboxes (zones vulnérables vertes).
  - Mesure exacte des frames de startup, de blockstun et de hitstun.

- **F04 : Duel Multijoueur Rollback (S01 → S10 → S02 → S03)**
  - Connexion au serveur souverain Axum 0.8 (`/api/game/bevy/tick`).
  - Négociation de session WebRTC DataChannel.
  - Simulation lockstep 60 Hz avec rollback prédictif GGPO.

- **F05 : Quête des 7 Dragon Balls (S01 → S03 → S05)**
  - Réalisation de combos `>= 3 hits` dans chaque arène du globe.
  - Détection et collecte sur le Dragon Radar.
  - Invocation de Shenron au sanctuaire sacré.

---

## 3. Liste des Composants Réutilisables

1. `FighterzHpBar` : Barre de vie biseautée à 15° avec jauge active (verte/jaune) et jauge récupérable.
2. `DragonRadarHud` : Radar circulaire vert avec cadrans concentriques, balayage radar et 7 diodes de Dragon Balls.
3. `KiSuperMeter` : Jauge d'énergie segmentée de 0 à 7 barres pour les attaques spéciales et ultimes.
4. `MangaDialogueBalloon` : Bulle de dialogue style Toriyama avec bordure encrée noire 3px et ombrage dur.
5. `BeamClashMeter` : Barre d'affrontement Kikōha avec jauge d'écrasement de boutons (mash rate).
6. `OnomatopoeiaOverlay` : Moteur de rendu flottant de Katakana dynamiques (`ドカッ`, `ズガガガガッ`, `ドドドド`).
7. `ScouterPowerDisplay` : Moniteur de scouteur calculant les ratios de puissance d'après le Daizenshuu 7.
8. `WebGpuViewport` : Canvas haute performance avec shaders WGSL ArcSys (outline hull + cel pass).

---

## 4. Modèle de Données Déduit

- `GameUser` : Identifiant, pseudo, Battle Points (BP), Zénis, niveau d'accomplissement.
- `Fighter` : ID canonique, nom, nom_ja, style, PV de base, Ki de base, puissance Daizenshuu, multiplicateurs.
- `Move` : Coup normal/spécial, type (frappe, projection, rayon), coût en Ki, dégâts, frames de startup/active/recovery.
- `Stage` : ID, nom, arène 3D/2D, coordonnées du ring, ciel, destructibilité, musique de fond.
- `MatchSession` : ID, joueur 1, joueur 2, mode, chapitre, arène, durée, vainqueur, dramatic finish.
- `PlayerProgress` : Chapitres débloqués, rangs obtenus (S/A/B), Dragon Balls détenues, souhaits exaucés.

---

## 5. Formats Binaires & Cryptographie Rétro-Ingénierée

1. **Unreal Engine PAK Chunks (`0x5A6F12E1`)** :
   - Structure `FPakInfo` lue depuis la fin de fichier.
   - Déchiffrement AES-256-ECB de la table d'index avec GUID de clé 128-bit.
   - Décompression Oodle Kraken / Zstandard des payloads d'assets.
2. **Unreal Engine UAsset Packages (`0x9E2A83C1`)** :
   - Découpage en `.uasset` (header + name map), `.uexp` (exports binaires de maillages/textures), `.ubulk` (mipmaps haute résolution).
   - Extraction des vertex colors (Canaux R/G/B/A de guidage de contour et d'ombrage).
3. **CRIWARE CPK Archives (`0x204B5043`)** :
   - Table d'en-tête UTF (Universal Table Format).
   - Masquage XOR standard pour l'extraction des sons ADX2 et vidéos USM.
