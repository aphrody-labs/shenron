# Recon : sites officiels Dragon Ball (Super, Daima, Xenoverse 3) et page de chapitre

Date : 2026-10-17. Sources publiques lues une fois, sans exploration en masse ni code source.

## 1. Portée

- Plateforme : web (desktop + mobile).
- Tranche : le modèle « site officiel de promotion » (landing monopage ancrée, médias, diffusion, crédits)
  et la page de chapitre couleur du lecteur de dragonballfr.com.
- Public : dragonballfr.com (produit propre), pour nourrir l'accueil, les pages œuvre et le lecteur.

## 2. Sources

| Source                         | URL                                                              | Apport                                                                |
| ------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Dragon Ball Super (JP/EN)      | https://dragonball-super.com/index.html                          | monopage à ancres, vidéos, personnages, diffusion                     |
| Dragon Ball Daima (EN)         | https://dragonballdaima.com/en/                                  | carrousels, menu modal, commentaire de Toriyama, diffusion par région |
| Xenoverse 3 (FR, Bandai Namco) | https://fr.bandainamcoent.eu/dragon-ball/dragon-ball-xenoverse-3 | fiche jeu, plateformes, wishlist, actus, newsletter                   |
| Chapitre 516, page 1           | https://cdn.dragonballfr.com/assets/manga/DBFC/ch516/001.jpg     | planche couleur du lecteur (propre site)                              |

## 3. Écrans

| ID  | Écran                                        | Accès                                   | Objet                        | Composants clés                                                                                                                                              | États vus                                        |
| --- | -------------------------------------------- | --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| S01 | Super : accueil monopage                     | `/index.html`                           | présenter la série           | bannières, 5 cartes vidéo, intro, galerie de 6 vignettes, 9 fiches personnage, diffusion, staff, partage                                                     | JP, EN                                           |
| S02 | Super : musique                              | `music/index.html`                      | pistes                       | sous-page                                                                                                                                                    | non lu                                           |
| S03 | Super : actualités                           | `updates/index.html`                    | archive                      | liste                                                                                                                                                        | non lu                                           |
| S04 | Daima : accueil                              | `/en/`                                  | présenter la série           | carrousel de 8 visuels, bandeau de diffusion, bouton commentaire, 7 vidéos datées, carrousel de 12 personnages, diffusion par région, staff, popup événement | desktop/mobile (`_sp`)                           |
| S05 | Daima : menu modal                           | bouton MENU                             | navigation                   | liste à puces boule, fermeture                                                                                                                               | desktop/mobile                                   |
| S06 | Daima : commentaire de Toriyama              | bouton                                  | déclaration de l'auteur      | modale image                                                                                                                                                 | desktop/mobile                                   |
| S07 | Daima : news, personnages, musique           | `/news`, `character.html`, `music.html` | pages dédiées                | listes, carrousel                                                                                                                                            | non lu                                           |
| S08 | Xenoverse 3 : fiche jeu                      | URL ci-dessus                           | présenter et pré-enregistrer | en-tête, bloc titre, cartes plateforme, 4 blocs de fonctionnalités, vidéos                                                                                   | pas de prix ni d'édition                         |
| S09 | Xenoverse 3 : wishlist + newsletter          | bas de page                             | conversion                   | boutons boutiques, formulaire (email, naissance, pays, plateformes, consentement)                                                                            | cookies Axeptio                                  |
| S10 | Xenoverse 3 : actus + jeux liés              | bas de page                             | découverte                   | carrousel de 6 articles, 2 carrousels de jeux                                                                                                                | —                                                |
| S11 | Pied de page Bandai                          | toutes pages                            | légal, langues               | 11 langues/régions, réseaux, support                                                                                                                         | —                                                |
| S12 | Lecteur DBFR : page de titre du chapitre 516 | `cdn…/DBFC/ch516/001.jpg`               | première planche             | logo + titre « Chapitre 516 : L'issue du combat », case large, 3 cases                                                                                       | image 1662×2560 couleur, texte français incrusté |

## 4. Parcours

- F01 Visiteur découvre une série : S01/S04 (hero) → vidéo → personnages → diffusion → lien partenaire. Happy path : 3-4 clics.
- F02 Visiteur change de langue : bascule JP/EN (Super, Daima) ; sélecteur à 11 régions (Bandai).
- F03 Visiteur lit la déclaration de l'auteur : S04 → S06 (modale).
- F04 Joueur s'inscrit : S08 → wishlist boutique, ou S09 newsletter. Bord : aucune date précise (« 2027 »).
- F05 Lecteur ouvre un chapitre : liste → S12 → planches suivantes. Bord : image à ratio fixe, texte incrusté non sélectionnable.

## 5. Composants

Carte vidéo (miniature, lecture, titre, date) ; carrousel (flèches, N slides) ; menu modal ; modale média ;
fiche personnage (portrait, nom, doubleur) ; bloc diffusion (jour, heure, chaîne) ; grille de logos par
région ; barre de partage (X, Facebook, LINE) ; retour en haut ; bandeau de consentement ;
formulaire newsletter ; carrousel d'actus ; carte plateforme ; sélecteur de langue.

