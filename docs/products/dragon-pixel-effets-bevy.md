<!-- SPDX-License-Identifier: Apache-2.0 -->

# Dragon Pixel : SFX, VFX et sprite sheets avec Bevy

Recherche du 2026-10-17 sur Bevy 0.19 (celui de `crates/dragon-pixel`, feature `bevy`) et sur ce
que le dépôt fournit déjà. Sources : exemples officiels de Bevy (`play_sound_effect`,
`spatial_audio_2d`, `sprite_animation`, `animated_mesh_events`), documentation de `bevy_hanabi`.

## 1. Ce que Bevy fournit

### SFX (`bevy_audio`)

- Un son est une entité : `AudioPlayer::new(handle)` + `PlaybackSettings`.
- Un coup unique : `PlaybackSettings::DESPAWN` (l'entité disparaît à la fin du son) ; une boucle :
  `PlaybackSettings::LOOP`.
- Spatialisation : `PlaybackSettings::with_spatial(true)` sur l'émetteur et un `SpatialListener`
  sur la caméra ; en 2D, `AudioPlugin { default_spatial_scale: SpatialScale::new_2d(1.0 / 100.0) }`
  règle la distance (100 px = 1 unité).
- Le chargement passe par `AssetServer::load`, donc par le même chemin que les textures : le CDN
  `https://cdn.dragonballfr.com/assets/dragon-pixel/` suffit (déjà prévu par `archived/README.md`).
- Navigateur : l'audio est débloqué par un geste de l'utilisateur ; le moteur ne doit jamais
  supposer qu'un son peut démarrer à l'ouverture.

### VFX

- **Particules CPU** : un composant `Particle { lifetime: Timer, velocity }` et un système qui
  avance et détruit ; c'est ce que montre `animated_mesh_events` (22 lignes). Convient aux étincelles
  d'impact (14 à 60 particules).
- **Particules GPU** : `bevy_hanabi` (compute shaders). Il ne fonctionne en wasm que sur WebGPU et
  son suivi de version Bevy accuse du retard (dernier suivi connu : 0.18 ; Bevy 0.19 est sorti le
  2026-06-19, Bevy 0.20 le 2026-10-08). À ne pas ajouter tant qu'une version compatible 0.19 n'est
  pas publiée et qualifiée.
- **Événements d'animation** : `AnimationEvent` + observateur (`add_observer`) déclenchent un son
  et des particules à une image précise d'un clip (pas du pied, coup porté).
- Postprocess (flou radial, éclair) : passes `Camera` + `Bloom`/`ColorGrading` natives de Bevy ;
  la ligne d'impact « manga » reste un sprite.

### Sprite sheets

- `TextureAtlasLayout::from_grid(tile, colonnes, lignes, marge, décalage)` décrit une grille ;
  `Sprite { image, texture_atlas: Some(TextureAtlas { layout, index }) }` affiche une case.
- Animation : un `Timer` par sprite (`1/fps`) qui incrémente `atlas.index` entre deux bornes.
- Netteté pixel : `DefaultPlugins.set(ImagePlugin::default_nearest())`.
- Une grille régulière est obligatoire. Les planches manga ne sont pas régulières : il faut donc
  les **normaliser** vers une grille avant de les confier à Bevy (voir § 3).

## 2. Ce que le dépôt fait déjà

| Besoin                        | État actuel                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Boucle de combat déterministe | `dragon-pixel` (`combat.rs`, 1 065 lignes), particules CPU `Particle` et `ParticleRenderData` dans le paquet de rendu                                              |
| Rendu Bevy dans le navigateur | `dragon-pixel/src/bevy_view.rs` (feature `bevy` ; Bevy `3d`, `web`, `webgpu`)                                                                                      |
| Pack de sons du site          | `apps/site/public/sfx/` (52 fichiers, MyInstants, droits déclarés par l'équipe) lus par `apps/site/src/lib/sfx.ts` (Howler) ; **aucun son n'est branché sur Bevy** |
| Sprites                       | `apps/site/public/dbz/characters/` (artworks, pas de feuilles de sprites) ; aucun `TextureAtlas` dans les crates                                                   |
| Découpe de planches           | `shenron-panels` (cases, PNG, SVG, GIF)                                                                                                                            |
| Archives du jeu Xenoverse 2   | dump complet sur la fabrique (140 009 fichiers, 26 CPK) ; audio CRI (ACB/AWB/HCA) non décodé par `shenron-re`                                                      |

## 3. Générer des sprite sheets depuis le manga

Chaîne proposée, chaque étape produisant un fichier relisible :

1. **Cases** : `shenron panels --chapter <id> --page <n> -o <dossier>` (rectangles et PNG par case).
2. **Sélection** : l'éditeur choisit les cases d'une action (garde d'Aoi, coup de poing, Kamehameha)
   dans l'ordre de lecture ; un fichier `sequence.json` liste `{ chapitre, page, case }`.
3. **Normalisation** : toutes les cases sont recadrées sur le même cadre (taille de cellule
   commune, personnage aligné sur son point d'appui, fond transparent seulement si le détourage
   est fiable) puis assemblées en grille.
4. **Feuille** : PNG de grille + `layout.json` (`tile`, `colonnes`, `lignes`, `fps`, `bornes`).
5. **Bevy** : `TextureAtlasLayout::from_grid` lit `layout.json` ; l'animation reprend le patron
   de `sprite_animation`.

Limites à garder en tête : une case de manga est un dessin fixe, pas une image d'animation ; la
feuille obtenue est un **découpage animé** (type « motion comic »), pas une animation intermédiaire.
Le détourage automatique des personnages n'est pas fiable sur des planches à trame et doit être
vérifié à l'œil, case par case.

## 4. Sources de VFX et de SFX

- **Épisodes** (`data/source-acquisition/episodes/`, privés, attestation propriétaire Toei/Shueisha) :
  images clés par détection de scène, pour des effets de ki ou d'impact. Le fichier reste privé ;
  seuls les extraits autorisés et leur provenance sont publiés (manifeste privé).
- **Xenoverse 2** : le dump contient 926 effets (EEPK) et 15 727 banques audio (ACB/AWB). Les lire
  demande un décodeur EEPK et HCA qui n'existe pas encore dans `shenron-re`. Les droits de ces
  éléments appartiennent à Bandai Namco et Dimps : l'attestation du propriétaire ne les couvre pas ;
  leur publication demande une licence propre. Un usage privé sur la fabrique reste possible.
- **Procédural** : particules CPU en code original (Apache-2.0), sans question de droits.

## 5. Plan

1. SFX dans Dragon Pixel : charger quelques sons du pack du site par `AssetServer`, jouer un
   `DESPAWN` sur les événements `haptic`/`audio` déjà produits par le moteur (`haptics.rs`).
2. Particules CPU Bevy depuis `ParticleRenderData` (aucune dépendance de plus).
3. Format `layout.json` + `shenron panels --sheet` pour la normalisation en grille.
4. Reporter `bevy_hanabi` jusqu'à une version compatible Bevy 0.19, à qualifier sur WebGPU.
