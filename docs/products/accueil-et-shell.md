# Accueil et shell du site : invariants d'identité

Le sprint UI du 2026-10-05 (commits `6354282`, shell unique, et `d27d705`, nouvel accueil) a
supprimé l'ancien accueil (`HomeExperience`, `KintoUnVolant`, `SceneBackdrop`) et l'ancien shell.
Le nouveau shell mélangeait aussi l'admin et le public, et plus rien n'était cliquable. Les règles
ci-dessous évitent que cela se reproduise. Système graphique : [`reference/DESIGN.md`](../reference/DESIGN.md).

## Accueil

- Le hero garde le logo Dragon Ball au style Dragon Ball Super et le nuage Kinto'un animé.
- Chaque section garde sa vidéo de fond, définie dans la configuration de l'accueil
  (`lib/home-config`, `lib/home-scenes`). Les vidéos sont chargées à l'approche de leur section,
  jamais toutes au premier rendu ; `prefers-reduced-motion` est respecté.
- La recherche reste dans un héros compact, suivie de quatre accès sans compteurs
  (manga, databooks, épisodes, sources) et de la présentation officielle de Beerus.
- Demande propriétaire du 13 octobre 2026 : retirer de l’accueil le direct, le panthéon,
  les best-of et Top 3, l’arbitre de canonicité, les actualités, les mini-jeux,
  le voyage dans l’univers et ses compteurs, la reprise, la présence et le classement
  du serveur, ainsi que les sagas légendaires. Leurs rubriques restent accessibles
  dans le shell ; aucun de ces widgets ni ses lectures serveur ne subsiste sur l’accueil.
- Les sections personnalisées de l’ancienne composition ne sont pas montées.
  La configuration conserve le héros et ses scènes, sans réactiver les widgets retirés.

## Shell

- On garde le shell unique (`packages/ui/src/navigation` : barre latérale, barre d'onglets
  mobile, palette de commandes, barre de titre Tauri).
- La navigation publique ne montre aucune entrée d'administration ni outil réservé au staff ;
  l'admin garde son propre shell (`apps/site/src/app/admin/layout.tsx`, `AdminSidebar`).
- Aucun écran de démarrage ni calque ne reste au-dessus de la page après l'hydratation : un test
  clique un lien de navigation et un lien de l'accueil.

## Méthode

- Restaurer depuis l'historique Git plutôt que réinventer. Aucun élément visible de l'accueil
  ou du shell ne se supprime sans l'accord du propriétaire.
- Avant tout travail d'UI, charger les skills `tailwind-v4` (tokens `--dbz-*`, règles du kit),
  `aphrody:frontend-design` et `aphrody:material-3`, et `plugin/skills/toriyama-svg` pour les
  assets vectoriels.
- Vérifier dans un vrai navigateur, d'abord avec les outils du MCP `aphrody` (snapshot, click,
  screenshot), en comparant des captures avant/après en 1440 px et 390 px. Les captures vont
  dans `var/reports/`.
