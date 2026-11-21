# Plan : de Base UI (React) vers GPUI, de bout en bout

Relevé du 2026-11-19. Il découle de l'ADR 0008 (une seule pile UI, `gpui-kit`). Chaque chiffre vient d'une commande ou d'une API lue ce jour ; les correspondances de modules sont établies sur les noms de modules du dépôt amont, pas sur leurs API (la phase 1 les vérifie).

## État mesuré

| Élément | Valeur | Source |
| --- | --- | --- |
| Base UI | 1.9.0 | `registry.npmjs.org/@base-ui/react/latest` |
| Fichiers qui importent `@base-ui/react` | 52 | `rg -l` sur `apps` et `packages` |
| Sous-chemins Base UI utilisés | 28 | `rg -o` des imports |
| Emplacement de l'usage | `packages/ui/src/components/*` (une enveloppe par primitive), `packages/ui/src/koharu/internal/components/*`, `packages/ui/src/public/CommandPalette.tsx`, `packages/ui/src/navigation/ShellTabBar.tsx` | `rg -l` |
| `gpui-kit` | 0.10.0, publié le 2026-11-16, déclaré dans `../wiki/Cargo.toml` (`version = "0.10.0"`) | crates.io, `../wiki/Cargo.toml:169` |
| Dépôt amont | `longbridge/gpui-kit`, tête `390a485aba` du 2026-11-19 | `gh api` |
| GPUI utilisé par `gpui-kit` | `gpui-pre` =0.3.12, miroir crates.io du GPUI de Zed ; le crate `gpui` 0.2.2 n'est pas celui qui compile | `Cargo.toml` amont, ligne 69 |
| Crates GPUI du dépôt | `shenron-theme` (`lib.rs` : 62 lignes), `shenron-admin-ui` (`view.rs` : 126 lignes), `shenron-studio` (4 fichiers, 438 lignes), `koharu-app`, `shenron-desktop` | `wc -l` |

`gpui-kit` regroupe `gpui-base` (comportement et accessibilité : « Behavior, interaction, and infrastructure foundations ») et `gpui-component` (« 60+ desktop UI components »). `gpui-base` est l'équivalent direct de Base UI : composants sans style qui portent le comportement. Les crates GPUI du dépôt sont petits (quelques centaines de lignes chacun) ; presque tout reste à écrire.

## Correspondance des 28 primitives

| Base UI | Module GPUI | Statut |
| --- | --- | --- |
| accordion | `gpui-base::accordion` | présent |
| alert-dialog | `gpui-base::alert_dialog` | présent |
| avatar | `gpui-base::avatar` | présent |
| button | `gpui-base::button` | présent |
| checkbox | `gpui-base::checkbox` | présent |
| collapsible | `gpui-base::collapsible` | présent |
| dialog | `gpui-base::dialog` | présent |
| drawer | `gpui-base::sheet` | présent, à confirmer (bords, geste) |
| number-field | `gpui-base::number_input` | présent |
| popover | `gpui-base::popover` | partiel : pas de mode modal, pas de bascule de côté |
| progress | `gpui-base::progress` | présent |
| radio, radio-group | `gpui-base::radio`, `radio_group` | présent |
| scroll-area | `gpui-component::scroll::Scrollable`, `gpui-base::scrollbar` | partiel : `scrollable_mask` n'est pas un masque de fondu |
| select | `gpui-base::select` | présent |
| separator | `gpui-component::separator` | présent |
| slider | `gpui-base::slider` | présent |
| switch | `gpui-base::switch` | présent |
| tabs | `gpui-base::tabs` | présent |
| toast | `gpui-base::toast` | présent |
| toggle, toggle-group | `gpui-base::toggle` ; `gpui-component::button::toggle::ToggleGroup` (celui de `gpui-base` est un conteneur sans état) | partiel : sélection multiple par défaut, inverse de Base UI |
| tooltip | `gpui-base::tooltip` | partiel : survol seul, pas de focus clavier, pas d'Échap |
| menu | `gpui-component::menu` (aucun module `menu` dans `gpui-base`) | présent côté composant |
| field | `gpui-component::form`, `label` | partiel : validation native à écrire |
| context-menu | `gpui-component::menu::context_menu` (`ContextMenuExt`, clic droit et appui long) | partiel |
| menubar | `gpui-component::menu::app_menu_bar` (`AppMenuBar`, piloté par `GlobalState::set_app_menus`) | partiel |
| meter | aucun module ; variante de `progress` avec seuils | écart |

