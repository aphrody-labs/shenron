# Plan : de Base UI (React) vers GPUI, de bout en bout

Relevé du 2026-11-19. Il découle de l'ADR 0008 (une seule pile UI, `gpui-kit`). Chaque chiffre vient d'une commande ou d'une API lue ce jour ; les correspondances de modules sont établies sur les noms de modules du dépôt amont, pas sur leurs API (la phase 1 les vérifie).

## État mesuré

| Élément | Valeur | Source |
| --- | --- | --- |
| Base UI | 1.9.0 | `registry.npmjs.org/@base-ui/react/latest` |
| Fichiers qui importent `@base-ui/react` | 52 | `rg -l` sur `apps` et `packages` |
| Sous-chemins Base UI utilisés | 28 | `rg -o` des imports |
| Emplacement de l'usage | `packages/ui/src/components/*` (une enveloppe par primitive), `packages/ui/src/koharu/internal/components/*`, `packages/ui/src/public/CommandPalette.tsx`, `packages/ui/src/navigation/ShellTabBar.tsx` | `rg -l` |
| `gpui-kit` | 0.10.0, publié le 2026-11-16, épinglé dans `Cargo.toml` | crates.io, `Cargo.toml:168` |
| Dépôt amont | `longbridge/gpui-kit`, tête `390a485aba` du 2026-11-19 | `gh api` |
| `gpui` (Zed) | 0.2.2, publié le 2026-10-30 | crates.io |
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
| popover | `gpui-base::popover` | présent |
| progress | `gpui-base::progress` | présent |
| radio, radio-group | `gpui-base::radio`, `radio_group` | présent |
| scroll-area | `gpui-base::scrollbar`, `scrollable_mask`, `scroll_bounce` | présent, à confirmer |
| select | `gpui-base::select` | présent |
| separator | `gpui-component::separator` | présent |
| slider | `gpui-base::slider` | présent |
| switch | `gpui-base::switch` | présent |
| tabs | `gpui-base::tabs` | présent |
| toast | `gpui-base::toast` | présent |
| toggle, toggle-group | `gpui-base::toggle`, `toggle_group` | présent |
| tooltip | `gpui-base::tooltip` | présent |
| menu | `gpui-component::menu` (aucun module `menu` dans `gpui-base`) | présent côté composant |
| field | `gpui-component::form`, `label` | partiel : validation native à écrire |
| context-menu | aucun module ; à bâtir sur `popup`, `positioner` et `menu` | écart |
| menubar | aucun module ; à bâtir sur `menu` | écart |
| meter | aucun module ; variante de `progress` avec seuils | écart |

Primitives Base UI non utilisées aujourd'hui mais qui ont un module : `combobox` (autocomplete, combobox), `otp_input` (otp-field), `hover_card` (preview-card), `toolbar`. Sans module : checkbox-group, fieldset, navigation-menu.

Les écarts (context-menu, menubar, meter, field complet) se proposent d'abord en amont à `longbridge/gpui-kit` ; un module local dans `shenron-theme` n'est que le repli, car chaque module local est du code à maintenir contre les évolutions d'amont.

## Décision à trancher avant la phase 3

L'ADR 0008 (2026-11-18) remplace Leptos et Dioxus par `gpui-kit` partout, web compris (`wasm32`, WebGPU avec repli WebGL2). L'ADR 0009 (2026-11-19) prévoit encore « Site en Rust (Leptos) » à l'étape 7 et cite l'ADR 0001, que l'ADR 0008 déclare remplacé. Les deux textes se contredisent.

Un canevas GPUI n'émet ni HTML indexable ni arbre d'accessibilité DOM. Pour les pages publiques (wiki, actualités, classements), l'indexation et la lecture d'écran exigent du HTML rendu côté serveur. Proposition à valider : GPUI pour les surfaces d'application (admin, Studio, éditeur, chat, jeux) et HTML serveur pour les pages publiques, avec Leptos sur Axum (ADR 0009) ou un moteur de gabarits. Cela demande de corriger la ligne 7 de l'ADR 0009 ou de rouvrir l'ADR 0008. Sans cette décision, la phase 3 reste bloquée.

## Phases

| # | Phase | Livrable | Preuve de sortie |
| --- | --- | --- | --- |
| 0 | Inventaire figé | liste des 52 fichiers et des props utilisées par enveloppe (`packages/ui/src/components/*`) | tableau committé, vérifié par un test qui échoue si un import Base UI apparaît hors de la liste |
| 1 | Sondage d'API | un exemple minimal par module du tableau (`gpui-kit` 0.10.0, `test-support`) : ouverture, focus, clavier, annonce | le statut « à confirmer » du tableau devient présent ou écart, avec le test qui le prouve |
| 2 | Jetons et thème | `shenron-theme` lit les jetons CSS existants (`packages/ui/src/tokens-m3`, `home-theme.generated.css`) et produit le thème GPUI ; une seule source des jetons | écart de couleur nul entre les deux rendus d'une même page sur un échantillon de jetons, clair et sombre |
| 3 | Accessibilité sur le web | arbre d'accessibilité exposé à la plateforme (miroir ARIA pour le canevas web ; sur desktop, `gpui-base` contient `macos_accessibility` et rien d'équivalent n'a été relevé pour Windows et Linux) ; navigation clavier complète ; `prefers-reduced-motion` respecté (`gpui-base::reduce_motion`) | lecteur d'écran réel sur une page de test, focus visible, aucun piège de focus (`focus_trap`) |
| 4 | Écarts | context-menu, menubar, meter, field complet : proposition amont, sinon module local | tests `test-support`, capture rendue |
| 5 | Surfaces par ordre de risque croissant | admin (`shenron-admin-ui`, déjà amorcé), puis Studio et éditeur (`koharu-app`), puis chat, puis jeux | chaque surface : capture inspectée, console sans erreur, parité fonctionnelle listée |
| 6 | Pages publiques | selon la décision ci-dessus | indexation vérifiée (HTML reçu sans JavaScript), Core Web Vitals mesurés |
| 7 | Retrait de Base UI | suppression de `@base-ui/react` et des enveloppes mortes | `rg '@base-ui/react'` ne renvoie rien, `bun install --frozen-lockfile` passe |

Règles de passage : une surface ne bascule que si sa parité est listée et prouvée dans un navigateur réel ; l'ancienne enveloppe reste jusqu'à cette preuve (étrangleur, ADR 0004). Les builds Rust tournent sur `fr1`, `nice` et un seul à la fois. Le code suit le style Zed (pas de `mod.rs`, pas de `unwrap` hors tests, pas de `let _ =` sur un appel faillible).

## Risques mesurés ou nommés

- Accessibilité : le canevas web n'a pas d'arbre DOM. C'est le risque le plus sérieux pour l'utilisateur principal du projet, qui est malvoyant ; la phase 3 est donc un critère d'arrêt, pas une option.
- Amont : `gpui-kit` en 0.10.0 évolue vite (tête du dépôt du jour même) ; l'épinglage exact (`=0.10.0`) et un test de fumée par module limitent les régressions.
- Charge de travail : l'estimation de la phase 5 reste à faire après la phase 1, faute de mesure de l'API réelle.
