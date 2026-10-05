# Doctrine de canonicité Shenron

<!-- Généré par scripts/plugin/build-references.ts — ne pas éditer. Sources : apps/site/src/lib/canon-engine.ts. -->

> **Instantané hors ligne** — sources du dépôt Shenron (`apps/site/src/lib/canon-engine.ts`),
> révision `4241d5e` du 2026-10-05. Citer cette révision et cette date avec toute
> réponse tirée d'ici ; une source vivante plus récente peut avoir changé.

Doctrine **livrée avec le dépôt** (défauts de `canon-engine.ts`). La doctrine de
production se retouche dans `/admin/canon` du site et peut s'en écarter ; le corpus
de références (`canon_references`), les planches et les fiches vivent en base et
ne sont pas embarqués. Le verdict d'une question se calcule hors ligne par
`bun scripts/canon.js "question"` (même moteur que `GET /api/canon?q=`).

Ordre de décision du moteur : 1. sujet tranché (`entry:<id>`, mots-clés et titre) ;
2. famille de formulations (`heuristic:<id>`, rang présumé) ; 3. `fallback` (non tranché).
Le `score` exprime l'autorité du rang ou du sujet, **pas une probabilité** : chaque
sujet porte son propre score, le score du rang ne sert que de défaut.

## Rangs

| Rang | Libellé | Score par défaut |
| --- | --- | --- |
| `CANON_ABSOLU` | Canon Absolu (Tier 1 — Manga & Toriyama pur) | 100 |
| `CANON_SUPERVISE` | Canon Supervisé (Tier 2 — DBS, Films récents & Daima) | 88 |
| `EXTENSION_OFFICIELLE` | Extension Officielle (Tier 3 — Daizenshuu & SEG) | 70 |
| `NON_CANON_DERIVE` | Non-Canon Dérivé (Tier 4 — Fillers, Films Toei & GT) | 20 |
| `APOCRYPHE_FANON` | Apocryphe / Fanon (Tier 5 — Rumeurs & Inventions) | 0 |

### CANON_ABSOLU

Écrit, dessiné ou explicitement révélé par Akira Toriyama lui-même. Le manga original des 42 tomes prime sur tout le reste : quand une autre source le contredit, c'est l'autre source qui a tort.

Inclut (doctrine générale, à confronter au sujet tranché) :

- Manga Dragon Ball, tomes 1 à 42 (chapitres 1 à 519)
- Jaco the Galactic Patrolman et Dragon Ball Minus
- Chapitres et histoires courtes signés Toriyama (Neko Majin, bonus Jump)
- Réponses de Toriyama en interview ou Q&A signée (SEG, V-Jump, Saikyō Jump)

### CANON_SUPERVISE

Œuvres de la continuité officielle dont Toriyama a fourni la trame, le scénario ou les designs, mais qu'il n'a pas dessinées lui-même. Elles font autorité tant qu'elles ne contredisent pas le manga original.

Inclut (doctrine générale, à confronter au sujet tranché) :

- Manga Dragon Ball Super (Toyotaro, storyboards annotés par Toriyama)
- Films Battle of Gods, La Résurrection de F, Broly, Super Hero
- Dragon Ball Daima (concept, histoire et designs de Toriyama)
- OAV et histoires originales écrites par Toriyama (Jump Super Anime Tour 2008)

### EXTENSION_OFFICIELLE

Documentation éditée par Shueisha et supervisée par Bird Studio. Elle décrit l'œuvre et complète ses marges (chiffres, chronologies, fiches), mais elle ne crée pas d'histoire et cède devant le manga.

Inclut (doctrine générale, à confronter au sujet tranché) :

- Daizenshuu 1 à 7 et guides Chōzenshū
- Super Exciting Guide (2009)
- Guides officiels de série, artbooks et Landmark/Forever
- Fiches de personnages et chronologies éditoriales

### NON_CANON_DERIVE

Produit officiellement sous licence, mais écrit hors de la plume de Toriyama : l'animation Toei et ses films se contredisent avec le manga et se déroulent, selon l'auteur lui-même, dans une dimension parallèle.

Inclut (doctrine générale, à confronter au sujet tranché) :

- Épisodes hors-trame (fillers) de Dragon Ball, DBZ, Kai et DBS
- Films Toei de 1986 à 1995 et téléfilms spéciaux
- Dragon Ball GT (« grand side-story » selon Toriyama)
- Jeux vidéo, Super Dragon Ball Heroes, Xenoverse et leurs personnages

### APOCRYPHE_FANON

Aucune existence officielle : invention de fans, fausse interview, image détournée, doujinshi. À citer uniquement pour dire d'où vient la rumeur et pourquoi elle est fausse.

Inclut (doctrine générale, à confronter au sujet tranché) :

- Dragon Ball AF, Super Saiyan 5, Xicor
- Fausses interviews et citations attribuées à Toriyama
- Doujinshi et suites amateurs
- Niveaux de puissance inventés et « scans » retouchés

## Règles générales

- Source de vérité suprême : le manga original en 42 tomes d'Akira Toriyama.
- Validité secondaire : révélations SEG / Daizenshuu et scripts originaux (Broly, Super Hero, Daima).
- Règle de séparation : les fillers et les films Toei des années 90 sont des dimensions alternatives.
- En cas de contradiction entre deux sources, la plus proche de la main de Toriyama l'emporte.
- Une affirmation sans source imprimée n'est pas fausse : elle est non établie. On le dit plutôt que de trancher.

## Sources admises

- Manga Dragon Ball, tomes 1 à 42 (édition japonaise et traduction officielle)
- Dragon Ball Super (manga) et Dragon Ball Minus / Jaco
- Daizenshuu 1 à 7, Chōzenshū, Super Exciting Guide et guides Shueisha
- Interviews et Q&A signés d'Akira Toriyama (V-Jump, Saikyō Jump, Dragon Box)
- Catalogues des éditeurs, AniList et Jikan pour les métadonnées de sortie

## Sources refusées

- Wikis de fans (Fandom, miroirs et copies)
- Forums, réseaux sociaux et « leaks » non sourcés
- Fausses interviews et citations non datées
- Réponses générées par un modèle de langage sans source imprimée

## Familles de formulations (rang présumé, jamais un verdict établi)

| Identifiant | Libellé | Rang | Score | Mots-clés |
| --- | --- | --- | --- | --- |
| `manga-original` | Renvoi au manga original | `CANON_ABSOLU` | 100 | manga original, chapitre, tome 1, tome 42, 42 tomes, akira toriyama a dessine |
| `production-toei` | Renvoi à la production animée | `NON_CANON_DERIVE` | 20 | filler, hors-serie, hors serie, oav, episode inedit, toei |
| `jeux-video` | Renvoi aux jeux vidéo | `NON_CANON_DERIVE` | 15 | jeu video, xenoverse, kakarot, budokai, fighterz, sdbh, heroes |
| `supervision-officielle` | Renvoi aux guides et interviews officielles | `EXTENSION_OFFICIELLE` | 85 | daizenshuu, chozenshu, super exciting guide, seg, interview toriyama, entretien toriyama, v-jump, saikyo jump, guide officiel |
| `fanon-general` | Création de fans ou œuvre non officielle | `APOCRYPHE_FANON` | 0 | fan manga, fan-manga, fan animation, fan-animation, fan art, dessin de fan, doujin, doujinshi, non officiel, oeuvre de fan |
| `rumeur` | Rumeur ou fausse citation | `APOCRYPHE_FANON` | 0 | rumeur, fausse interview, leak, fan fiction, fanfiction, doujinshi |

## Repli (`fallback`)

Rang `EXTENSION_OFFICIELLE`, score 50 : Affirmation nécessitant une vérification croisée dans les archives. Le sujet saisi ne correspond à aucun point de divergence répertorié. Dans la doctrine Shenron, une affirmation sans source manga, databook vérifié ou déclaration signée de Toriyama est considérée comme non établie.
Un `fallback` n'établit aucun rang : répondre « non établi ».

## Sujets tranchés (44)