Primitives Base UI non utilisées aujourd'hui mais qui ont un module : `combobox` (autocomplete, combobox), `otp_input` (otp-field), `hover_card` (preview-card), `toolbar`. Sans module (vérifié dans les deux crates) : autocomplete, checkbox-group, fieldset, navigation-menu.

Les 5 écarts sans module (autocomplete, checkbox-group, fieldset, meter, navigation-menu) et les défauts des lignes partielles se proposent d'abord en amont à `longbridge/gpui-kit` ; un module local dans `shenron-theme` n'est que le repli, car chaque module local est du code à maintenir contre les évolutions d'amont.

## Décision à trancher avant la phase 3

L'ADR 0008 (2026-11-18) remplace Leptos et Dioxus par `gpui-kit` partout, web compris (`wasm32`, WebGPU avec repli WebGL2). L'ADR 0009 (2026-11-19) prévoit encore « Site en Rust (Leptos) » à l'étape 7 et cite l'ADR 0001, que l'ADR 0008 déclare remplacé. Les deux textes se contredisent.

Matrice complète : [`base-ui-gpui-parity-matrix.md`](base-ui-gpui-parity-matrix.md), 37 composants : 4 complets, 28 partiels, 5 sans module. Elle corrige la première version de ce plan sur les points ci-dessus ; `reduce_motion` ne lit pas `prefers-reduced-motion` sur wasm et doit être corrigé en phase 3.

Un canevas GPUI n'émet ni HTML indexable ni arbre d'accessibilité DOM. Pour les pages publiques (wiki, actualités, classements), l'indexation et la lecture d'écran exigent du HTML rendu côté serveur. Proposition à valider : GPUI pour les surfaces d'application (admin, Studio, éditeur, chat, jeux) et HTML serveur pour les pages publiques, avec Leptos sur Axum (ADR 0009) ou un moteur de gabarits. Cela demande de corriger la ligne 7 de l'ADR 0009 ou de rouvrir l'ADR 0008. Sans cette décision, la phase 3 reste bloquée.

## Phases

| # | Phase | Livrable | Preuve de sortie |
| --- | --- | --- | --- |
| 0 | Inventaire figé | liste des 52 fichiers et des props utilisées par enveloppe (`packages/ui/src/components/*`) | tableau committé, vérifié par un test qui échoue si un import Base UI apparaît hors de la liste |
| 1 | Sondage d'API | un exemple minimal par module du tableau (`gpui-kit` 0.10.0, `test-support`) : ouverture, focus, clavier, annonce | le statut « à confirmer » du tableau devient présent ou écart, avec le test qui le prouve |
| 2 | Jetons et thème | `shenron-theme` lit les jetons CSS existants (`packages/ui/src/tokens-m3`, `home-theme.generated.css`) et produit le thème GPUI ; une seule source des jetons | écart de couleur nul entre les deux rendus d'une même page sur un échantillon de jetons, clair et sombre |
| 3 | Accessibilité sur le web | arbre d'accessibilité exposé à la plateforme (miroir ARIA pour le canevas web ; sur desktop, `gpui-pre-windows` et `gpui-pre-linux` dépendent d'`accesskit` ; `macos_accessibility` n'est qu'un relais de hit-test ; côté web, `PlatformWindow::a11y_tree_update` existe par défaut sans effet, donc un miroir ARIA dans `gpui-web` servirait tous les rôles) ; navigation clavier complète ; `prefers-reduced-motion` respecté (`gpui-base::reduce_motion`) | lecteur d'écran réel sur une page de test, focus visible, aucun piège de focus (`focus_trap`) |
| 4 | Écarts | autocomplete, checkbox-group, fieldset, meter, navigation-menu, plus les défauts de la matrice (`a11y_disabled` non appliqué à l'accordéon, au dialogue et aux menus, noms d'avatar absents hors tests, tooltips sans focus) : proposition amont, sinon module local | tests `test-support`, capture rendue |
| 5 | Surfaces par ordre de risque croissant | admin (`shenron-admin-ui`, déjà amorcé), puis Studio et éditeur (`koharu-app`), puis chat, puis jeux | chaque surface : capture inspectée, console sans erreur, parité fonctionnelle listée |
| 6 | Pages publiques | selon la décision ci-dessus | indexation vérifiée (HTML reçu sans JavaScript), Core Web Vitals mesurés |
| 7 | Retrait de Base UI | suppression de `@base-ui/react` et des enveloppes mortes | `rg '@base-ui/react'` ne renvoie rien, `bun install --frozen-lockfile` passe |

