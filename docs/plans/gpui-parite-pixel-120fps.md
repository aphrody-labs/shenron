# Parité au pixel et 120 images par seconde : méthode et critères

Relevé du 2026-11-19. Suite de [base-ui-vers-gpui.md](base-ui-vers-gpui.md) et de la [matrice de parité](base-ui-gpui-parity-matrix.md). Ce texte fixe comment mesurer, pas ce qui est déjà atteint : aucune mesure de parité ni d'images par seconde n'existe encore pour GPUI dans ce dépôt.

## Outils vérifiés

| Besoin | Outil | Version lue | Remarque |
| --- | --- | --- | --- |
| Capture, WebGPU et mesure du rendu web | navigateur Aphrody (`aphrody-labs/browser`, moteur `blink` : Chromium `headless_shell` avec Skia et Dawn, piloté par CDP) | tête `eec64646882` du 2026-11-18 | sans tête et automatisé ; `testing/acceptance.ts` sonde déjà `navigator.gpu.requestAdapter()`, prend les captures et lance `bench` (hyperfine et JetStream). `agent-browser` n'est pas utilisé |
| Capture et pilotage de la fenêtre native GPUI | `agent-desktop` | 2.6 | `screenshot` (PNG d'une fenêtre), `snapshot` (arbre d'accessibilité en JSON), `list-displays`, `press`, `click` ; sur cette machine : écran 2560 x 1440, échelle 1,25, fréquence non rapportée |
| Mesure de durées de commandes | `hyperfine` | 2.0.0 | démarrage à froid du binaire, instanciation wasm, `--warmup` et `--export-json` |
| Différence d'images | `pixelmatch` | 8.0.0 (npm) | alternative : `odiff-bin` 4.5.0 |
| Débit JavaScript et WebAssembly du navigateur | JetStream (`WebKit/JetStream`, dernier push 2026-11-04) | non épinglé | mesure le moteur, pas une interface : sert de référence de non-régression du runtime wasm, jamais de preuve d'images par seconde |
| Compteur d'images natif | crate `gpui-fps` de `longbridge/gpui-kit` | 0.10.0 | présent dans l'espace de travail amont |

Non trouvés : `test-tui` (absent du PATH, de npm et de crates.io, aucune occurrence dans le monorepo Aphrody sauf des crates `nsh-tui-*` sans rapport) et `hyperfind` (lu comme `hyperfine`). Un test de terminal ne mesure pas un rendu GPU ; il n'entre donc pas dans cette méthode tant que l'outil exact n'est pas désigné.

## Parité au pixel : ce que « pixel perfect » peut vouloir dire

Le DOM rastérise le texte avec le moteur du navigateur (crénage, hinting, sous-pixels) ; GPUI le rastérise avec son propre atlas de glyphes. Une égalité octet à octet sur le texte n'est pas atteignable. La méthode retient donc :

1. Même fenêtre pour les deux côtés : 1920 x 1080, échelle 1 puis 2, thème clair puis sombre, police identique chargée explicitement, animations coupées, curseur et focus fixés.
2. Une galerie par côté, avec un identifiant stable par état (`button/default`, `button/hover`, `button/focus-visible`, `button/disabled`, et ainsi de suite) : `packages/ui` (Base UI et Tailwind) en web, une crate de galerie `gpui-kit` côté natif, alimentées par les mêmes jetons.
3. Comparaison par `pixelmatch` en deux masques : la géométrie (boîtes, bordures, ombres, remplissages) doit être égale à zéro pixel d'écart au seuil de `pixelmatch` ; le texte est comparé par position et boîte englobante (`agent-desktop snapshot` donne les limites) et par différence perceptuelle, avec un seuil fixé après la première mesure et consigné ici, pas avant.
4. Sortie machine : un JSON par état (`pixels_diff`, `ratio`, `bounds_delta`) et une image de différence ; la porte échoue au-dessus du seuil de l'état.

## 120 images par seconde en HD : la porte

Critère : sur une fenêtre de 1920 x 1080, pendant une interaction scriptée de 10 secondes (défilement, ouverture et fermeture de dialogue, survol, saisie), le temps de trame au 99e centile est au plus de 8,33 ms (1000 / 120) et aucune trame ne dépasse 16,7 ms. Sinon la porte échoue : pas de dérogation par composant.

- Web : intervalles `requestAnimationFrame` et `PerformanceObserver` (`long-animation-frame`, `event`) relevés par CDP dans le moteur `blink` du navigateur Aphrody ; l'adaptateur WebGPU obtenu en mode sans tête est consigné, et une mesure faite sur un adaptateur logiciel ne compte pas pour la porte. Un écran à 60 Hz plafonne `requestAnimationFrame` à 16,7 ms : le temps de travail par trame (script, mise en page, GPU) se lit via le profil, et la mesure à 120 Hz exige un écran capable de 120 Hz, à relever avant de conclure quoi que ce soit.
- Natif : `gpui-fps` pour le compteur, `gpui-fast` (0.1.17) pour la réutilisation de trames ; relevé sur le même matériel que le web.
- Démarrage : `hyperfine --warmup 3 --runs 20` sur le lancement du binaire de galerie et sur le chargement du wasm, en JSON.
- Le matériel de mesure est consigné avec chaque résultat (processeur, GPU, écran, fréquence, pilote) ; un résultat sans matériel n'est pas une preuve.

## Livrables et ordre

| # | Livrable | Sortie prouvée par |
| --- | --- | --- |
| 1 | Galerie web des 6 premiers composants (button, checkbox, switch, tabs, dialog, select) depuis `packages/ui` | captures par état, déterministes (deux exécutions, 0 pixel d'écart) |
| 2 | Galerie GPUI des mêmes 6 composants | captures par état via `agent-desktop screenshot`, déterministes |
| 3 | Script de différence et rapport JSON | seuils consignés dans ce fichier après la première mesure |
| 4 | Banc d'images par seconde web et natif | rapport avec le matériel, p99 et maximum, pass ou fail à 8,33 ms |
| 5 | Extension aux 37 composants de la matrice | une ligne de rapport par composant et par état |

Les builds Rust tournent sur `fr1` seulement, `nice` et un à la fois ; les mesures d'images par seconde tournent sur un poste avec GPU et écran réels, jamais sur `fr1` ni `fr2`.