| Identifiant | Sujet | Catégorie | Rang | Score |
| --- | --- | --- | --- | --- |
| `broly` | Broly (Dragon Ball Super, 2018) | character | `CANON_SUPERVISE` | 85 |
| `broly-dbz-1993` | Broly (Version DBZ 1993 / Films Z de Takao Koyama) | character | `NON_CANON_DERIVE` | 20 |
| `gogeta` | Gogeta | character | `CANON_SUPERVISE` | 85 |
| `vegetto` | Vegetto (Vegito) | character | `CANON_ABSOLU` | 100 |
| `bardock` | Bardock | character | `CANON_ABSOLU` | 95 |
| `bardock-tv-special-1990` | Téléfilm Bardock (Le Père de Son Goku, 1990) vs Dragon Ball Minus | work | `NON_CANON_DERIVE` | 30 |
| `goku-saiyan-kakarotto` | Son Goku : Origine Saiyan (Kakarotto) | character | `CANON_ABSOLU` | 100 |
| `destruction-planete-vegeta` | Destruction de la planète Vegeta par Freezer | lore | `CANON_ABSOLU` | 100 |
| `jaco-minus` | Dragon Ball Minus & Jaco the Galactic Patrolman | work | `CANON_ABSOLU` | 100 |
| `gine` | Gine (Mère de Son Goku) | character | `CANON_ABSOLU` | 100 |
| `c16-fils-gero` | C-16 et Gebō (Le fils du Dr Gero) | lore | `CANON_ABSOLU` | 95 |
| `c17-lapis-c18-lazuli` | Noms civils de C-17 (Lapis) et C-18 (Lazuli) | lore | `CANON_ABSOLU` | 100 |
| `mr-satan-mark` | Véritable nom de Mr. Satan (Mark) | lore | `CANON_ABSOLU` | 100 |
| `db-gt` | Dragon Ball GT (SSJ4, Baby, Dragons) | work | `NON_CANON_DERIVE` | 15 |
| `super-saiyan-4` | Super Saiyan 4 (SSJ4) | form | `NON_CANON_DERIVE` | 15 |
| `ssj4-vs-ssjg` | Super Saiyan 4 vs Super Saiyan God / Blue (Canonicité & Débat) | form | `NON_CANON_DERIVE` | 25 |
| `cooler` | Cooler & Metal Cooler | character | `NON_CANON_DERIVE` | 20 |
| `janemba` | Janemba | character | `NON_CANON_DERIVE` | 20 |
| `tapion-epee-trunks` | Tapion, Hildegarn et l'Épée de Trunks | character | `NON_CANON_DERIVE` | 20 |
| `bojack-zangya` | Bojack et les Mercenaires de l'Espace | character | `NON_CANON_DERIVE` | 20 |
| `thales-arbre-sacre` | Thalès (Turles) & l'Arbre Sacré | character | `NON_CANON_DERIVE` | 20 |
| `films-toei-vintage` | Films DBZ vintage (Cycles Toei 1986-1995) | work | `NON_CANON_DERIVE` | 20 |
| `tarble` | Tarble (Frère de Vegeta) | character | `CANON_SUPERVISE` | 90 |
| `piccolo-favori` | Piccolo : Personnage préféré de Toriyama | lore | `CANON_ABSOLU` | 100 |
| `super-saiyan-5-af` | Super Saiyan 5 & Dragon Ball AF | myth | `APOCRYPHE_FANON` | 0 |
| `daima` | Dragon Ball Daima | work | `CANON_SUPERVISE` | 98 |
| `dieu-noyau-monde` | Origine des Dieux Kaïo et Kaïoshin (Planète du Noyau) | lore | `CANON_ABSOLU` | 100 |
| `s-cells` | Cellules S (S-Cells) et déclencheur Super Saiyan | lore | `CANON_ABSOLU` | 95 |
| `dragon-ball-super-manga` | Dragon Ball Super (Manga de Toyotaro) | work | `CANON_SUPERVISE` | 90 |
| `multiplicateurs-super-saiyan` | Multiplicateurs officiels du Super Saiyan (x50, x2, x4) | lore | `EXTENSION_OFFICIELLE` | 75 |
| `unite-kiri-babidi` | L'unité Kiri (Babidi) et conversion en Sentōryoku | lore | `CANON_ABSOLU` | 100 |
| `fusion-potara-vs-metamol-puissance` | Puissance Vegetto (Potara) vs Gogeta (Métamol) | lore | `EXTENSION_OFFICIELLE` | 75 |
| `puissance-goku-ssj1-namek` | Puissance de Goku SSJ1 sur Namek (150 000 000 BP) | lore | `EXTENSION_OFFICIELLE` | 75 |
| `arret-scouter-namek-toriyama` | Abandon des niveaux de puissance chiffrés (Scouters) après Namek | lore | `CANON_ABSOLU` | 100 |
| `beerus-whis` | Beerus, Whis et la hiérarchie divine | character | `CANON_SUPERVISE` | 98 |
| `super-saiyan-god-blue` | Super Saiyan God & Super Saiyan Blue (SSGSS) | form | `CANON_SUPERVISE` | 95 |
| `beast-gohan-orange-piccolo` | Son Gohan Beast & Orange Piccolo | form | `CANON_SUPERVISE` | 98 |
| `zalama-super-dragon-balls` | Zalama & les Super Dragon Balls | lore | `CANON_SUPERVISE` | 92 |
| `uub-oob` | Uub (Oob) & le Ki Divin du Grand Kaïoshin | character | `CANON_ABSOLU` | 100 |
| `c21-vomi` | C-21 & Vomi (Épouse du Dr Gero) | lore | `CANON_SUPERVISE` | 85 |
| `sdbh-heroes` | Super Dragon Ball Heroes (SDBH) & Xenoverse | work | `NON_CANON_DERIVE` | 10 |
| `dbm-multiverse` | Dragon Ball Multiverse (DBM) | myth | `APOCRYPHE_FANON` | 0 |
| `fillers-anime-garlic-paikuhan` | Fillers de l'anime (Garlic Jr, Paikuhan, Gregory, Maron) | work | `NON_CANON_DERIVE` | 20 |
| `gregory-kaio` | Gregory (Le grillon de Kaïo) | character | `NON_CANON_DERIVE` | 20 |

### Broly (Dragon Ball Super, 2018)

- Identifiant : `broly` · catégorie character · rang `CANON_SUPERVISE` · score 85
- Verdict : Canonique dans sa réinvention DBS (2018), Non-canonique dans les films Z (1993-1994).
- Explication : La version originale de 1993 (scénarisée par Takao Koyama) est hors de la trame canonique bien que Toriyama en ait signé le design initial. En 2018, Akira Toriyama a personnellement réécrit et intégré Broly dans la continuité officielle avec le film Dragon Ball Super: Broly.
- Citation : « Broly est un personnage incroyablement populaire. Tout en préservant son image de base pour ne pas décevoir les fans, j'ai apporté une nouvelle facette à son histoire pour en faire une aventure encore plus fascinante. » — Commentaire officiel de production de Dragon Ball Super: Broly, 2018
- Sources :
  - Film Dragon Ball Super: Broly (2018)
  - Daizenshuu 6 (Films Z)
  - Manga DBS
- Mots-clés : broly, broli, broly dbs, broly 2018, broly super, dbs broly, ブロリー, paragus, super saiyan legendaire, berserk
- Page du site : https://dragonballfr.com/wiki/canon?q=Broly%20(Dragon%20Ball%20Super%2C%202018)

### Broly (Version DBZ 1993 / Films Z de Takao Koyama)

- Identifiant : `broly-dbz-1993` · catégorie character · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canonique. Antagoniste exclusif des films Toei Z (1993-1994) scénarisés par Takao Koyama.
- Explication : L'incarnation originale de Broly dans les films 8, 10 et 11 de Dragon Ball Z est hors de la continuité canonique du manga, bien que son design graphique initial ait été dessiné par Akira Toriyama. Son traumatisme lié aux pleurs de Goku et sa folie destructrice appartiennent à la chronologie parallèle de Toei Animation. Seul le Broly redéfini et réécrit par Akira Toriyama dans Dragon Ball Super: Broly (2018) est canonique.
- Citation : « J'avais complètement oublié l'histoire des anciens films de Broly. En 2018, j'ai repris le personnage à zéro en conservant son apparence essentielle mais en réécrivant son histoire pour l'intégrer à la série officielle. » — Paraphrase, pas une citation littérale — Commentaire de production Dragon Ball Super: Broly, 2018
- Sources :
  - Daizenshuu 6 : Movies & TV Specials
  - Films DBZ 8, 10, 11 (Toei Animation)
  - Film DBS Broly (2018)
- Mots-clés : broly 1993, broly dbz 1993, broly dbz, broly z, broly film 1993, broly le super saiyan legendaire 1993, dbz 1993, bio-broly, bio broly, broly second coming, broly kakarotto pleure
- Page du site : https://dragonballfr.com/wiki/canon?q=Broly%20(Version%20DBZ%201993%20%2F%20Films%20Z%20de%20Takao%20Koyama)

