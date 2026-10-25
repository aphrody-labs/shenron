# Accueil et shell du site : invariants d'identité

Le sprint UI du 2026-10-05 (commits `6354282`, shell unique, et `d27d705`, nouvel accueil) a
supprimé l'ancien accueil (`HomeExperience`, `KintoUnVolant`, `SceneBackdrop`) et l'ancien shell.
Le nouveau shell mélangeait aussi l'admin et le public, et plus rien n'était cliquable. Les règles
ci-dessous évitent que cela se reproduise. Système graphique : [`reference/DESIGN.md`](../reference/DESIGN.md).

## Accueil

- Le hero garde le logo Dragon Ball au style Dragon Ball Super et le nuage Kinto'un animé.
- Les sections éditoriales gardent leur contenu et leur ordre de configuration sur des
  surfaces sobres. Les anciens fonds `section.scene` ne sont plus montés, même si leur
  configuration est encore présente ; les portraits et vignettes éditoriales restent visibles.
- La demande propriétaire du 13 octobre 2026 de restaurer le contenu perdu remplace
  la composition compacte précédente. La recherche est suivie
  des sections activées dans `/admin/home` : personnages, sagas, best-of, classements,
  canonicité et contenus personnalisés. Les actualités puis les mini-jeux terminent la page.
- Les sélections et les compteurs viennent de leurs lecteurs canoniques ; aucun nombre
  de références de secours n’est inventé. Les podiums sans votes suffisants et les sections
  éditoriales, communautaires ou personnalisées sans matière restent masqués.
- Le dernier ajustement du propriétaire retire le menu d'ancrage, « Voyage à travers
  l'univers » et ses compteurs, la reprise sur l'accueil et la présentation Beerus.
  Leurs pages et l'historique personnel restent accessibles dans le shell. L'accueil
  conserve un accès par icône vers la bibliothèque de GIF ; les sept lectures de comptage propres
  à l'ancien bloc univers sont retirées.
- Le héros affiche au plus une frame d'épisode qualifiée par le propriétaire des bannières,
  ou un fond sobre si aucune ne convient. Les anciennes scènes Xenoverse et l'affiche Beerus
  statique ne sont plus montées. La fiche Beerus reste accessible par le catalogue des épisodes.
- La demande du 14 octobre remplace les accordéons de l'accueil par leur contenu ouvert,
  dans des panneaux occupant la hauteur disponible sous le shell. Le défilement natif
  reste continu, sans snap ni animation de téléportation ;
  les boutons précédent/suivant déplacent aussi le focus. Le mode de mouvement réduit désactive le défilement animé des boutons. Les panneaux longs restent entièrement lisibles, même avec zoom,
  et la barre mobile est déduite de la hauteur disponible. Le bouton GIF violet est retiré.
- Les héros des catalogues restent compacts : de 256 à 320 px,
  bandeaux partagés de 180 à 240 px. Il s'agit de hauteurs minimales : les titres, synopsis
  et actions longs agrandissent leur bloc, sans être tronqués.
- « Explorer aussi » retire les destinations déjà proposées par le shell et les sections visibles.

La demande du 15 octobre 2026 retire les vidéos de fond de l’accueil : le héros
conserve le logo, Kinto’un et une frame fixe qualifiée ; les sections utilisent les
surfaces du thème global. Les scènes stockées restent disponibles dans la configuration,
sans monter de lecteur vidéo sur l’accueil. Le thème neutre devient le défaut ; les
palettes d’épisode restent des choix explicites. Le thème enregistré par l’admin pilote
les surfaces publiques, les portails, les couleurs de texte et les réglages de mise en page.

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