## 6. Modèle de données déduit

| Entité           | Champs                                                                     | Preuve        | Confiance |
| ---------------- | -------------------------------------------------------------------------- | ------------- | --------- |
| Work             | id, title, kind (anime/jeu/manga), key_visuals[], intro, story             | S01, S04, S08 | haute     |
| Video            | id, work_id, kind (trailer/opening/ending/climax), published_at, embed_url | S01, S04      | haute     |
| Character        | id, work_id, name, voice_actor, portrait, blurb                            | S01, S04      | haute     |
| BroadcastSlot    | work_id, region, platform, day, time, url                                  | S01, S04      | haute     |
| StaffCredit      | work_id, role, name                                                        | S01, S04      | haute     |
| NewsPost         | id, work_id, title, published_at, url                                      | S04, S10      | moyenne   |
| Platform         | id, name, store_url, region                                                | S08, S09      | moyenne   |
| NewsletterSignup | email, birthdate, country, platforms[], consent                            | S09           | moyenne   |
| ChapterPage      | series, chapter, page, image_url, width, height, lang                      | S12           | haute     |

## 7. Hors périmètre (skip)

Droits de diffusion, vidéos YouTube, visuels, musique et textes des éditeurs (Toei, Shueisha, Bandai Namco) ;
accords partenaires de diffusion ; boutiques et wishlist tierces ; SSO « Club! » de Bandai ; prix et éditions
de Xenoverse 3 (non publiés).

## 8. Taille

12 écrans, 5 parcours, 9 entités. Parties difficiles : carrousels accessibles et multilingues, médias
tiers (embeds, repli), diffusion par région tenue à jour. Taille : **M** pour une page œuvre générique
branchée sur l'existant ; le lecteur existe déjà.

## 9. Relevé navigateur (Chrome, 1475×812, 2026-10-17)

Styles calculés (`getComputedStyle`) et captures dans `replica/screens/` (ignoré par Git). Valeurs
consignées comme mesures des sources, pas comme valeurs à reprendre.

| Écran           | Fond                                      | Texte              | Accent titres                                    | Polices                                                                | Repères                                                                                                                                                       |
| --------------- | ----------------------------------------- | ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 Super       | noir `#000`                               | `rgb(232,230,219)` | or `rgb(190,175,98)`                             | M PLUS 1 (texte), Nitalago Ruika et Shuttleblock (titres, Adobe Fonts) | header 66 px, page 11 192 px, carrousels Swiper (vidéos, épisode, personnages), sélecteur de langue vertical à gauche                                         |
| S04 Daima       | blanc `#fff`                              | noir               | jaune à cerne noir (images)                      | Noto Sans JP 16 px                                                     | menu latéral à puces boule, bouton MENU noir 76 px en haut à droite, bascule JP/EN ronde, carrousels Splide, page 11 797 px, bandeau cookies STRIGHT (refusé) |
| S08 Xenoverse 3 | noir sur bandeau, corps `rgb(89,150,220)` | `rgb(30,36,77)`    | or `rgb(237,199,96)`, h1 45 px/700, h2 36 px/900 | Metropolis                                                             | double barre (comptes + langue 62 px, nav blanche 64 px) à liseré quadricolore, hero encadré or à coins biseautés, page 6 629 px                              |
| S12 DBFC        | —                                         | —                  | —                                                | —                                                                      | JPEG 1662×2560 servi seul, fond gris du navigateur                                                                                                            |

Écarts avec la première lecture : Super est sombre (noir et or), Daima clair (blanc, couleurs franches),
Bandai mixte ; les trois sites portent leurs titres en image ou en police sous licence. La règle de
`replica-design` s'applique : rôles seulement, polices ouvertes (Google Sans Flex, JetBrains Mono déjà
chargées par DBFR), aucun visuel ni hex de marque repris.

## 10. Constats utiles à DBFR

- Daima et Super : navigation par ancres + menu modal, motif réutilisable pour les pages œuvre.
- Daima met la déclaration de Toriyama dans une modale dédiée ; DBFR a déjà `toriyama-interviews`.
- Bandai : sélecteur de langues explicite et newsletter à consentement séparé.
- S12 : le titre est incrusté dans l'image ; le texte de planche n'est pas indexable sans la transcription OCR tenue côté DBFR.

## 11. Lecteur Crunchyroll → épisodes Beerus (2026-10-18)

Périmètre : page publique française fournie par le propriétaire, capture desktop de l'épisode 2.
Observation visuelle : scène vidéo noire pleine largeur sous le shell, informations centrées sous
la scène, titre et métadonnées à gauche, épisode précédent à droite. La capture ne prouve pas
la lecture du fournisseur. Aucun flux protégé ni endpoint privé n'a été utilisé.

Application DBFR : conserver le shell et les couleurs du site, réserver le ratio vidéo, centrer
les informations avec une colonne de navigation sur desktop et empiler sur mobile. Les épisodes
Beerus 875 et 876 utilisent leur seul média CDN autorisé. La timeline et les GIF proviennent
du décodage serveur de ce média, avec index complet et aperçus générés à la demande.
