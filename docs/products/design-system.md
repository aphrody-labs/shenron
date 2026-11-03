<!-- SPDX-License-Identifier: Apache-2.0 -->

# Design system Shenron

Source unique : `packages/ui` (`@aphrody/shenron-ui`). Ce document cartographie ses quatre
volets selon l'architecture à trois couches ; en cas d'écart, le code fait foi.

## Direction immersive du wiki

La demande propriétaire du 3 novembre 2026 fait évoluer le portail vers une scène
illustrée navigable, avec Goku, Kid Buu et Shenron, et une visibilité équivalente pour
les rubriques du wiki. Les composants ne doivent pas reconduire automatiquement les
grandes introductions vides, les portraits de remplissage ou les grilles répétitives.
Le nouveau rendu utilise WebGPU explicitement, sans création de contexte WebGL.
La recherche, les liens et la navigation restent utilisables dans le DOM et en SVG.

Le skill complet UI/UX Pro Max est installé dans `.agents/skills/ui-ux-pro-max/` :
catalogues, scripts, modèles et références. `UPSTREAM.json` épingle sa provenance.
Ses recommandations doivent être sélectionnées pour le produit ; une suggestion de
page FAQ ou de palette générique ne définit pas la direction artistique du wiki.

La palette, la typographie, les niveaux de profondeur, les espacements et les rôles
du mouvement restent des contrats partagés. React porte la structure sémantique et
la navigation ; le moteur de scène porte le dessin. Les interfaces Rust concernées
doivent consommer les mêmes décisions plutôt que maintenir une seconde palette.
Les tokens générés ne se modifient pas à la main. La présence du skill ne prouve pas
que les anciens composants ont déjà été migrés ou que le rendu a été qualifié.

Exemple de recherche locale, avec Bun et un Python déjà disponible :

```sh
bun uv run --no-project --no-python-downloads .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus navigation" --domain ux
```

Les constructions et déploiements sont suspendus sur instruction du propriétaire.
Conserver les contrôles de rendu, de clavier, de contraste et de ressources comme
portes de livraison à exécuter lors de leur reprise ; ne pas les déclarer réussis.

### Outils visuels épinglés et installation globale

Les versions de UI/UX Pro Max et 3dviz Pro Max sont fixées dans
[`.agents/visual-skills.lock.json`](../../.agents/visual-skills.lock.json).
L'installation complète conserve les catalogues, scripts, références et modèles,
ainsi que leurs licences. Elle vérifie les fichiers par SHA-256 et sauvegarde une
installation différente avant remplacement, hors des répertoires de découverte.

```sh
bun scripts/ops/install-visual-skills.ts
bun scripts/ops/install-visual-skills.ts --check
```

Le script installe les deux skills dans `~/.codex/skills`, `~/.claude/skills` et
`~/.gemini/config/skills` (AGY). Sur Windows, si `git` est un shim de shell,
définir `SHENRON_GIT_BIN` sur le binaire Git natif. Les prochaines sessions doivent
redécouvrir ces skills ; la copie des fichiers ne prouve pas leur invocation dans
une application déjà ouverte.

3dviz guide la composition, les silhouettes, la lumière, le transfert Blender/glTF
et l'inspection. Ses modèles Three.js ne sont pas copiés aveuglément : leur repli
WebGL est incompatible avec ce projet. Pixi porte la scène illustrée en WebGPU ;
Three sert les objets 3D pertinents, à chargement différé et avec un backend
WebGPU explicite. `shenron-gpu` reste propriétaire des capacités wgpu Rust.
Les captures d'épisodes et planches couleur alimentent des découpes traçables :
un recadrage raster n'est ni un SVG vectoriel ni un personnage détouré.

Les exports depuis les frames et planches existantes passent par
[`scripts/media/wiki-scene-assets`](../../scripts/media/wiki-scene-assets/README.md) :
sources vérifiées, rectangles explicites, PNG, atlas Pixi standard et receipt
déterministe. Le CLI possède ses reprises et ses limites de mémoire ; il ne possède
ni l'extraction vidéo amont ni la publication CDN. L'adaptateur
[`@aphrody/shenron-ui/scene3d`](../../packages/ui/src/scene3d/README.md) possède le
chargement GLB vérifié et le renderer Three strict WebGPU. Ses contrôles statiques
ne remplacent pas la qualification des matériaux et du périphérique réel.

Pour installer les dépendances de cette chaîne sous Windows sans les jonctions
incomplètes du store global Bun, utiliser `$env:BUN_INSTALL_GLOBAL_STORE='0'` avant
`bun install --frozen-lockfile --ignore-scripts`. Cette installation n'exécute ni
scripts de paquet, ni build, ni serveur.

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
