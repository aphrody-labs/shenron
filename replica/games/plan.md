# Plan de Mise en Œuvre : Dragon Ball 2.5D Sovereign Game Platform

Rédigé d'après `replica/games/recon.md`, `replica/games/features.csv`, `replica/games/architecture.md` et `replica/games/schema.sql`.

---

## 1. Objectifs & Vision du Produit

Développer une plateforme souveraine de combat Dragon Ball 2.5D complète, combinant l'esthétique cel-shading d'ArcSys (FighterZ), la fidélité de gameplay de Budokai Tenkaichi et un moteur déterministe 60 FPS exécutable directement dans le navigateur :
1. **Intégration Canonique Totale** : Scénarios basés sur les 42 tomes d'Akira Toriyama, synchronisés avec le Wiki, le lecteur manga et le streaming anime.
2. **Technologie WebGPU & WGSL Native** : Rendu cel-shading en deux passes (contour par extrusion de normales de coque inversée + ombrage deux tons avec masques ILM).
3. **Moteur Déterministe en Rust/WASM** : Déterminisme strict frame-par-frame avec arithmétique à virgule fixe, adapté au netcode rollback compétitif.
4. **HUD Haute Résolution & Manga Immersion** : Barres de vie 15°, 7 boules sur le Dragon Radar, bulles de dialogues bilingues et onomatopées Katakana dynamiques.

---

## 2. État d'Avancement des Tranches Verticales

| Tranche | Description | État Actuel | Livrables Associés |
| :--- | :--- | :--- | :--- |
| **Tranche 1** | Boucle de combat minimale 60 FPS & Shaders WGSL | **Terminé** | `arcsys_toon.wgsl`, `arcsys-material.ts`, `canon-game-engine.ts` |
| **Tranche 2** | Scénario canonique, sagas et intégration Wiki | **Terminé** | `canon-story-manifest.json`, `canon-scenario.ts`, `/games/canon` |
| **Tranche 3** | Mécaniques de jeu (Beam Clash & Invocation Shenron) | **Terminé** | Jauge de mash rate, `DragonRadarHud.tsx`, `FighterzHpBar.tsx` |
| **Tranche 4** | Pipeline d'extraction binaire et déchiffrement AES | **Terminé** | `game-asset-extractor-pipeline.ts`, tests unitaires d'extraction |
| **Tranche 5** | Mode Tournoi Tenkaichi & Laboratoire de Frame Data | **En Cours** | Règles de ring-out, visualiseur de hitboxes et frame data |
| **Tranche 6** | Netcode Rollback Multijoueur P2P via Axum 0.8 | **À Livrer** | Intégration WebRTC DataChannels et endpoint `/api/game/bevy/tick` |

---

## 3. Plan d'Implémentation Détaillé des Tranches Restantes

### Tranche 5 : Mode Tournoi Tenkaichi & Laboratoire de Frame Data (Training)
1. **Règles Officielles du Tenkaichi Budōkai** :
   - Définition des coordonnées de l'arène (`X min: -380, X max: 380`).
   - Détection en temps réel de franchissement de limite : tout combattant projeté hors du ring perd immédiatement le round (« K.O. par Ring-Out »).
   - Arbre de tournoi à 8 ou 16 participants avec tirage au sort aléatoire et affichage des quarts, demi-finales et finale.
2. **Salle de l'Esprit et du Temps (Training & Frame Lab)** :
   - Mode d'affichage debug commutable superposant les hitboxes d'attaque en rouge semi-transparent et les hurtboxes corporelles en vert.
   - Compteur visuel d'états d'animation : Startup (démarrage du coup), Active (frappe effective), Recovery (temps de récupération vulnérable).
   - Enregistreur et boucle de répétition des actions du mannequin d'entraînement pour tester les ouvertures de garde (mixups).

### Tranche 6 : Netcode Rollback Multijoueur P2P (Axum 0.8 / WebRTC)
1. **Négociation de Salon P2P** :
   - Endpoint WebSocket `/api/game/rooms` orchestrant le hand-shake WebRTC (Offre / Réponse SDP / Candidats ICE).
   - Mesure en temps réel du RTT (Round Trip Time) et calcul du nombre de frames de délai optimal (généralement 1 à 2 frames à < 60ms).
2. **Exécution du Rollback Déterministe** :
   - Tampon d'historique de 10 frames conservant les snapshots d'états (`p1_x, p1_hp, p2_x, p2_hp, etc.`).
   - En cas de réception tardive d'un input distant, restauration de l'état n-X et re-simulation rapide (Fast-Forward) jusqu'à la frame active.
3. **Synchronisation Serveur de Secours** :
   - Pour les connexions symétriques où le P2P direct échoue, bascule automatique sur le serveur Axum 0.8 avec relai d'inputs et validation d'état.

---

## 4. Schéma de Base de Données (`replica/games/schema.sql`)

Les 9 tables relationnelles sont déjà définies et vérifiées :
- `game_profiles`, `game_fighters`, `game_fighter_forms`, `game_moves`, `game_stages`, `game_canon_chapters`, `game_match_sessions`, `game_dragon_ball_inventory`, `game_leaderboard_entries`.

---

## 5. Critères d'Achèvement Finaux (Definition of Done)

- [ ] L'arbre de tournoi Tenkaichi permet de mener un championnat complet jusqu'à la victoire finale.
- [ ] Le laboratoire d'entraînement affiche fidèlement les hitboxes et la frame data sans impacter les 60 FPS.
- [ ] Deux onglets ou deux navigateurs peuvent s'affronter en ligne avec synchronisation fluide et gestion des micro-désynchronisations.
- [ ] L'ensemble des tests `bun test packages/engine` et `just deploy-check` demeurent verts.
