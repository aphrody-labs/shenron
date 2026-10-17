<!-- SPDX-License-Identifier: Apache-2.0 -->

# Design system Shenron

Source unique : `packages/ui` (`@aphrody/shenron-ui`). Ce document cartographie ses quatre
volets selon l'architecture à trois couches ; en cas d'écart, le code fait foi.

## Trois couches

| Couche     | Rôle                                                       | Où                                  | Exemple                                            |
| ---------- | ---------------------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| Primitive  | Valeur brute, surchargeable au runtime par `/admin/design` | `--dbz-*`, `--toriyama-*`           | `--dbz-orange`                                     |
| Sémantique | Alias d'usage avec repli sur la primitive                  | `@theme inline` de `src/styles.css` | `--color-dbz-orange: var(--dbz-orange, #e78220)`   |
| Composant  | Classe ou composant qui ne lit que le sémantique           | `toriyama.css`, `src/components/`   | `.toriyama-panel`, `<Button variant="dragonball">` |

Règles : aucun hex brut dans un composant ; toute valeur de palette s'écrit
`var(--dbz-*, <défaut>)` ; les jetons TypeScript (`src/tokens.ts`) sont générés, jamais édités.

## 1. CSS DBZ

- Palette : `--color-dbz-{bg,card,border,orange,orange-dark,blue,yellow,red,green,…}`,
  calibrée sur la couverture de tankōbon (accent = orange du gi, `#e78220`, 7,18:1 sur fond noir).
- Matière : encre `--color-encre` et papier `--color-os` (trait clair sur fond sombre),
  aplats de couverture `--color-{case-ciel,gi-*,ecaille-*,peau,nuage-*}`, logo `--color-logo-*`.
- Énergie : `--color-dbz-{ember,ki,amber}`, dégradés `--gradient-{galactic,nebula}` dérivés de l'accent.
- Auras : `--color-aura-{ssj,kaioken,god,blue,ui,beast}-{core,flare,outer}` (+ `spark`).
- Classes (`src/toriyama.css`, `@layer components`) : cadres `border-ink*`, `toriyama-panel[-slanted]`,
  `toriyama-speedlines[-horizontal]`, `toriyama-burst`, `toriyama-halftone[-dense]`, `capsule-*`,
  `scouter-hud[-red]`, `ki-aura-*`, `shockwave-ring`, `toriyama-speech-bubble`, `toriyama-btn`, `budokai-slab`.
- Régénération : `bun packages/ui/scripts/generate-tokens.ts [--check]` ; équivalence du CSS compilé :
  `bun packages/ui/scripts/check-css-equivalence.ts`.

## 2. SVG et style Toriyama

- Géométrie : `@aphrody/shenron-ui/toriyama-svg` (arcs, volutes, mèches, plan d'ombre, sphère,
  Kinto-Un, motifs de couverture, palette) ; composants React : `@aphrody/shenron-ui/toriyama`
  (`DragonBallSphere`, `KintoUnCloud`, `KiAura`, `ShenronSilhouette`, `ScouterHudOverlay`…, catalogue `catalog.json`).
- Style : trait d'encre épais cerné, aplats sans dégradé, ombre découpée par la silhouette,
  saturation conservée à l'ombre, ombres portées dures (`4px 4px 0 encre`), cases koma-wari.
- Toute forme vient d'une mesure sur manga ou couverture, jamais d'un décalque ni d'une
  vectorisation automatique ; mesures dans `plugin/skills/toriyama-svg/references/mesures/`.
- Rendu : `bun scripts/rendu.ts dessin.svg` (512→16 px, fonds clair et sombre) avant toute livraison.

## 3. Tailwind v4 + Base UI

- Tailwind v4 CSS-first : `@import "tailwindcss"; @import "@aphrody/shenron-ui/styles.css";` (le paquet
  déclare ses propres `@source`). Aucune config JS.
- Primitives accessibles : `@base-ui/react` + `class-variance-authority` + `cn` (`lib/utils`) dans `src/components/`
  (button, dialog, select, tabs, tooltip, toast…). Variantes de marque : `dragonball`, `saiyan`,
  `scouter`, `capsule`.
- Frontière : les pages publiques gardent `.btn`, `.card`, `.input`, `.badge*` (adossés à `--color-dbz-*`) ;
  `<Button>` et la trousse Base UI servent admin et Shenron Studio. Pas de substitution sans revue visuelle.
- Contraintes : `min-width: 0` sur les enfants de grille, colonnes `minmax(0, 1fr)`, cible tactile `.cible-44`,
  tout texte via `apps/site/messages/{fr,en,ja}.json`.

## 4. Skill

Le skill `shenron-design` du plugin (`plugin/skills/shenron-design/`) applique ce document : ordre de
lecture, choix de couche, commandes de contrôle. Il complète `toriyama-svg` (formes) sans le dupliquer.

## Contrôles

```sh
bun packages/ui/scripts/generate-tokens.ts --check
bun packages/ui/scripts/check-css-equivalence.ts
bun --cwd packages/ui test
bun fmt <chemins>
```
