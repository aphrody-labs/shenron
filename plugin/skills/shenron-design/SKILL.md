---
name: shenron-design
description: "Conçoit ou modifie l'interface Shenron (CSS DBZ, jetons, Tailwind v4 + Base UI, style et SVG Toriyama) selon l'architecture primitive → sémantique → composant de packages/ui."
---

# Design system Shenron

Appliquer le [contrat partagé](../../references/execution.md). Référence complète :
`docs/products/design-system.md` (dépôt Shenron).

1. **Choisir la couche** : valeur brute surchargeable → primitive `--dbz-*` ; alias d'usage →
   `@theme inline` de `packages/ui/src/styles.css`, toujours `var(--dbz-*, <défaut>)` ; style de
   composant → `toriyama.css` ou `packages/ui/src/components/`. Jamais de hex brut dans un composant.
2. **CSS DBZ** : réutiliser les classes existantes (`toriyama-panel`, `toriyama-speedlines`,
   `scouter-hud`, `ki-aura-*`, `border-ink*`…) et les jetons (`--color-dbz-*`, `--color-encre`,
   `--color-os`, `--color-aura-*`) avant d'en créer.
3. **Toriyama SVG** : formes dessinées avec `@aphrody/shenron-ui/toriyama-svg` depuis une mesure ; suivre
   le skill `toriyama-svg` (sources, mesure, rendu 512→16 px). Trait d'encre épais, aplats, ombre
   découpée par la silhouette, ombre portée dure.
4. **Tailwind + Base UI** : Tailwind v4 CSS-first, primitives `@base-ui/react` + `cva` + `cn`. Les pages
   publiques gardent `.btn`/`.card`/`.input` ; `<Button>` est réservé à l'admin et à Shenron Studio.
5. **Contrôler** : `bun packages/ui/scripts/generate-tokens.ts --check`,
   `bun packages/ui/scripts/check-css-equivalence.ts`, `bun --cwd packages/ui test`, puis rendu réel
   en navigateur à 1280 et 390 px. Texte visible uniquement via les dictionnaires `fr|en|ja`.
