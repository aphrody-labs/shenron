# Spécifications de composants : boucle « découvrir, regarder, suivre »

Document interne. Mesures de `tokens.json` ; couleurs = rôles mappés sur nos jetons (`--color-dbz-*`). Aucun texte, logo ni image d'un tiers :
tous les libellés passent par les dictionnaires (`apps/site/messages/{fr,en,ja}.json`). Icônes : lucide. Rayons : 12 px (contrôles) et pilule
(action principale), jamais les angles droits observés. Le kit possède déjà `EmptyState`, `Chip`, `TabNav`, `MangaCard`, `Pagination` : on les réutilise.

Manquants dans le kit (laissés à l'agent « replica build », voir `docs/products/streaming-replica-etat.md`) : rail à accrochage, carte avec
progression (série et épisode), bandeau de reprise, bascule liste de suivi partagée, panneau « épisode suivant ».

Légende : écrans S01 découvrir, S02 fiche série, S03 lecture, S04 liste de suivi.

## Rail horizontal (manquant)
- Variantes : cartes 16:9 (épisodes, reprise), cartes 2:3 (séries). Une seule rangée.
- Mesures : carte 275 px, gouttière 30 px (32 chez nous), la carte suivante dépasse à droite pour signaler le défilement ; marge de page 64 px.
- Comportement : `scroll-snap-type: x mandatory` + `scroll-snap-align: start` ; flèche précédent/suivant visible seulement avec pointeur fin et
  s'il reste du contenu ; sur tactile, défilement natif sans flèche ; `prefers-reduced-motion` : saut sans animation.
- États : chargement (cases `surface` de la taille finale, pas de décalage de mise en page), vide (le rail ne s'affiche pas), début/fin (flèche masquée).
- Largeurs : 390 px, 1,5 carte visible ; 1280 px, 4,5 ; 1638 px, 5,5. `min-width: 0` sur les enfants, aucun débordement de page.
- A11y : conteneur `role="region"` avec `aria-label` du titre ; flèches = vrais boutons étiquetés ; cartes dans l'ordre du DOM, tabulation naturelle,
  la carte focalisée est amenée dans la vue ; pas de piège clavier.
- Écrans : S01, S02 (titres similaires), S04 (si grille compacte).

## Carte série (manquante, à côté de `MangaCard`)
- Variante : portrait 2:3, titre sous l'image (2 lignes max, ellipse), coin « dans ma liste » (icône marque-page pleine, rôle accent).
- États : défaut, survol/focus (bordure dorée 1 px du kit, léger relèvement), dans la liste, image en chargement (case `surface`), image absente (monogramme).
- A11y : un seul lien par carte ; le nom accessible contient le titre, plus « dans ma liste » si vrai ; l'image est décorative (`alt=""`).
- Écrans : S01, S02, S04.

## Carte épisode avec barre de progression (manquante)
- Anatomie : vignette 16:9 (275 x 155), bouton lecture rond centré (66 px, scrim), pastille « temps restant » en bas à droite (13 px, `scrim`),
  barre de progression 4 px au bord bas (accent sur piste blanc 20 %), puis libellé de série en 11 px capitales, titre 16 px gras (2 lignes max),
  ligne de version (13 px, `textMuted`) et menu d'options.
- États : non vu (pas de barre), en cours (barre + temps restant), terminé (barre pleine, pastille masquée, coche), survol/focus, indisponible (voir `VideoUnavailableCard`).
- Données : `playback-progress` (position, durée, achevé) ; le pourcentage se dérive, jamais saisi.
- A11y : lien unique « lancer/reprendre » ; la barre est `role="progressbar"` avec `aria-valuenow` ou un texte masqué « 40 % regardé » ; contraste de la pastille vérifié (8,5:1 pire cas) ; menu d'options = bouton `aria-haspopup="menu"`, cible 44 px.
- Écrans : S02, S03 (panneau latéral), S04, S01 (reprise).

## Bandeau de reprise / héros (manquant)
- Anatomie : image plein bord, colonne de texte à gauche (478 px max), titre-logo (344 x 155 max), méta, synopsis tronqué (4 lignes), bouton principal
  « reprendre En » ou « lancer » + bouton marque-page carré, pagination par pastilles avec progression sur l'active, flèches latérales.
- Hauteur : environ 773 px à 1638 px ; sur 390 px, image en haut et texte dessous, pas de flèches.
- Défilement automatique : pause au survol, au focus et sous `prefers-reduced-motion` (aucune rotation automatique) ; contrôle de pause visible.
- États : chargement (case `surface`), diapositive sans reprise (verbe « lancer »), liste vide (le bandeau n'est pas rendu).
- A11y : `role="region"` `aria-roledescription="carrousel"`, chaque diapositive « n sur 6 » ; pastilles = boutons étiquetés ; texte lisible sur dégradé noir (>= 4,5:1).
- Écrans : S01. Le rail de reprise existant (`ContinueWatchingRail`) reste la source de données.

## Fiche série : en-tête et onglets de saison (partiel)
- En-tête : même grammaire que le bandeau (logo, classification, version, genres en liens, note), boutons principal / marque-page / partage / options.
- Synopsis replié sur 4 lignes avec « plus de détails » (bouton `aria-expanded`) ; colonne de droite pour audio, sous-titres, avertissements.
- Saisons : libellé « Saison n » + tri (plus anciens / plus récents) + options ; plusieurs saisons = `TabNav` du kit. Pas de note à étoiles dans notre tranche.
- États : série sans épisode (EmptyState), un seul tome/saison (pas d'onglets), chargement (cases).
- A11y : titre `h1`, genres en liste de liens, tri = bouton à menu radio.
- Écrans : S02.

## Sélecteur d'épisodes (grille, existant en partie : `EpisodesCatalogue`)
- Grille de cartes épisode : 5 colonnes à 1638 px, 3 à 1280 px, 2 à 768, 1,5 en rail horizontal à 390 ; `grid-template-columns: repeat(auto-fill, minmax(0, 275px))` avec `min-width: 0`.
- Tri croissant/décroissant, saut direct à l'épisode en cours (focus sur la carte « reprendre »).
- A11y : liste (`ul`) d'épisodes ; l'épisode courant porte `aria-current="true"`.
- Écrans : S02, S03 (« voir plus d'épisodes »).

## Page de lecture et panneau « épisode suivant » (existant : `WatchLayout`, panneau manquant)
- Mise en page : lecteur 16:9 centré, 1160 px à 1638 px (environ 71 %), pleine largeur sous 768 px ; sous le lecteur, deux colonnes : infos (683 px) et panneau (331 px), écart 33 px ; une colonne sous 1024 px, panneau sous les infos.
- Infos : libellé de série (lien, accent), titre, classification + version, date de mise en ligne, réactions, partage, résumé replié.
- Panneau : « épisode précédent » en carte compacte (vignette 135 px de large), bouton « voir plus d'épisodes » (secondaire), et, une fois la lecture proche de la fin, « épisode suivant » avec décompte annulable (non observé : à concevoir).
- Barre de contrôles : piste 4 px, -10 s, lecture, +10 s, volume, durée, langues et sous-titres, vitesse, paramètres, plein écran ; icônes 27 px, zones tactiles 44 px.
- États : arrêt, lecture, pause, tampon (indicateur), erreur de lecture (carte `VideoUnavailableCard`, repli de langue), plein écran, reprise (démarre à la position enregistrée, annonce « reprise à m:ss »).
- A11y : toutes les commandes sont des `button`/`slider` natifs étiquetés (« reculer de 10 secondes »...) ; raccourcis espace, flèches, m, f, c ; focus visible 2 px accent ; sous-titres désactivables ; aucune lecture automatique avec son.
- Écrans : S03. Contrainte : média autorisé réel uniquement, aucun contournement de DRM.

## Liste de suivi (existant : `WatchlistClient`)
- Grille de cartes (1 / 2 / 3 colonnes chez nous), filtres en pastilles (tout, reprendre, à voir, terminé), tri (récent, titre).
- Bascule marque-page identique sur le bandeau, la fiche et la lecture : un seul composant, états ajouté / non ajouté / en cours, mise à jour optimiste avec retour arrière en cas d'échec.
- États : chargement (squelettes `animate-pulse`, déjà en place), vide (`EmptyState` senzu + liens de parcours), erreur (message + « réessayer »).
- A11y : le bouton porte `aria-pressed` et un nom explicite « ajouter à / retirer de la liste de suivi » ; annonce `aria-live="polite"` après bascule ; retrait = cible 44 px.
- Écrans : S01, S02, S03, S04.

## États transverses
- Chargement : cases `surface` à la taille finale, `animate-pulse` (désactivé sous `prefers-reduced-motion`), `role="status"`.
- Vide : `EmptyState` du kit, une phrase et une action ; jamais de coquille vide indexable (règle du dépôt).
- Erreur : message localisé, action « réessayer », jamais un 503 nu.
- Mobile (390 px) : non capturé chez l'original ; nos règles : aucun débordement horizontal de la page, cibles 44 px, rails à défilement tactile.

## Contraste
Calcul : `bun replica/crunchyroll/design/contrast.ts`. Résultat du 2026-11-02 : 20 paires sur 21 conformes. Échec existant, à corriger par le propriétaire du kit
(`.btn-danger` dans `packages/ui/src/styles.css`, blanc sur `--color-dbz-red` #f10c3b = 4,32:1, seuil 4,5:1 pour du texte 14 px gras en capitales) : assombrir le rouge
du bouton ou passer le texte en noir. Non corrigé ici (chemin hors périmètre).
