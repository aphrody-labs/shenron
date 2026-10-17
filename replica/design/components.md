# Composants de la page œuvre

Rôles : `replica/design/tokens.json`. Tout texte visible passe par `apps/site/messages/{fr,en,ja}.json`.
Icônes : Material Symbols (déjà dans `packages/ui`). Visuels, logos et textes des sites sources : jamais repris.
« Existant » = composant déjà livré par `@aphrody/shenron-ui` ; « À construire » = lot `replica-build`.

Tous : cible tactile ≥ 44 px (`.cible-44`), anneau de focus `work-ring` 2 px, animations coupées sous
`prefers-reduced-motion`, enfants de grille en `min-width: 0` et colonnes `minmax(0, 1fr)`.

```
Hero d'œuvre                                                  [Existant : PageHero, KenBurns]
  variants  image fixe, carrousel de visuels
  states    default, chargement (squelette), erreur d'image (repli dégradé)
  tokens    bg work-bg, titre display, texte work-text
  a11y      un seul h1, image décorative alt=""
  used on   S01, S04

Navigation par ancres + menu modal                [Existant : SectionNavigation, dialog ; modale à adapter]
  variants  barre sticky desktop, menu plein écran mobile
  states    default, hover, actif (section visible), focus-visible, ouvert/fermé
  tokens    surface work-surface, bordure work-border, accent work-accent
  a11y      <nav aria-label>, modale avec piège de focus (use-focus-trap), Échap ferme, aria-current
  used on   S01, S04, S05

Carte vidéo                                                          [Existant : OfficialMediaCard]
  variants  bande-annonce, opening, ending ; avec date
  states    default, hover, focus-visible, lecture, indisponible (lien officiel en repli)
  tokens    surface work-surface, radius lg, bouton lecture accent
  a11y      <button> nommé « Lire : <titre> », iframe titrée, jamais d'autolecture
  used on   S01, S04

Carrousel                                         [Construit : @aphrody/shenron-ui/public Carousel]
  variants  visuels (1 slide), personnages (N slides)
  states    default, premier/dernier, pause, focus-visible, reduced-motion (pas de défilement auto)
  tokens    flèches surface/accent, points work-border
  a11y      region aria-roledescription="carousel", flèches <button> nommés, annonce « 3 / 12 »,
            tabulation dans les slides visibles seulement
  used on   S04, S10

Fiche personnage                             [Construit : @aphrody/shenron-ui/public CharacterCard]
  variants  compacte (nom + doubleur), détaillée
  states    default, hover, focus-visible, image absente (silhouette Toriyama)
  tokens    surface work-surface, radius md, nom type lg
  a11y      <article>, nom en titre, portrait alt = nom
  used on   S01, S04

Bloc diffusion                           [Construit : @aphrody/shenron-ui/public BroadcastSchedule]
  variants  créneau (jour, heure, chaîne), grille de plateformes groupée par région
  states    default, à venir, terminé, lien externe (icône + rel="noopener")
  tokens    surface, texte muted pour l'heure, accent pour « à venir »
  a11y      liste <ul>, fuseau horaire explicite, lien externe annoncé
  used on   S01, S04

Modale de déclaration (auteur)                         [Existant : dialog, toriyama-speech-bubble]
  variants  image + légende, texte seul
  states    fermée, ouverte, chargement, erreur
  tokens    surface, pop shadow, bordure work-border
  a11y      role=dialog, titre associé, focus rendu au déclencheur
  used on   S06

Sélecteur de langue                                                [Existant : select, shell]
  variants  bascule fr/en/ja, liste de régions
  states    default, ouvert, focus-visible, sélection
  tokens    border-input work-border-input
  a11y      <select> natif ou listbox Base UI, lang="" sur chaque option
  used on   S01, S04, S11

Formulaire de lettre d'information                 [Existant : input, label, checkbox, button]
  variants  email seul, complet (naissance, pays, plateformes)
  states    default, focus, erreur (texte + icône, pas seulement la couleur), chargement, succès, désactivé
  tokens    border-input, danger pour l'erreur, accent pour le bouton
  a11y      <label> liés, consentement marketing séparé et décoché, erreurs liées par aria-describedby
  used on   S09

Bandeau de consentement                                                         [À construire ou tiers]
  variants  essentiel seul, personnalisé
  states    visible, accepté, refusé
  tokens    surface, bordure work-border
  a11y      refuser aussi simple qu'accepter, focus géré, pas de piège
  used on   toutes

Carte actu / jeu lié                                   [Existant : MangaCard, Chip, EmptyState]
  variants  actualité (date + titre), jeu (visuel + plateformes)
  states    default, hover, focus-visible, liste vide (EmptyState), chargement (squelette)
  tokens    surface, radius md
  a11y      lien englobant unique, date en <time>
  used on   S10
```

## Contrôle

```sh
python3 ~/.claude/skills/replica-design/contrast.py replica/design/tokens.json   # 14 paires, 0 échec AA
```