Règles de passage : une surface ne bascule que si sa parité est listée et prouvée dans un navigateur réel ; l'ancienne enveloppe reste jusqu'à cette preuve (étrangleur, ADR 0004). Les builds Rust tournent sur `fr1`, `nice` et un seul à la fois. Le code suit le style Zed (pas de `mod.rs`, pas de `unwrap` hors tests, pas de `let _ =` sur un appel faillible).

## Risques mesurés ou nommés

- Accessibilité : le canevas web n'a pas d'arbre DOM. C'est le risque le plus sérieux pour l'utilisateur principal du projet, qui est malvoyant ; la phase 3 est donc un critère d'arrêt, pas une option.
- Amont : `gpui-kit` en 0.10.0 évolue vite (tête du dépôt du jour même) ; l'épinglage exact (`=0.10.0`) et un test de fumée par module limitent les régressions.
- Charge de travail : l'estimation de la phase 5 reste à faire après la phase 1, faute de mesure de l'API réelle.

## Automatisation et état de la communauté (relevé du 2026-11-19)

**Registre de migration** (retiré : `migration/ui.json` et les recettes `just ui-ledger` et `just ui-ledger-check` n'existent plus depuis le 2026-11-20, commits `4b708709` et `4af5cdfd`). Relevé du 2026-11-19 : le registre listait les 31 enveloppes de `packages/ui/src/components` : primitive Base UI lue dans l'import (19 sur 31), cible GPUI et statut de la matrice (4 complètes, 15 partielles, 12 sans ligne de matrice : enveloppes shadcn sans équivalent Base UI ou propres à Shenron), nombre de fichiers qui l'importent (ordre de migration : `button` 22, `input` 8, `popover` 8, `select` 8, `tooltip` 7), couverture par la galerie de parité (6 enveloppes) et état de parité (`unmeasured` partout : aucun rapport de différence n'existe encore dans `scripts/parity/out`).

**Mesure de la galerie native.** La crate `shenron-gallery` (commit `971178d5`) rend 25 états sans fenêtre, deux exécutions donnent des fichiers identiques (sha256), mais les images web de référence n'étaient plus présentes quand l'agent a fini : aucun écart de pixels n'est mesuré. Sur la machine de travail (RTX 4070, écran 144 Hz) un bouton seul tient un temps de trame de 13,4 ms au 50e centile et 15,4 ms au 99e, soit une trame sur deux : la porte de 120 images par seconde échoue, cause probable non confirmée : le rythme de présentation de Windows dans GPUI.

**Suivi amont, `longbridge/gpui-kit` (tête du 2026-11-19, 21 020 étoiles, 113 tickets ouverts, 30 discussions).** L'accessibilité est un chantier actif : 43 tickets la citent, la plupart fermés (boutons, popover, tableau de données, saisie, étiquettes, onglets : #3678, #3705, #3647, #3183, #3870, #3698, #4001). Côté web, 8 tickets touchent wasm ; #3414 reste ouvert (rendre le fil d'exécution du navigateur optionnel). Le miroir ARIA pour le canevas web reste à écrire côté Shenron ou en amont.

**Méthode de migration retenue** (billet de Jarred Sumner, « Rewriting Bun in Rust », 2026-07-08, lu en entier) : portage mécanique plutôt que réécriture, suite de tests indépendante du langage comme juge, un implémenteur et deux relecteurs adverses par unité, file de travail alimentée par les erreurs du compilateur, aucune dérogation « pour compiler » (bouchons refusés). Appliquée ici : le registre est la file de travail, la galerie et `scripts/parity` sont le juge, les relecteurs adverses vérifient chaque diff.
