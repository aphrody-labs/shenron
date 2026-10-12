# `@aphrody/shenron-ui/koharu` — l'éditeur de traduction manga

L'éditeur React de Koharu (projets, planches, détection, OCR, traduction, nettoyage,
lettrage, export PSD) vit ici, dans la couche UI unique de Shenron. Le site le monte sur `/studio`
(`apps/site/src/app/studio/StudioEditor.tsx`) et Shenron Studio le rend utilisable en Tauri ou
dans un navigateur servi par `shenron-server` lorsque le moteur local est disponible.

## Moteur et transports

- Les commandes et leurs types viennent de `@aphrody/shenron-koharu/protocol`, généré par Specta
  depuis `koharu-app` (`bun --filter @aphrody/shenron-koharu protocol`, ne pas éditer à la main).
  `shenron-desktop` (fonctionnalité `koharu`) enregistre ces commandes sous leurs noms
  d'origine et exécute le moteur `koharu-library` dans son propre processus.
- Le canevas passe par `@aphrody/shenron-koharu/canvas` (WASM WebGPU de `crates/koharu-canvas`,
  construit par `bun --filter @aphrody/shenron-koharu build:wasm` avant tout build du site et émis par
  Next sous `_next/static/media/`). Le module se compile en streaming ;
  `preloadCanvasModule()` en lance le téléchargement avant l'ouverture de l'éditeur. Sans
  WebGPU, `createCanvas` rejette une `CanvasUnavailableError` (« WebGPU indisponible : … »)
  que `useCanvas` affiche telle quelle ; la perte du device reste remontée par son rappel.
- Hors Tauri, `@aphrody/shenron-koharu/native` parle au même moteur par `koharu-sdk` en JSON Lines sur
  stdio ; c'est la voie de la chaîne éditoriale (`@aphrody/shenron-pipeline`), pas celle de l'éditeur.
- `components/ShenronExportPanel.tsx` exporte vers la chaîne Shenron par
  `@aphrody/shenron-pipeline/koharu`. Le serveur local relaie cet envoi vers le vrai catalogue
  manga du bot via `/api/local/koharu/candidates`, sans exposer le jeton au navigateur.
- Le même pont expose `/api/local/koharu/catalog` : il relaie les routes publiques
  `/api/public/manga/tomes` et `/api/public/manga/tomes/:series/:volume`. L'éditeur peut ainsi
  sélectionner DB ou DBS, récupérer les numéros de planches et prévisualiser l'OCR publié.
  `db_manga_pages` ne contient pas les empreintes ni les chemins des images source ; ces champs
  restent donc soumis au manifeste éditorial, sans valeur inventée.

## Entrées

`./koharu` (barrel), `./koharu/providers` (état et requêtes React), `./koharu/navigation`
(onglets des réglages, panneaux latéraux, menus), `./koharu/components/*`, `./koharu/lib/*`,
`./koharu/locales/*` (trois dictionnaires : `fr-FR` de référence, `en-US`, `ja-JP`) et `./koharu.css`. Les réglages du moteur passent par
`components/preferences/SettingsPage.tsx` ; les primitives propres à l'éditeur restent
internes (`internal/`).

## Styles

`./koharu.css` (`editor.css`) n'est importé que par la route `/studio` : jetons M3 d'Aphrody,
puis `styles.css`, dont chaque règle est bornée à `[data-koharu-ui]` et
`[data-koharu-ui-layer]`. La police Noto Sans CJK variable (japonais, coréen, chinois) est
livrée sous SIL OFL 1.1 (`assets/OFL.txt`).