### Gogeta

- Identifiant : `gogeta` · catégorie character · rang `CANON_SUPERVISE` · score 85
- Verdict : Canonisé dans Dragon Ball Super: Broly (2018). Ses apparitions dans Fusions (1995) et DBGT sont non-canoniques.
- Explication : La fusion Métamol entre Goku et Vegeta a été inventée par Toriyama dans le manga, mais Gogeta n'apparaissait originellement que dans le film Toei de 1995 et dans GT. Toriyama l'a officiellement réintroduit et validé dans la trame principale lors du combat contre Broly en 2018.
- Sources :
  - Film Dragon Ball Super: Broly (2018)
  - Manga DB Tome 41 (principe de la danse)
- Mots-clés : gogeta, fusion metamol, stardust breaker, soul punisher, janemba
- Page du site : https://dragonballfr.com/wiki/canon?q=Gogeta

### Vegetto (Vegito)

- Identifiant : `vegetto` · catégorie character · rang `CANON_ABSOLU` · score 100
- Verdict : 100% Canon absolu. Créé, nommé et dessiné par Akira Toriyama dans le manga original.
- Explication : Né des boucles d'oreilles Potaras données par le Vieux Kaïoshin. Toriyama a imaginé la fusion Potara pour surprendre ses lecteurs après que le staff de l'anime lui a révélé préparer la fusion Métamol pour le film de Gogeta.
- Sources :
  - Manga Dragon Ball Tome 42 (Chapitres 503-506)
  - Daizenshuu 2
- Mots-clés : vegetto, vegito, potara, potaras, potalas, potala, fusion potara, fusion potala
- Page du site : https://dragonballfr.com/wiki/canon?q=Vegetto%20(Vegito)

### Bardock

- Identifiant : `bardock` · catégorie character · rang `CANON_ABSOLU` · score 95
- Verdict : Canon absolu. Validé dans le manga par Toriyama, développé dans Dragon Ball Minus et DBS Broly.
- Explication : Bien qu'initialement conçu par Toei Animation pour le téléfilm de 1990, Toriyama a tellement adoré le personnage qu'il l'a canonisé en dessinant son visage dans deux cases du manga original (Chapitre 307). Il a ensuite réécrit son départ dans Dragon Ball Minus (2014) aux côtés de sa compagne Gine.
- Citation : « Ce téléfilm m'a tellement ému que j'ai voulu intégrer Bardock dans mon manga. C'est l'un des rares cas où l'anime m'a directement inspiré. » — Daizenshuu 6 : Movies & TV Specials, 1995
- Sources :
  - Manga DB Tome 26 (Chapitre 307)
  - Jaco the Galactic Patrolman (DB Minus)
  - DBS Broly
- Mots-clés : bardock, barduk, dragon ball minus, pere de goku, tatta hitori no saishū kessen
- Page du site : https://dragonballfr.com/wiki/canon?q=Bardock

### Téléfilm Bardock (Le Père de Son Goku, 1990) vs Dragon Ball Minus

- Identifiant : `bardock-tv-special-1990` · catégorie work · rang `NON_CANON_DERIVE` · score 30
- Verdict : Non-canonique dans son déroulement narratif. Remplacé dans la trame officielle par Dragon Ball Minus et DBS Broly.
- Explication : Le téléfilm de 1990 'Le Père de Son Goku' (scénarisé par Katsuyuki Sumisawa chez Toei) a tellement plu à Toriyama qu'il a intégré le visage de Bardock dans deux cases du manga (Chapitre 307). Cependant, les événements du téléfilm (le don de voir l'avenir transmis par un Kanassan, l'escouade de Toma massacrée sur Meat, le bandana ensanglanté, et Goku bébé nu envoyé sur Terre) ont été officiellement remplacés par Akira Toriyama dans Dragon Ball Minus (2014) et le film DBS Broly : Bardock y a une intuition lucide, sa compagne Gine existe, et Goku part plus âgé vêtu d'une armure saiyanne.
- Sources :
  - Manga Dragon Ball Tome 26 (Chapitre 307)
  - Dragon Ball Minus (2014)
  - Film DBS Broly (2018)
  - Daizenshuu 6
- Mots-clés : bardock tv special, bardock telefilm, bardock 1990, tatta hitori no saishu kessen, bardock vs minus, bardock tv special vs minus, premonition de bardock, don de prescience bardock, bandana ensanglante bardock
- Page du site : https://dragonballfr.com/wiki/canon?q=T%C3%A9l%C3%A9film%20Bardock%20(Le%20P%C3%A8re%20de%20Son%20Goku%2C%201990)%20vs%20Dragon%20Ball%20Minus

### Son Goku : Origine Saiyan (Kakarotto)

- Identifiant : `goku-saiyan-kakarotto` · catégorie character · rang `CANON_ABSOLU` · score 100
- Verdict : 100% Canon absolu. Révélé par Raditz dans le manga original (Chapitre 195).
- Explication : Son Goku est un Saiyan de basse classe né sur la planète Vegeta sous le nom de Kakarotto (Kakarot). Envoyé sur Terre dans une capsule spatiale pour survivre aux soupçons pesant sur Freezer (Dragon Ball Minus / Jaco / DBS Broly), il a été recueilli par Grand-Père Son Gohan. Sa véritable nature extraterrestre et son nom de naissance saiyan sont révélés dès l'arrivée de son frère Raditz au chapitre 195 du manga.
- Citation : « Goku est un Saiyan envoyé depuis la planète Vegeta. J'ai pensé que révéler ses origines extraterrestres donnerait un nouvel élan spectaculaire à l'histoire. » — Paraphrase, pas une citation littérale — Daizenshuu 2 : Story Guide, 1995
- Sources :
  - Manga Dragon Ball Tome 17 (Chapitre 195)
  - Dragon Ball Minus
  - Film DBS Broly (2018)
- Mots-clés : goku est-il un saiyan, goku saiyan, goku est un saiyan, kakarotto, kakarot, origine saiyan goku, nature saiyanne de goku, vrai nom de goku, nom saiyan de goku, goku extraterrestre, カカロット
- Page du site : https://dragonballfr.com/wiki/canon?q=Son%20Goku%20%3A%20Origine%20Saiyan%20(Kakarotto)

### Destruction de la planète Vegeta par Freezer

- Identifiant : `destruction-planete-vegeta` · catégorie lore · rang `CANON_ABSOLU` · score 100
- Verdict : 100% Canon absolu. Établi dans le manga original (Chapitre 257) et illustré dans Dragon Ball Minus et DBS Broly.
- Explication : Freezer a anéanti la planète Vegeta et la quasi-totalité du peuple Saiyan avec une gigantesque Supernova par crainte de la légende du Super Saiyan et du Super Saiyan God. Bien que Freezer ait prétendu aux survivants (Vegeta, Nappa, Raditz) qu'un météore géant avait détruit leur monde, la vérité est révélée par Dodoria à Vegeta au chapitre 257 du manga. Dragon Ball Super a précisé que Beerus avait préalablement donné son accord ou suggéré cette destruction.
- Sources :
  - Manga Dragon Ball Tome 22 (Chapitre 257)
  - Dragon Ball Minus
  - Film DBS Broly (2018)
  - Manga DBS Chapitre 69
- Mots-clés : destruction planete vegeta, freezer a detruit la planete vegeta, freezer detruit vegeta, destruction de vegeta, planete vegeta freezer, pourquoi freezer a detruit la planete vegeta, genocide saiyan freezer
- Page du site : https://dragonballfr.com/wiki/canon?q=Destruction%20de%20la%20plan%C3%A8te%20Vegeta%20par%20Freezer

### Dragon Ball Minus & Jaco the Galactic Patrolman

