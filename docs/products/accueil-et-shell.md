# Accueil et shell du site : invariants d'identité

Le sprint UI du 2026-10-05 (commits `6354282`, shell unique, et `d27d705`, nouvel accueil) a
supprimé l'ancien accueil (`HomeExperience`, `KintoUnVolant`, `SceneBackdrop`) et l'ancien shell.
Le nouveau shell mélangeait aussi l'admin et le public, et plus rien n'était cliquable. Les règles
ci-dessous évitent que cela se reproduise. Système graphique : [`reference/DESIGN.md`](../reference/DESIGN.md).

## Accueil

- Le hero garde le logo du site et le nuage Kinto'un animé. Depuis le 2026-10-30, le logo est
  « DRAGONBALL.FR » (`packages/ui/assets/brand/dragonballfr-logo.svg`, tracé depuis la référence du
  propriétaire par `scripts/design/trace-dragonballfr-logo.ts`, rendus PNG sans perte à côté) ; il
  remplace aussi le texte de la barre du shell, l'image OpenGraph et le wordmark des cartes du bot.
  Le Kinto'un reste le pictogramme, le favicon et la mascotte.
- Les sections éditoriales gardent leur contenu et leur ordre de configuration sur des
  surfaces sobres. Les anciens fonds `section.scene` ne sont plus montés, même si leur
  configuration est encore présente ; les portraits et vignettes éditoriales restent visibles.
- La demande propriétaire du 13 octobre 2026 de restaurer le contenu perdu remplace
  la composition compacte précédente. Le héros est suivi des sections activées dans `/admin/home` : personnages, sagas, best-of, classements,
  canonicité et contenus personnalisés. Les actualités puis les mini-jeux terminent la page.
- Les sélections et les compteurs viennent de leurs lecteurs canoniques ; aucun nombre
  de références de secours n’est inventé. Les podiums sans votes suffisants et les sections
  éditoriales, communautaires ou personnalisées sans matière restent masqués.
- Le dernier ajustement du propriétaire retire le menu d'ancrage, « Voyage à travers
  l'univers » et ses compteurs, la reprise sur l'accueil et la présentation Beerus.
  Leurs pages et l'historique personnel restent accessibles dans le shell ; la bibliothèque
  de GIF reste à `/wiki/gifs` (le lien de l'accueil a été retiré le 2026-10-30). Les sept lectures de comptage propres
  à l'ancien bloc univers sont retirées.
- Le héros affiche au plus une frame d'épisode qualifiée par le propriétaire des bannières,
  ou un fond sobre si aucune ne convient. Les anciennes scènes Xenoverse et l'affiche Beerus
  statique ne sont plus montées. La fiche Beerus reste accessible par le catalogue des épisodes.
- La demande du 14 octobre remplace les accordéons de l'accueil par leur contenu ouvert,
  dans des panneaux occupant la hauteur disponible sous le shell. Le défilement natif
  reste continu, sans snap ni animation de téléportation ;
  les boutons précédent/suivant déplacent aussi le focus. Le mode de mouvement réduit désactive le défilement animé des boutons. Les panneaux longs restent entièrement lisibles, même avec zoom,
  et la barre mobile est déduite de la hauteur disponible. Le bouton GIF violet est retiré.
  Les contrôles ne gardent que pause, précédent, compteur et suivant.
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

La demande du 18 octobre 2026 remplace la limite d'une frame fixe dans le hero :
restaurer la composition immersive des anciens commits et l'associer à une lecture
éditoriale inspirée de Crunchyroll. Le hero utilise plusieurs vraies frames HD des
épisodes qualifiés, extraites par Bun.Video et publiées sur le CDN ; aucun lecteur
vidéo de fond n'est nécessaire. Le logo et Kinto'un restent, avec une action de
lecture principale et les épisodes disponibles. Les frames alternent par fondu lent,
avec pause explicite, suspension au focus/hors écran/onglet masqué et image fixe en
mouvement réduit. Les sections existantes et leur ordre restent conservés.

## Une seule fois par écran (2026-10-30)

Demande propriétaire : dédoublonner logos, navigation et boutons de l'accueil et du wiki. Le
shell fournit déjà le logo, la navigation principale, la recherche (Ctrl K), le thème, la langue,
l'installation, la connexion, « Signaler une erreur » et l'invitation Discord. Une page ne les
répète pas :

- Accueil : le logo de l'en-tête est masqué (`html:has(#hero) [data-shell-brand]`) sous le
  wordmark du héros ; plus de barre de recherche dans le héros ; le lien éditorial « Commencer le
  voyage » ne s'affiche que sans bloc Beerus (qui porte déjà « Voir l'épisode » et « Tous les
  épisodes ») ; la liste d'épisodes exclut l'épisode mis en avant ; « Le serveur en direct » et le
  classement partagent un seul écran.
- Wiki : ni barre « Explorer » (accueil, menu Parcourir, recherche) dans `app/wiki/layout.tsx`, ni
  tiroir « Explorer le Wiki » sur les fiches, ni lien « Retour » qui répète le fil d'Ariane du
  shell. Les onglets de rubrique (`WikiCategoryNav`) et ceux de la bibliothèque
  (`lib/library.ts`) restent : ils relient des pages sœurs ou des outils absents du menu.
- Les boutons d'en-tête (thème, langue, installation) sont des icônes sans bordure, comme la
  recherche. Les décalages des boutons flottants et de Kinto'un liés à une barre latérale de
  17 rem ne valent que pour la variante `app` du shell ; le site public n'a qu'une barre
  horizontale.
- Garde-fou : `bun run audit:uiux` signale `duplicate-search` (plusieurs landmarks de recherche)
  et `landmark-unique` (plusieurs `<nav>` de même nom). Voir
  [l'audit UI/UX](../development/uiux-audit.md).

## Wiki : deux gabarits communs (2026-10-31)

Toutes les pages du wiki partagent le même ordre, défini une fois dans `apps/site/src/components/wiki/` :

- **Catalogue** (`WikiIndexPage`) : hero (`PageHero`, image seulement si elle parle de la page) → barre staff →
  fil d'Ariane (porté par le shell) → onglets des rubriques sœurs (`category`) → note d'archive → catalogue →
  rail de contribution (`contributeKey`). Les héros spéciaux (`Billboard` des films, séries, chronologie,
  jeux) utilisent `WikiPageShell` directement, dans le même ordre.
- **Fiche** (`WikiDetailPage` + `WikiEntityHeader`) : barre staff → fil d'Ariane → barre de contribution →
  en-tête centré (puces, nom, noms ja/romaji, badges) → grille de fiche (contenu à gauche, infobox collante à
  droite, infobox en tête sur mobile) → rail de contribution. Les sections du corps restent celles de la page.
- **Lecteurs** (manga, databooks, épisodes, films) gardent leur corps mais suivent la même enveloppe : barre
  staff, fil d'Ariane, contenu. Aucun `loading.tsx` sur une page de détail : un 404 doit précéder le premier
  octet (`tests/soft-404.test.ts`).

Navigation, recherche et logo viennent du shell : une page wiki n'ajoute ni menu, ni tiroir, ni lien « retour ».

## Shell

- On garde le shell unique (`packages/ui/src/navigation` : barre latérale en variante `app`,
  barre horizontale en variante `site`, barre d'onglets mobile, palette de commandes, barre de
  titre Tauri).
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
