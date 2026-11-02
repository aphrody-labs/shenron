# Illustrations et effets « vie » des pages

Décors des en-têtes, états vides et 404 (`packages/ui/src/vie/`, `packages/ui/src/vie.css`, classes `.vie-*`).

## Méthode et sources

Aucune forme nouvelle n'a été dessinée : chaque scène assemble des objets dont la mesure est déjà
consignée et dont la géométrie est maintenue dans `packages/ui/src/toriyama-svg/`.

| Scène (`VieArt kind`)          | Objet                                 | Mesure d'origine                                                                                    | Géométrie                      |
| ------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| `spheres`                      | sept boules de cristal, 1 à 7 étoiles | couverture du tome 1 (`DragonBall.tsx`, en-tête : cercle ajusté par cordes, foyer, rouge `#E81F23`) | `sphere.ts`                    |
| `kinto`                        | Kinto-Un                              | `plugin/skills/toriyama-svg/references/mesures/kinto-un-analyse-visuelle.md`                        | `kinto-un.ts`                  |
| `senzu`                        | trois senzu                           | `.../senzu-analyse-visuelle.md`                                                                     | `senzu.ts`                     |
| `ki`                           | étoile de couverture                  | `.../couverture-analyse-visuelle.md`                                                                | `couverture.ts` (`etoilePath`) |
| gerbe (derrière `kinto`, `ki`) | segments radiaux à trait fin          | générateur `radialSpeedlines` déjà maintenu (`geometry.ts`) ; trait de 1,5 px, opacité 0,3          | `geometry.ts`                  |
| `SectionDivider`               | filet + trois étoiles (8/12/8 px)     | même étoile de couverture                                                                           | `couverture.ts`                |

Palette : celle des objets (aplats mesurés) ; la gerbe et l'étoile prennent `currentColor` / `--color-dbz-gold`.
Ni artwork officiel recopié, ni vectorisation automatique, Fandom exclu.

## Objets refusés faute de référence mesurée

Radar du dragon (le composant `DragonRadarDisplay` existe mais n'a pas de document de mesures),
capsule Hoi-Poi, boule de cristal « à étoiles » distincte de la boule de dragon, nuage de ki,
plume/encre, grille de cases manga, tampon de rang, éclat de vitesse « manga » (la gerbe ci-dessus
est un tracé géométrique générique, pas une reproduction d'une planche). Ils ne seront dessinés
qu'après relevé sur une planche (`apps/bot/assets/manga/…`) consigné dans un document de mesures.

## Effets (coût)

- Apparition au scroll et pause hors écran : une `IntersectionObserver` par décor (`Reveal`, client,
  ~1 Ko) ; sans JS, tout reste visible ; un décor déjà à l'écran n'est jamais masqué (pas de CLS).
- `vie-float`, `vie-twinkle` : propriétés `translate`, `scale`, `opacity` seulement ; en pause
  tant que `data-vie-live` n'est pas `true` ; coupés sous `prefers-reduced-motion`.
- `vie-glow` (lueur dorée au survol, pseudo-élément, opacity), `vie-speed` (lignes de vitesse à 6 % d'opacité,
  masquées vers le texte), `vie-aura` : disponibles, statiques.
- Poids : `VieArt spheres` ≈ 7 SVG (< 40 Ko de HTML) ; la CSS ajoute ≈ 2,5 Ko.
- Les décors sont masqués sous 1024 px (`invisible`, jamais `display:none` : les dégradés des boules
  partagent leurs identifiants entre instances et ne doivent pas être dans un sous-arbre `display:none`).

## Où

En-têtes : classements (`spheres`), manga (`kinto`), databooks (`ki`), atelier (`senzu`), actualités (`kinto`,
`VieStage`). États vides illustrés et traduits (`vie.*` dans `messages/{fr,en,ja}.json`,
`apps/site/src/lib/vie-empty.ts`) : podium des classements, actualités, recherche de la boutique. 404 traduite.
