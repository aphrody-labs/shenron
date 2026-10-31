# Modèle de fiche personnage

Ce document conserve le modèle éditorial validé pour les fiches personnages. La page publique
est une fiche unique dont les informations varient selon le personnage, sa continuité (version)
et, si elle existe, la saga sélectionnée. L'édition correspondante se fait dans
`/admin/wiki/characters`, en trois étapes guidées.

## Parcours public

1. **Personnage et continuité** : la fiche s'ouvre sur la continuité principale. Un sélecteur
   permet de changer de continuité (par exemple Goku DB, DBZ, DBS, GT ou une continuité dérivée).
2. **Saga** : le second sélecteur ne s'affiche que si plusieurs sagas sont disponibles dans cette
   continuité. Une continuité à saga unique affiche directement son nom. Chaque saga possède son
   propre contenu éditorial et sa propre galerie d'apparences.
3. **Fiche** : portrait de base avant transformation, informations officielles compactes à gauche,
   puis rubriques éditoriales et visuelles. Les vignettes d'apparence sont carrées, arrondies,
   verticales au bas droit du portrait et présentes uniquement quand une apparence a une image.
   Elles affichent l'image choisie et le nom de cette apparence dans le portrait.

Les rubriques regroupent histoire et combats dans l'ordre chronologique, relations (famille, amis,
ennemis), pouvoirs et formes (transformations distinguées des techniques), et informations
complémentaires. Les combats s'insèrent dans le fil de l'histoire avec une illustration discrète à
gauche, fondue dans le panneau. L'espace des informations complémentaires rassemble anecdotes
(dont l'origine du nom), voix et crédits de production. Les cartes de personnes et de races renvoient
vers leurs fiches wiki respectives.

## Contenu éditable par saga

Chaque saga d'une continuité porte ses propres champs de fiche, ses relations, ses transformations
et techniques, ses combats ordonnés et ses apparences. Une apparence enregistre sa forme,
l'illustration recadrable, le texte alternatif et l'ordre d'affichage. L'image principale reste la
forme de base ; les transformations sont des variantes choisies depuis le cadre de l'image.

Les informations complémentaires par saga comprennent :

- l'article Markdown (anecdotes, origine du nom et autres informations éditoriales) avec images et
  liens de sources ;
- le casting vocal associé à des fiches de comédiens, avec rôle/notes et ordre ;
- les crédits d'animation par épisode : numéro, scène, superviseur, profil wiki si disponible,
  animateurs clés, illustration recadrable, texte alternatif, épisode et source.

Les crédits décrivent des scènes/épisodes référencés, sans attribuer un animateur à un plan précis
quand la source ne le permet pas. Les liens vers fiches de personnes ne sont affichés que lorsqu'une
fiche cible existe. Les crédits de démonstration de la prévisualisation locale ne sont pas des
données de production.

## Édition admin

1. **Choisir le personnage et la continuité** : les continuités liées au personnage sont listées ;
   l'admin peut aussi gérer ces liens.
2. **Choisir ou créer la saga** : la liste est limitée à la continuité choisie ; les sagas se gèrent
   dans le catalogue et s'associent à une continuité depuis cette étape.
3. **Modifier la fiche** : des cartes séparées ouvrent l'histoire, les relations, les formes et
   techniques, l'ordre des techniques utilisées, les combats, les apparences, les anecdotes,
   le casting vocal et les crédits d'animation. Chaque écran garde le contexte personnage ›
   continuité › saga pour éviter les modifications sur la mauvaise version.

Les formulaires réutilisent le CRUD wiki et ses champs typés : sélecteurs pour les relations,
éditeur Markdown pour l'article, recadrage adapté aux images, champs longs pour les crédits et
contrôle de publication. Les contenus généraux du personnage restent éditables depuis sa fiche
générale. L'ajout d'une nouvelle table éditoriale exige une migration Drizzle versionnée et son
enregistrement dans l'audit des migrations.

## Implémentation de référence

- Page publique : `apps/site/src/app/wiki/characters/[slug]/page.tsx`
- Parcours d'édition : `apps/site/src/components/admin/CharacterPageEditor.tsx`
- Tables wiki et formulaire admin : `apps/site/src/lib/wiki-tables.ts`,
  `apps/site/src/lib/wiki-admin.ts`, `apps/site/src/app/admin/database/[table]/page.tsx`
- Schéma et migrations : `packages/db/src/bot-schema.ts`,
  `apps/site/src/db/migrations/`