- Identifiant : `jaco-minus` · catégorie work · rang `CANON_ABSOLU` · score 100
- Verdict : 100% Canon absolu. Écrit et dessiné intégralement par Akira Toriyama en 2013-2014.
- Explication : Préambule officiel à Dragon Ball, publié par Toriyama dans le Weekly Shonen Jump. Il établit la rencontre entre Jaco, Bulma enfant et sa sœur aînée Tights, ainsi que les circonstances exactes du départ de Son Goku enfant de la planète Vegeta, envoyé par Bardock et Gine pour le protéger des soupçons pesant sur Freezer.
- Sources :
  - Jaco the Galactic Patrolman (manga d'Akira Toriyama, 2013-2014)
  - Dragon Ball Minus (Jump Comics)
  - Film DBS Broly (2018)
- Mots-clés : jaco, dragon ball minus, jaco le patrouilleur galactique, depart goku minus, origine goku capsule, tights, omori
- Page du site : https://dragonballfr.com/wiki/canon?q=Dragon%20Ball%20Minus%20%26%20Jaco%20the%20Galactic%20Patrolman

### Gine (Mère de Son Goku)

- Identifiant : `gine` · catégorie character · rang `CANON_ABSOLU` · score 100
- Verdict : 100% Canon absolu. Créée et dessinée par Akira Toriyama dans Dragon Ball Minus (2014).
- Explication : Toriyama a révélé pour la première fois l'existence de la mère de Son Goku dans le Saikyō Jump de mars 2014 avant de la mettre en scène dans Dragon Ball Minus. Contrairement aux guerriers saiyans belliqueux, Gine avait un tempérament doux et travaillait au centre de distribution de viande sur la planète Vegeta.
- Citation : « Son nom est Gine. Elle a autrefois combattu dans l'escouade de Bardock, mais sa nature douce la rendait inadaptée au combat. Ils ont développé un lien affectif rare chez les Saiyans, où les unions ne servent d'ordinaire qu'à la reproduction. » — Saikyō Jump Mars 2014 (Entretien Akira Toriyama), 2014
- Sources :
  - Saikyō Jump Mars 2014
  - Dragon Ball Minus (2014)
  - Film Dragon Ball Super: Broly (2018)
- Mots-clés : gine, mere de goku, femme de bardock, compagne de bardock, mere kakarotto
- Page du site : https://dragonballfr.com/wiki/canon?q=Gine%20(M%C3%A8re%20de%20Son%20Goku)

### C-16 et Gebō (Le fils du Dr Gero)

- Identifiant : `c16-fils-gero` · catégorie lore · rang `CANON_ABSOLU` · score 95
- Verdict : Canon absolu. Histoire intime de C-16 dévoilée par Akira Toriyama en 2014.
- Explication : Dans l'émission Mandō Kobayashi (2014), Akira Toriyama a révélé que le Dr Gero avait conçu le robot C-16 à l'image exacte de son fils défunt, un soldat de haut rang de l'Armée du Ruban Rouge tombé sous une balle ennemie. Pris d'une affection paternelle protectrice, Gero l'a doté d'une puissance colossale mais d'une programmation pacifique pour éviter qu'il ne soit à nouveau détruit au combat.
- Citation : « Le modèle de C-16 était le propre fils du Dr Gero, mort jeune comme soldat du Ruban Rouge. C'est pourquoi Gero lui a donné une personnalité douce et refusait de le voir combativement engagé. » — Mandō Kobayashi (Fuji TV ONE) — Entretien Akira Toriyama, 2014
- Sources :
  - Mandō Kobayashi Mars 2014
  - Dragon Ball Super: Super Hero (arbre généalogique Red Ribbon)
- Mots-clés : c16, c-16, fils de gero, fils du docteur gero, gebo, gevo, pourquoi c16 est gentil
- Page du site : https://dragonballfr.com/wiki/canon?q=C-16%20et%20Geb%C5%8D%20(Le%20fils%20du%20Dr%20Gero)

### Noms civils de C-17 (Lapis) et C-18 (Lazuli)

- Identifiant : `c17-lapis-c18-lazuli` · catégorie lore · rang `CANON_ABSOLU` · score 100
- Verdict : Canon absolu. Révélé directement par Akira Toriyama.
- Explication : Dans une session de questions/réponses du Super Exciting Guide puis du V-Jump (2014), Toriyama a dévoilé que C-17 et C-18 étaient des jumeaux humains nommés Lapis et Lazuli avant d'être kidnappés et modifiés par le Dr Gero.
- Sources :
  - Super Exciting Guide
  - V-Jump Mai 2014 (Toriyama Q&A)
- Mots-clés : lapis, lazuli, vrai nom c17, vrai nom c18, humains artificiels
- Page du site : https://dragonballfr.com/wiki/canon?q=Noms%20civils%20de%20C-17%20(Lapis)%20et%20C-18%20(Lazuli)

### Véritable nom de Mr. Satan (Mark)

- Identifiant : `mr-satan-mark` · catégorie lore · rang `CANON_ABSOLU` · score 100
- Verdict : Canon absolu. Révélé par Akira Toriyama dans le Super Exciting Guide (2009).
- Explication : Mr. Satan est son pseudonyme de ring de combat. Son véritable prénom est Mark (anagramme de Akuma, diable en japonais). Dans son secteur culturel, il n'existe pas de noms de famille.
- Sources :
  - Super Exciting Guide : Character Volume (2009)
  - docs/reference/toriyama-databook-seg.md
- Mots-clés : mark, vrai nom satan, mr satan, nom de famille hercule
- Page du site : https://dragonballfr.com/wiki/canon?q=V%C3%A9ritable%20nom%20de%20Mr.%20Satan%20(Mark)

### Dragon Ball GT (SSJ4, Baby, Dragons)

- Identifiant : `db-gt` · catégorie work · rang `NON_CANON_DERIVE` · score 15
- Verdict : Non-canonique à la continuité Toriyama. Qualifié de 'Grand Side-Story' par l'auteur.
- Explication : Produit par Toei Animation sans implication narrative d'Akira Toriyama. L'auteur a uniquement fourni le titre 'GT' (Grand Touring), le logo, le design initial du trio Goku/Trunks/Pan et quelques planches préliminaires.
- Citation : « Pour GT, la seule chose que j'ai faite a été de trouver le titre, de dessiner le design initial des personnages principaux et de quelques machines. Étant libéré des contraintes d'une sérialisation, j'ai pu apprécier Dragon Ball GT en simple spectateur, comme une merveilleuse histoire parallèle (grand side-story). » — Dragon Ball GT DVD Box 'Dragon Box GT' (Introduction de Toriyama), 2005
- Sources :
  - Dragon Box GT
- Mots-clés : gt, dragon ball gt, baby, omega shenron, li shenron
- Page du site : https://dragonballfr.com/wiki/canon?q=Dragon%20Ball%20GT%20(SSJ4%2C%20Baby%2C%20Dragons)

### Super Saiyan 4 (SSJ4)

- Identifiant : `super-saiyan-4` · catégorie form · rang `NON_CANON_DERIVE` · score 15
- Verdict : Non-canonique. Conçu par Katsuyoshi Nakatsuru pour Dragon Ball GT.
- Explication : Le design emblématique du Super Saiyan 4 (fourrure rouge, queue de singe et cheveux noirs) a été créé par l'animateur en chef Katsuyoshi Nakatsuru chez Toei Animation pour Dragon Ball GT. Akira Toriyama a grandement apprécié ce design et en a dessiné sa propre version hommage pour la Dragon Box GT en 2005, mais a confirmé qu'il s'agissait d'une création de l'anime appartenant à une histoire parallèle (grand side-story).
- Citation : « Le design du Super Saiyan 4 a été créé par Nakatsuru-kun de Toei Animation. J'ai été très impressionné par son idée de combiner l'Oozaru et le Super Saiyan, et je me suis amusé à le redessiner moi-même pour ce coffret. » — Dragon Book (Dragon Box GT), 2005
- Sources :
  - Dragon Box GT (2005)
  - Dragon Ball GT Perfect Files
  - Entretiens Akira Toriyama & Katsuyoshi Nakatsuru
- Mots-clés : super saiyan 4, ssj4, transformation ssj4, oozaru dore, katsuyoshi nakatsuru ssj4, goku ssj4, vegeta ssj4, gogeta ssj4
- Page du site : https://dragonballfr.com/wiki/canon?q=Super%20Saiyan%204%20(SSJ4)

### Super Saiyan 4 vs Super Saiyan God / Blue (Canonicité & Débat)

- Identifiant : `ssj4-vs-ssjg` · catégorie form · rang `NON_CANON_DERIVE` · score 25
- Verdict : Le Super Saiyan God est Canon Supervisé (Toriyama, 2013) ; le Super Saiyan 4 est Non-Canon Dérivé (GT / Nakatsuru, 1996).
- Explication : Sur le plan de la canonicité, il n'y a pas d'ambiguïté : le Super Saiyan God et le Super Saiyan Blue sont nés de la plume d'Akira Toriyama pour Battle of Gods et La Résurrection de F, intégrés dans la continuité officielle de Dragon Ball Super. Le Super Saiyan 4 a été conçu par Katsuyoshi Nakatsuru pour Dragon Ball GT, une série que Toriyama qualifie de 'grand side-story' hors continuité. Toute comparaison de puissance entre les deux relève du crossover de jeux vidéo (SDBH/Heroes) et non de la chronologie canonique.
- Sources :
  - Film Battle of Gods (2013)
  - Dragon Box GT (2005)
  - Manga DBS
  - Super Dragon Ball Heroes
- Mots-clés : ssj4 vs ssjg, ssj4 vs ssg, ssj4 vs ssgss, ssj4 vs ssj blue, super saiyan 4 vs super saiyan god, ssj4 vs god, ssj4 ou god, ssj god vs ssj4
- Page du site : https://dragonballfr.com/wiki/canon?q=Super%20Saiyan%204%20vs%20Super%20Saiyan%20God%20%2F%20Blue%20(Canonicit%C3%A9%20%26%20D%C3%A9bat)

### Cooler & Metal Cooler

- Identifiant : `cooler` · catégorie character · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canonique. Conçu pour les films 5 et 6 par Toei Animation et Takao Koyama.
- Explication : Bien qu'Akira Toriyama ait dessiné l'apparence de Cooler et sa transformation finale à la demande de Toei Animation, le frère aîné de Freezer n'apparaît dans aucun chapitre du manga original ni dans Dragon Ball Super. Les films 'La Revanche de Cooler' et 'Cent Mille Guerriers de Métal' se déroulent dans une chronologie incompatible avec les événements de Namek et de la Terre.
- Citation : « J'envisage les films de cinéma comme des histoires situées dans une dimension parallèle à celle de mon manga original. » — Daizenshuu 6 : Movies & TV Specials, 1995
- Sources :
  - Daizenshuu 6 : Movies & TV Specials
  - Manga Dragon Ball (Tomes 27-28)
  - Jump Comics Film Animation Comics
- Mots-clés : cooler, kula, metal cooler, forme finale cooler, sauzer, neiz, dore, escadron cooler, film cooler
- Page du site : https://dragonballfr.com/wiki/canon?q=Cooler%20%26%20Metal%20Cooler

### Janemba

- Identifiant : `janemba` · catégorie character · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canonique. Antagoniste exclusif du film 12 Fusions (1995).
- Explication : Né de l'explosion de la machine purificatrice d'âmes aux Enfers, Janemba a été imaginé par le scénariste Takao Koyama pour servir d'adversaire à la première apparition de la fusion Métamol Gogeta au cinéma. Akira Toriyama en a réalisé le design sur demande du studio, mais Janemba n'appartient à aucune continuité canonique.
- Sources :
  - Daizenshuu 6 : Movies & TV Specials
  - Film Dragon Ball Z : Fusions (1995)
- Mots-clés : janemba, super janemba, saike demon, monde des morts janemba, epee janemba, film fusions
- Page du site : https://dragonballfr.com/wiki/canon?q=Janemba

### Tapion, Hildegarn et l'Épée de Trunks

- Identifiant : `tapion-epee-trunks` · catégorie character · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canonique. Tapion, Hildegarn et l'épée que Tapion confie à Trunks viennent du seul film Toei L'Attaque du Dragon (1995).
- Explication : Le film 13 'L'Attaque du Dragon' (1995) met en scène Tapion offrant son épée au jeune Trunks du présent. Cependant, dans le manga original et le chapitre spécial 'Trunks the Story', Trunks du futur combat les cyborgs dans une trame apocalyptique où Tapion et Hildegarn n'ont jamais existé.
- Sources :
  - Manga Dragon Ball Tome 33 (Trunks the Story)
  - Daizenshuu 6
  - Film L'Attaque du Dragon (1995)
- Mots-clés : tapion, hildegarn, epee de trunks, minotia, ocarina tapion, attaque du dragon, konatsien
- Page du site : https://dragonballfr.com/wiki/canon?q=Tapion%2C%20Hildegarn%20et%20l'%C3%89p%C3%A9e%20de%20Trunks

### Bojack et les Mercenaires de l'Espace

- Identifiant : `bojack-zangya` · catégorie character · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canonique. Conçu par Toei Animation pour le film 9 (1993).
- Explication : Scénarisé par Takao Koyama pour s'insérer juste après la mort de Son Goku lors des Cell Games. Toriyama a réalisé les dessins préparatoires de Bojack et de ses acolytes à la demande du studio, mais les événements du tournoi d'arts martiaux de la famille Dollar ne font pas partie de la trame du manga original.
- Sources :
  - Daizenshuu 6 : Movies & TV Specials
  - Film Dragon Ball Z : Les Mercenaires de l'Espace (1993)
- Mots-clés : bojack, boujack, zangya, bido, bujin, goku ssj2 bojack, les mercenaires de l'espace
- Page du site : https://dragonballfr.com/wiki/canon?q=Bojack%20et%20les%20Mercenaires%20de%20l'Espace

### Thalès (Turles) & l'Arbre Sacré

- Identifiant : `thales-arbre-sacre` · catégorie character · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canonique. Film Toei Animation de 1990 explorant un Son Goku maléfique alternatif.
- Explication : Imaginé par Takao Koyama et Toei Animation pour explorer ce que serait devenu Son Goku s'il n'avait pas perdu la mémoire en tombant sur la tête. Toriyama a dessiné le charadesign de Thalès, mais le film est chronologiquement incompatible avec la saga Namek (Son Goku vivant sur Terre avec Kaio-ken alors que Yamcha, Chaozu et Tenshinhan sont encore en vie).
- Sources :
  - Daizenshuu 6 : Movies & TV Specials
  - Film Dragon Ball Z : Le Combat Fratricide (1990)
- Mots-clés : thales, turles, arbre sacre, shinseiju, fruit arbre sacre, sosie de goku, film thales
- Page du site : https://dragonballfr.com/wiki/canon?q=Thal%C3%A8s%20(Turles)%20%26%20l'Arbre%20Sacr%C3%A9

### Films DBZ vintage (Cycles Toei 1986-1995)

- Identifiant : `films-toei-vintage` · catégorie work · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canoniques. Univers parallèles conçus par Toei Animation et Takao Koyama.
- Explication : Ces films ne peuvent pas s'insérer logiquement dans la chronologie du manga original (personnages morts encore vivants, Son Goku présent sur Terre pendant Namek, etc.). Toriyama a seulement réalisé certains charadesigns à la demande du studio.
- Citation : « J'envisage les films de cinéma comme des histoires situées dans une dimension parallèle à celle de mon manga original. » — Daizenshuu 6 : Movies & TV Specials, 1995
- Sources :
  - Daizenshuu 6
- Mots-clés : films toei, films dbz, films vintage, oav dbz, slug, c-13, film z, dimensions paralleles
- Page du site : https://dragonballfr.com/wiki/canon?q=Films%20DBZ%20vintage%20(Cycles%20Toei%201986-1995)

### Tarble (Frère de Vegeta)

- Identifiant : `tarble` · catégorie character · rang `CANON_SUPERVISE` · score 90
- Verdict : Canonique. Conçu par Toriyama pour l'OAV de 2008 et mentionné dans Battle of Gods.
- Explication : L'histoire originale de l'OAV 2008 'Salut ! Son Goku et ses amis sont de retour !!' a été écrite par Akira Toriyama lui-même. Tarble est ensuite expressément mentionné par Bulma dans le film Battle of Gods (2013) et dans le manga Dragon Ball Super.
- Sources :
  - OAV Jump Super Anime Tour 2008
  - Film Battle of Gods (2013)
  - DBS Manga Tome 1
- Mots-clés : tarble, table, frere de vegeta, tarble frere de vegeta, tarble est-il canon, femme de tarble, gure, salada, abo cado, kado
- Page du site : https://dragonballfr.com/wiki/canon?q=Tarble%20(Fr%C3%A8re%20de%20Vegeta)

### Piccolo : Personnage préféré de Toriyama

- Identifiant : `piccolo-favori` · catégorie lore · rang `CANON_ABSOLU` · score 100
- Verdict : Canon absolu. Affirmation constante et confirmée de 1995 à 2022.
- Explication : Toriyama a toujours affirmé que Piccolo était son personnage favori, bien avant Goku et Vegeta. C'est pour cette raison qu'il a placé Piccolo et Gohan au centre absolu du film Dragon Ball Super: Super Hero en 2022.
- Citation : « Je suppose que j'aime Piccolo le plus après tout... Avec Piccolo, son passé de méchant le rend plus intéressant à développer que Goku, qui est d'une pureté absolue. » — Paraphrase, pas une citation littérale — Daizenshuu 2 : Story Guide (1995) & Interview Super Hero (2022), 1995
- Sources :
  - Daizenshuu 2
  - Interview DBS Super Hero (2022)
- Mots-clés : piccolo favori, personnage prefere toriyama, personnage favori toriyama, personnage prefere d'akira toriyama, personnage favori d'akira toriyama, auteur aime piccolo, piccolo toriyama, prefere de toriyama, favori de toriyama
- Page du site : https://dragonballfr.com/wiki/canon?q=Piccolo%20%3A%20Personnage%20pr%C3%A9f%C3%A9r%C3%A9%20de%20Toriyama

### Super Saiyan 5 & Dragon Ball AF

- Identifiant : `super-saiyan-5-af` · catégorie myth · rang `APOCRYPHE_FANON` · score 0
- Verdict : 100% Apocryphe & Fanon. Canular né sur Internet en 1999.
- Explication : Créé à l'origine par David Montiel Franco (Tablos) comme fan-art dans un magazine espagnol, puis propagé mondialement comme fausse rumeur de suite officielle. N'a aucun lien avec Akira Toriyama, bien que Toyotaro (alors Toyble) s'en soit inspiré pour son doujinshi amateur avant d'être engagé par Shueisha.
- Sources :
  - Hobby Consolas (1999)
- Mots-clés : super saiyan 5, ssj5, dragon ball af, zaiko, xicor, toyble
- Page du site : https://dragonballfr.com/wiki/canon?q=Super%20Saiyan%205%20%26%20Dragon%20Ball%20AF

### Dragon Ball Daima

- Identifiant : `daima` · catégorie work · rang `CANON_SUPERVISE` · score 98
- Verdict : Canonique. Dernière œuvre majeure dont Akira Toriyama a conçu l'histoire et les designs.
- Explication : Akira Toriyama s'est impliqué à un niveau record dans Dragon Ball Daima : il a créé le concept original, l'histoire complète, la structure du Royaume des Démons (Makai), les vaisseaux, ainsi que l'intégralité des nouveaux personnages et monstres.
- Citation : « Je me suis retrouvé très impliqué dans cette série, bien plus que d'habitude. J'ai créé l'histoire, les décors et de nombreux designs. C'est une grande aventure palpitante ! » — Message officiel d'annonce de Dragon Ball Daima (New York Comic Con), 2023
- Sources :
  - Dragon Ball Daima (2024)
  - Annonce officielle New York Comic Con 2023
- Mots-clés : daima, dragon ball daima, glorio, panzy, gomah, royaume des demons, daima realm, demon realm, royaume demoniaque, royaume des demons daima, makai, tamagami
- Page du site : https://dragonballfr.com/wiki/canon?q=Dragon%20Ball%20Daima

### Origine des Dieux Kaïo et Kaïoshin (Planète du Noyau)

- Identifiant : `dieu-noyau-monde` · catégorie lore · rang `CANON_ABSOLU` · score 100
- Verdict : Canon absolu. Révélé par Akira Toriyama dans le Super Exciting Guide (2009).
- Explication : Les Kaïo et Kaïoshin naissent de fruits sur l'Arbre du Monde de la Planète Kaishin-sei. Ils sont asexués, vivent 75 000 ans et seuls les fruits dorés rarissimes donnent naissance aux Kaïoshin.
- Sources :
  - Super Exciting Guide : Character Volume (2009)
  - docs/reference/toriyama-databook-seg.md
- Mots-clés : kaishin-sei, shin-jin, arbre du monde, fruits dores, makaio, origine kaioshin, kaiju
- Page du site : https://dragonballfr.com/wiki/canon?q=Origine%20des%20Dieux%20Ka%C3%AFo%20et%20Ka%C3%AFoshin%20(Plan%C3%A8te%20du%20Noyau)

### Cellules S (S-Cells) et déclencheur Super Saiyan

- Identifiant : `s-cells` · catégorie lore · rang `CANON_ABSOLU` · score 95
- Verdict : Canon absolu. Concept biologique formulé par Akira Toriyama.
- Explication : Dans le Saikyō Jump de janvier 2018, Toriyama explique que pour devenir Super Saiyan, un corps saiyan doit posséder un seuil suffisant de 'Cellules S', favorisées par un esprit doux et un entraînement rigoureux. Goten et Trunks en ont hérité en grande quantité.
- Sources :
  - Saikyō Jump Janvier 2018 (Toriyama Q&A)
- Mots-clés : s-cells, cellules s, declencheur super saiyan, coeur pur, goten trunks super saiyan
- Page du site : https://dragonballfr.com/wiki/canon?q=Cellules%20S%20(S-Cells)%20et%20d%C3%A9clencheur%20Super%20Saiyan

### Dragon Ball Super (Manga de Toyotaro)

- Identifiant : `dragon-ball-super-manga` · catégorie work · rang `CANON_SUPERVISE` · score 90
- Verdict : Canon supervisé. Scénarios validés et storyboards annotés par Toriyama.
- Explication : Toyotaro dessine le manga sous la supervision directe de Toriyama. Toriyama fournissait le plan de trame général, corrigeait les storyboards case par case et écrivait les dialogues clés.
- Sources :
  - Dragon Ball Super (Jump Comics)
  - Entretiens croisés Toriyama x Toyotaro
- Mots-clés : dbs manga, toyotaro, moro, granolah, ultra instinct, ultra ego
- Page du site : https://dragonballfr.com/wiki/canon?q=Dragon%20Ball%20Super%20(Manga%20de%20Toyotaro)

### Multiplicateurs officiels du Super Saiyan (x50, x2, x4)

- Identifiant : `multiplicateurs-super-saiyan` · catégorie lore · rang `EXTENSION_OFFICIELLE` · score 75
- Verdict : Officiel selon le Daizenshuu 7 et le Super Exciting Guide (2009). SSJ1 = x50, SSJ2 = x2 de SSJ1 (x100), SSJ3 = x4 de SSJ2 (x400).
- Explication : Akira Toriyama a précisé qu'en dessinant l'éveil du Super Saiyan, il pensait à une multiplication par 10 car 50 lui semblait démesuré, mais que pour rester cohérent face au Kaio-ken x20 de Goku, les guides officiels de Shueisha ont gravé le multiplicateur par 50. Le Super Exciting Guide (2009) a ensuite complété la hiérarchie : SSJ2 = 2x SSJ1 (x100 de la base) et SSJ3 = 4x SSJ2 (x400 de la base).
- Sources :
  - Daizenshuu 7 : Dictionnaire de Dragon Ball (p. 83)
  - Super Exciting Guide : Story Volume (2009)
  - Entretien Akira Toriyama (Daizenshuu 6)
- Mots-clés : multiplicateur, multiplicateurs, multiplicateur super saiyan, multiplicateur ssj, ssj x50, ssj2 x100, ssj3 x400, multiplicateur ssj2, multiplicateur ssj3, seg multiplicateur, puissance super saiyan, facteur multiplicateur
- Page du site : https://dragonballfr.com/wiki/canon?q=Multiplicateurs%20officiels%20du%20Super%20Saiyan%20(x50%2C%20x2%2C%20x4)

### L'unité Kiri (Babidi) et conversion en Sentōryoku

- Identifiant : `unite-kiri-babidi` · catégorie lore · rang `CANON_ABSOLU` · score 100
- Verdict : 100% Canon absolu dans le manga (Tome 38). Yakon = 800 Kiri, Goku SSJ2 = 3 000 Kiri. Seuil de destruction planétaire = 200 à 300 Kiri.
- Explication : Introduit par Akira Toriyama dans l'arc Majin Boo afin de contourner l'inflation astronomique des scouters. Babidi utilise un appareil magique mesurant le ki en Kiri : Yakon absorbe la lumière et atteint 800 Kiri, tandis que Goku passant en SSJ2 sature le compteur à 3 000 Kiri. La conversion « 1 Kiri ≈ 50 000 unités scouter », répandue chez les fans, n'a aucune source officielle.
- Sources :
  - Manga Dragon Ball Tome 38 (Chapitres 450-452)
- Mots-clés : kiri, unite kiri, kiri babidi, yakon kiri, kiri sentoryoku, conversion kiri, mesure babidi
- Page du site : https://dragonballfr.com/wiki/canon?q=L'unit%C3%A9%20Kiri%20(Babidi)%20et%20conversion%20en%20Sent%C5%8Dryoku

### Puissance Vegetto (Potara) vs Gogeta (Métamol)

- Identifiant : `fusion-potara-vs-metamol-puissance` · catégorie lore · rang `EXTENSION_OFFICIELLE` · score 75
- Verdict : Le manga établit la supériorité naturelle des Potaras (rivalité + pas d'égalisation imposée). Le Super Exciting Guide formalise une formule de multiplication (A x B).
- Explication : Dans le manga, le Vieux Kaïoshin affirme que la fusion Potara est supérieure à la danse Métamol : les utilisateurs n'ont pas besoin d'aligner leur puissance sur le plus faible, la fusion dure sans limite de temps pour les mortels à l'époque de Z, et le lien de rivaux de Goku et Vegeta amplifie le résultat. Le Super Exciting Guide (2009) ajoute que l'effet Potara est comparable à une multiplication des forces de combat.
- Sources :
  - Manga Dragon Ball Tome 42 (Chapitre 504)
  - Super Exciting Guide : Story Volume (2009)
  - Daizenshuu 7
- Mots-clés : potara vs metamol, fusion potara vs metamol, fusion potara vs fusion metamol, fusion potara est superieure, fusion potara superieure, potara superieure, potara est superieure, potara superieure metamol, potara superieure a la fusion metamol, vegetto vs gogeta, vegetto plus fort que gogeta, vegetto est-il plus fort que gogeta, vegetto contre gogeta, gogeta vs vegito, gogeta vs vegetto, gogeta ou vegetto, gogeta ou vegito, gogeta contre vegito, gogeta contre vegetto, comparaison potara metamol, comparaison vegetto gogeta, puissance vegetto vs gogeta, puissance gogeta vs vegetto, puissance gogeta vs vegito, multiplication potara, addition metamol, fusion comparaison puissance, potara ou metamol, potala ou metamol, potala vs metamol, formule potara seg
- Page du site : https://dragonballfr.com/wiki/canon?q=Puissance%20Vegetto%20(Potara)%20vs%20Gogeta%20(M%C3%A9tamol)

### Puissance de Goku SSJ1 sur Namek (150 000 000 BP)

- Identifiant : `puissance-goku-ssj1-namek` · catégorie lore · rang `EXTENSION_OFFICIELLE` · score 75
- Verdict : Chiffre officiel établi par le Daizenshuu 7 (p. 82-83). Goku SSJ1 = 150 000 000, Freezer 100% = 120 000 000.
- Explication : Le combat titanesque sur Namek marque le point culminant des mesures chiffrées de la série. Le Daizenshuu 7 a documenté Goku normal sortant du caisson de régénération à 3 000 000 d'unités, son Kaio-ken x20 à 60 000 000, et son Super Saiyan (x50) à 150 000 000, dominant Freezer à son maximum (120 000 000). Au-delà de cet affrontement, Toriyama n'a plus jamais utilisé de chiffres scouter.
- Sources :
  - Daizenshuu 7 : Dictionnaire de Dragon Ball (p. 82-83)
  - Manga DB Tomes 26-27
- Mots-clés : 150 millions, 150 000 000, 150m, goku 150 000 000, puissance goku namek, puissance de goku, puissance goku, puissance namek, goku namek, goku ssj namek, freezer 100%, freezer 100%, goku contre freeza, goku super saiyan namek, freeza 120 000 000, sentoryoku goku freeza, battle power namek
- Page du site : https://dragonballfr.com/wiki/canon?q=Puissance%20de%20Goku%20SSJ1%20sur%20Namek%20(150%20000%20000%20BP)

### Abandon des niveaux de puissance chiffrés (Scouters) après Namek

- Identifiant : `arret-scouter-namek-toriyama` · catégorie lore · rang `CANON_ABSOLU` · score 100
- Verdict : Décision délibérée d'Akira Toriyama : l'inflation des chiffres nuisait à la tension dramatique.
- Explication : Akira Toriyama a expliqué que le scouter servait d'artifice narratif pour que les guerriers de Freezer sous-estiment les Terriens capables de varier leur ki. Une fois l'éveil du Super Saiyan atteint à 150 000 000, des nombres encore plus colossaux auraient rendu les combats abstraits et prévisibles. L'auteur a donc stoppé les chiffres scouter après Namek pour préserver l'impact émotionnel et visuel.
- Citation : « Si la puissance des ennemis continuait à grimper simplement avec des nombres de plus en plus gigantesques, les lecteurs finiraient par perdre tout repère concret. » — Daizenshuu 6 & entretiens Akira Toriyama, 1995
- Sources :
  - Entretien Akira Toriyama (Daizenshuu 6)
  - Daizenshuu 7 (p. 82-83)
- Mots-clés : chiffres scouter, arret scouter, abandon scouter, pourquoi plus de chiffres, scouter apres namek, fin des scouters, scouters apres namek
- Page du site : https://dragonballfr.com/wiki/canon?q=Abandon%20des%20niveaux%20de%20puissance%20chiffr%C3%A9s%20(Scouters)%20apr%C3%A8s%20Namek

### Beerus, Whis et la hiérarchie divine

- Identifiant : `beerus-whis` · catégorie character · rang `CANON_SUPERVISE` · score 98
- Verdict : Canonique. Entièrement imaginés, nommés et dessinés par Akira Toriyama pour Battle of Gods (2013).
- Explication : Initialement ébauché comme un monstre reptilien infectieux par le premier scénariste de Battle of Gods, Toriyama a intégralement repris le projet en s'inspirant de son propre chat de race Cornish Rex pour Beerus, et a inventé son maître martial Whis. Prédit par la prophétie du Poisson Oracle, le réveil de Beerus après 39 ans de sommeil marque le point de départ de la trame moderne de Dragon Ball à la recherche du Super Saiyan God.
- Citation : « Beerus est inspiré de mon chat de quatorze ans, un Cornish Rex. Whis, lui, a été créé pour être son acolyte encore plus fort et mystérieux. Leurs noms viennent de boissons alcoolisées (Beer et Whisky). » — Entretien Akira Toriyama (Chōzenshū 1, 2013), 2013
- Sources :
  - Film Battle of Gods (2013)
  - Chōzenshū 1
  - Manga Dragon Ball Super
- Mots-clés : beerus, whis, dieu de la destruction, ange whis, bills, zeno, grand pretre, daishinkan, beerus dort, beerus dort 39 ans, sommeil de beerus, 39 ans de sommeil, poisson oracle, reveil de beerus, 39 ans
- Page du site : https://dragonballfr.com/wiki/canon?q=Beerus%2C%20Whis%20et%20la%20hi%C3%A9rarchie%20divine

### Super Saiyan God & Super Saiyan Blue (SSGSS)

- Identifiant : `super-saiyan-god-blue` · catégorie form · rang `CANON_SUPERVISE` · score 95
- Verdict : Canon supervisé. Concepts et charadesigns créés par Akira Toriyama.
- Explication : Toriyama a rejeté le design initial musclé et capé proposé par la Toei pour le Super Saiyan God, choisissant une silhouette affinée aux cheveux magenta. Il a ensuite créé le Super Saiyan Blue (Super Saiyan God Super Saiyan) pour le film La Résurrection de 'F' (2015) en expliquant qu'il s'agit de la puissance d'un dieu insufflée dans un Super Saiyan avec un esprit calme et maîtrisé.
- Sources :
  - Film Battle of Gods (2013)
  - Film La Résurrection de 'F' (2015)
  - Manga DBS
- Mots-clés : super saiyan god, super saiyan blue, ssgss, ssjg, ssj god, ssj blue, god saiyan, cheveux rouges goku, cheveux bleus goku, rituel saiyan god, forme divine
- Page du site : https://dragonballfr.com/wiki/canon?q=Super%20Saiyan%20God%20%26%20Super%20Saiyan%20Blue%20(SSGSS)

### Son Gohan Beast & Orange Piccolo

- Identifiant : `beast-gohan-orange-piccolo` · catégorie form · rang `CANON_SUPERVISE` · score 98
- Verdict : Canonique. Formes créées, nommées et dessinées personnellement par Akira Toriyama pour Super Hero (2022).
- Explication : Akira Toriyama a écrit le film Dragon Ball Super: Super Hero en plaçant Piccolo et Gohan au premier plan. Il a dessiné Orange Piccolo en hommage à son personnage favori pour lui redonner un niveau équivalent à celui de Son Goku et Vegeta, et a créé Gohan Beast en s'inspirant de l'éveil du jeune Gohan contre Cell.
- Citation : « Je suis tellement heureux que Piccolo ait enfin obtenu une puissance équivalente à celle de Goku et des autres. Quant à Gohan Beast, son nom vient du fait que la bête sauvage en lui s'est enfin réveillée. » — Interview d'Akira Toriyama — Sortie de Dragon Ball Super: Super Hero, 2022
- Sources :
  - Film Dragon Ball Super: Super Hero (2022)
  - Manga Dragon Ball Super (Arc Super Hero, Chapitres 96-103)
- Mots-clés : beast gohan, gohan beast, orange piccolo, piccolo orange, nouvelle forme gohan, super hero formes
- Page du site : https://dragonballfr.com/wiki/canon?q=Son%20Gohan%20Beast%20%26%20Orange%20Piccolo

### Zalama & les Super Dragon Balls

- Identifiant : `zalama-super-dragon-balls` · catégorie lore · rang `CANON_SUPERVISE` · score 92
- Verdict : Canon supervisé. Introduit dans Dragon Ball Super par Akira Toriyama.
- Explication : Lord Zuno explique que le Dieu Dragon Zalama a forgé les Super Dragon Balls, des sphères dorées de la taille d'une planète capables d'exaucer absolument n'importe quel vœu sans aucune restriction. Toriyama a personnellement écrit le rituel en langage des dieux (Chant des Dieux) pour invoquer Super Shenron.
- Sources :
  - Manga Dragon Ball Super Tome 1 (Chapitres 6-7)
  - Série DBS Arc Univers 6
- Mots-clés : zalama, zarama, dieu dragon zalama, super dragon balls, super shenron, boules de cristal geantes
- Page du site : https://dragonballfr.com/wiki/canon?q=Zalama%20%26%20les%20Super%20Dragon%20Balls

### Uub (Oob) & le Ki Divin du Grand Kaïoshin

- Identifiant : `uub-oob` · catégorie character · rang `CANON_ABSOLU` · score 100
- Verdict : 100% Canon absolu. Créé par Toriyama pour la fin du manga original et enrichi dans DBS.
- Explication : Uub est la réincarnation humaine du Majin Boo originel (Kid Boo), née du souhait pur exprimé par Son Goku avant de l'achever avec le Genkidama (Chapitre 516). Toriyama a consacré la conclusion de son manga (Chapitres 518-519) à la rencontre et au départ de Son Goku pour entraîner Uub. Dans Dragon Ball Super (Chapitre 66), Toyotaro et Toriyama confirment que, réincarnation de Kid Boo, Uub a également hérité du prodigieux Ki Divin du Grand Kaïoshin absorbé cinq millions d'années plus tôt.
- Sources :
  - Manga Dragon Ball Tome 42 (Chapitres 516-519)
  - Manga Dragon Ball Super Tome 15 (Chapitre 66)
- Mots-clés : uub, oob, reincarnation de buu, reincarnation de boo, ki divin uub, uub moro, chapitre 519 uub
- Page du site : https://dragonballfr.com/wiki/canon?q=Uub%20(Oob)%20%26%20le%20Ki%20Divin%20du%20Grand%20Ka%C3%AFoshin

### C-21 & Vomi (Épouse du Dr Gero)

- Identifiant : `c21-vomi` · catégorie lore · rang `CANON_SUPERVISE` · score 85
- Verdict : Le personnage de Vomi est canonique (Super Hero) ; le scénario de FighterZ est non-canonique.
- Explication : C-21 a été créée par Akira Toriyama pour le jeu vidéo Dragon Ball FighterZ (2018). Toriyama a révélé qu'elle était modelée sur l'épouse humaine du Dr Gero, nommée Vomi. Dans le film Dragon Ball Super: Super Hero (2022), Toriyama a officiellement canonisé l'existence de Vomi en l'intégrant dans l'arbre généalogique officiel de la famille du Dr Gero et du Dr Hedo.
- Sources :
  - Dragon Ball FighterZ (2018)
  - Film Dragon Ball Super: Super Hero (2022)
  - V-Jump Janvier 2018
- Mots-clés : c21, c-21, vomi, femme du docteur gero, dr gero femme, fighterz c21
- Page du site : https://dragonballfr.com/wiki/canon?q=C-21%20%26%20Vomi%20(%C3%89pouse%20du%20Dr%20Gero)

### Super Dragon Ball Heroes (SDBH) & Xenoverse

- Identifiant : `sdbh-heroes` · catégorie work · rang `NON_CANON_DERIVE` · score 10
- Verdict : Non-canonique. Jeux d'arcade et anime promotionnel dérivés.
- Explication : Conçus par Dimps et Bandai Namco avec Toei Animation pour promouvoir le jeu de cartes d'arcade au Japon. Bien que Toriyama ait validé certains charadesigns originaux (comme le Trunks en manteau de la Patrouille du Temps dans Dragon Ball Online), les fusions impossibles (Vegetto SSJ4, Bardock SSJ4, etc.) et les arcs temporels de Heroes sont hors de la continuité canonique.
- Sources :
  - Super Dragon Ball Heroes Official Website
- Mots-clés : sdbh, super dragon ball heroes, heroes, xenoverse, patrouille du temps, time patrol, trunks xeno, goku xeno, fu, hearts, cumber
- Page du site : https://dragonballfr.com/wiki/canon?q=Super%20Dragon%20Ball%20Heroes%20(SDBH)%20%26%20Xenoverse

### Dragon Ball Multiverse (DBM)

- Identifiant : `dbm-multiverse` · catégorie myth · rang `APOCRYPHE_FANON` · score 0
- Verdict : 100% Apocryphe & Fanon. Webcomic amateur créé par Salagir et des fans français.
- Explication : Créé par Salagir et illustré à l'origine par Gogeta Jr à partir de 2008. Il s'agit de la bande dessinée de fans la plus célèbre au monde, mais elle n'a aucun lien contractuel, éditorial ou légal avec Akira Toriyama, Shueisha ou Bird Studio.
- Sources :
  - Site officiel Dragon Ball Multiverse (Fanon)
  - Documentation des œuvres de fans
- Mots-clés : dbm, dragon ball multiverse, salagir, gogeta jr, univers 16, univers 18, bra ssj2 multiverse, gast carcolh
- Page du site : https://dragonballfr.com/wiki/canon?q=Dragon%20Ball%20Multiverse%20(DBM)

### Fillers de l'anime (Garlic Jr, Paikuhan, Gregory, Maron)

- Identifiant : `fillers-anime-garlic-paikuhan` · catégorie work · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canonique. Épisodes produits par Toei Animation pour ne pas rattraper le manga.
- Explication : Des arcs entiers (Garlic Jr), des tournois (l'Autre Monde avec Paikuhan) et des personnages secondaires (le grillon Gregory chez Kaio, l'ex-petite amie de Krilin Maron) ont été inventés par les scénaristes de Toei Animation pour meubler le temps d'antenne hebdomadaire. Ils n'apparaissent jamais dans le manga original de Toriyama.
- Sources :
  - Manga Dragon Ball (Tomes 1 à 42)
  - Daizenshuu 6 (Anime)
- Mots-clés : garlic jr, paikuhan, pikkon, gregory, maron, fausse namek, permis de conduire goku, tournoi de l'autre monde, tournoi des enfers, filler anime
- Page du site : https://dragonballfr.com/wiki/canon?q=Fillers%20de%20l'anime%20(Garlic%20Jr%2C%20Paikuhan%2C%20Gregory%2C%20Maron)

### Gregory (Le grillon de Kaïo)

- Identifiant : `gregory-kaio` · catégorie character · rang `NON_CANON_DERIVE` · score 20
- Verdict : Non-canonique au manga original. Personnage filler conçu pour l'anime Toei.
- Explication : Le grillon Gregory n'apparaît dans aucune case des 42 tomes du manga original d'Akira Toriyama : sur la planète de Kaïo, seul le singe Bubbles accompagne le maître des lieux. C'est le staff de l'anime Toei qui a demandé un second compagnon pour allonger et combler l'entraînement humoristique de Goku. Akira Toriyama a dessiné son design pour faire plaisir au studio, mais ne l'a jamais inclus dans son manga.
- Sources :
  - Manga Dragon Ball (Tomes 18-19)
  - Daizenshuu 5 & 6 (Anime)
- Mots-clés : gregory, grillon gregory, gregory kaio, gregory est-il dans le manga, gregory manga, gregory canon
- Page du site : https://dragonballfr.com/wiki/canon?q=Gregory%20(Le%20grillon%20de%20Ka%C3%AFo)
