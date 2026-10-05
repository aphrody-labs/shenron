# `@shenron/ui/koharu` — l'éditeur de traduction manga

L'éditeur React de Koharu (projets, planches, détection, OCR, traduction, nettoyage,
lettrage, export PSD) vit ici, dans la couche UI unique de Shenron. Il n'existe pas d'autre
interface Koharu : le site le monte sur `/koharu` (`apps/site/src/app/koharu/KoharuEditor.tsx`)
et seule l'application de bureau `shenron-desktop` le rend utilisable ; dans un navigateur, la
page explique où le trouver.

## Moteur et transports

- Les commandes et leurs types viennent de `@shenron/koharu/protocol`, généré par Specta
  depuis `koharu-app` (`bun --filter @shenron/koharu protocol`, ne pas éditer à la main).
  `shenron-desktop` (fonctionnalité `koharu`) enregistre ces commandes sous leurs noms
  d'origine et exécute le moteur `koharu-library` dans son propre processus.
- Le canevas passe par `@shenron/koharu/canvas` (WASM WebGPU de `crates/koharu-canvas`,
  construit par `bun --filter @shenron/koharu build:wasm` avant tout build du site et émis par
  Next sous `_next/static/media/`). Le module se compile en streaming ;
  `preloadCanvasModule()` en lance le téléchargement avant l'ouverture de l'éditeur. Sans
  WebGPU, `createCanvas` rejette une `CanvasUnavailableError` (« WebGPU indisponible : … »)
  que `useCanvas` affiche telle quelle ; la perte du device reste remontée par son rappel.
- Hors Tauri, `@shenron/koharu/native` parle au même moteur par `koharu-sdk` en JSON Lines sur
  stdio ; c'est la voie de la chaîne éditoriale (`@shenron/pipeline`), pas celle de l'éditeur.
- `components/ShenronExportPanel.tsx` exporte vers la chaîne Shenron par
  `@shenron/pipeline/koharu`.

## Entrées

`./koharu` (barrel), `./koharu/providers` (état et requêtes React), `./koharu/navigation`
(onglets des réglages, panneaux latéraux, menus), `./koharu/components/*`, `./koharu/lib/*`,
`./koharu/locales/*` (trois dictionnaires : `fr-FR` de référence, `en-US`, `ja-JP`) et `./koharu.css`. Les réglages du moteur passent par
`components/preferences/SettingsPage.tsx` ; les primitives propres à l'éditeur restent
internes (`internal/`).

## Styles

`./koharu.css` (`editor.css`) n'est importé que par la route `/koharu` : jetons M3 d'Aphrody,
puis `styles.css`, dont chaque règle est bornée à `[data-koharu-ui]` et
`[data-koharu-ui-layer]`. La police Noto Sans CJK variable (japonais, coréen, chinois) est
livrée sous SIL OFL 1.1 (`assets/OFL.txt`).
