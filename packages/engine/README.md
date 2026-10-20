# @aphrody/shenron-engine

Moteur métier partagé de Shenron.

Cette unité appartient au workspace Git `aphrody-labs/shenron`.

## Développement

Depuis le monorepo parent : `bun install --frozen-lockfile`, puis la commande de test ou de build déclarée dans ce package.

## Atlas manga Rust → Canvas 2D

`shenron panels --sheet --sheet-gif` produit le PNG normalisé et son manifeste v1.
Le consommateur `@aphrody/shenron-engine/sprite-atlas` charge ces fichiers frères,
valide leurs dimensions et l'ordre des images, puis dessine la tuile choisie sur
Canvas 2D sans interpoler les pixels :

```ts
import { loadSpriteAtlas } from "@aphrody/shenron-engine/sprite-atlas";

const clip = await loadSpriteAtlas(new URL("sheet.layout.json", location.href));
clip.player.draw(context, clip.image, 1500, { x: 0, y: 0, scale: 2 });
clip.close();
```

Le temps est fourni en millisecondes par la boucle de l'application ; aucun
timer ni lecture automatique ne démarre à l'import. `frameAt(time, false)` reste
sur la dernière image en fin de séquence ; le comportement par défaut boucle.
Le propriétaire peut arrêter sa boucle pour respecter les mouvements réduits.
La bitmap doit être fermée à la fin. Le chargeur accepte au plus 1 Mio de JSON,
64 Mio de PNG, 4096 images et une texture de 8192 pixels par côté ; il omet les
identifiants HTTP et refuse les redirections.

Les cases restent des dessins fixes animés par découpage. Le SVG exporté par
Rust contient les pixels du scan dans un cadre vectoriel. La scène WebGPU de
cases en parallaxe et les modèles 3D reconstruits sont des capacités distinctes.

## Capacités et portes — 18 octobre 2026

| Capacité                    | Propriétaire et état réel                                                                                                                                 | Qualification de ce lot et prochaine étape                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trait SVG et icônes         | Icônes dessinées manuellement depuis une géométrie mesurée dans `packages/ui/src/toriyama-svg/`. L'export `shenron-panels` encadre un scan raster.        | Aucune vectorisation automatique du trait livrée. Une icône supplémentaire exige référence inspectée, mesures, dessin et rendu aux tailles utiles.                                    |
| Atlas manga → Canvas 2D     | `shenron-panels` produit PNG + manifeste ; `sprite-atlas.ts` les consomme sans autre moteur.                                                              | Vraie planche couleur ch.516, 1662 × 2560 : cinq segments (titre et quatre cases), atlas 784 × 520. Chrome compare exactement les pixels des tuiles 0, 1 et 4 au Canvas 256 × 256.    |
| Animation 2D                | `Sheet::gif()` anime les tuiles réelles ; `SpriteAtlasPlayer` fournit leur index temporel et le dessin Canvas.                                            | GIF relu : cinq images de 500 ms. Tests de boucle, arrêt, ordre et padding. Les poses intermédiaires, rigging et détourages de personnages restent à produire et relire.              |
| WASM                        | Le propriétaire Rust `shenron-panels` reste compilable pour `wasm32-unknown-unknown`.                                                                     | Check de la bibliothèque vert. Cette porte ne prouve pas une exécution WebGPU ni de nouveaux bindings JavaScript.                                                                     |
| Scène 3D wgpu               | `shenron-engine::render::manga_scene` place les cases sur des quads texturés en parallaxe ; il réutilise la segmentation canonique.                       | Source existante ; GPU non requalifié dans ce lot. Prochaine porte : goldens avec `SHENRON_REQUIRE_GPU=1`, puis rendu navigateur WebGPU.                                              |
| Maillage 3D depuis un manga | Aucun reconstructeur de personnages ou de décors depuis une planche. Les modèles procéduraux et lecteurs de modèles existants ne remplissent pas ce rôle. | Reste un pipeline de géométrie, topologie, textures et validation de plusieurs vues ; une profondeur de case ne constitue pas un mesh du sujet.                                       |
| VFX Dragon Pixel            | `dragon-pixel` produit des particules CPU et des paquets de rendu ; sa vue Bevy est optionnelle.                                                          | Aucun nouveau VFX GPU ni import d'atlas dans la vue Bevy qualifié ici. Prochain lot : connecter une séquence validée aux événements de combat et vérifier durée, libération et rendu. |

Le lot natif `shenron-panels` passe 25 tests et Clippy avec avertissements refusés ;
un test de scan est ignoré par défaut, l'exemple réel ci-dessus étant exécuté séparément.
Les captures, scans et exports de preuve restent privés dans `var/reports/engine-assets/`.

## Séquence de combat Canvas — 20 octobre 2026

`CombatAtlasEffect`, exporté par `./combat-atlas`, relie le lecteur existant à une
séquence finie sans créer de timer. Dragon Pixel le déclenche sur le callback
`special` émis par sa simulation après acceptation du coup, et non sur une simple
touche pressée. Les cinq tuiles à 2 images/seconde jouent une fois en 2,5 secondes.
La pause et la page masquée figent son horloge ; un dialogue, la fin du combat
et un nouveau chapitre l'arrêtent. Les mouvements réduits refusent et arrêtent cette animation facultative.
La bitmap est réutilisée entre les attaques, puis fermée exactement une fois au
démontage ; le chargement est annulé si la page disparaît avant sa fin.

Le dérivé réel du chapitre 516 et son manifeste avec empreinte PNG sont désormais
dans `packages/ui/assets/assets/manga/dragon-pixel/chapter-516/`. La copie canonique
des assets produit `/assets/manga/dragon-pixel/chapter-516/sheet.layout.json` pour le
prochain build du site. Seuls l'atlas, son manifeste et une provenance publique
minimale sont publiés ; les captures de qualification et le scan source restent privés.
Il s'agit du titre et de quatre cases narratives, sans nouvelle pose ni reconstruction.

Chrome a qualifié le vrai composant React sur un hôte source isolé : attaque au
clavier, indices 0 à 4, durée, pause, préférence de mouvement et fermeture unique
de la bitmap. L'empreinte reçue correspond au PNG publié. La route Next locale
complète reste bloquée par la résolution Turbopack de dépendances isolées sous
Windows ; cette preuve ne prétend pas qualifier la prochaine image publique.
