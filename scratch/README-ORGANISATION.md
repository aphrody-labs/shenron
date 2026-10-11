# Guide d'Organisation & Cartographie — Base de Données Dragon Ball

Ce document récapitule l'architecture intégrale du dossier **`goku solo test`**, entièrement trié, indexé par analyse visuelle et OCR, et débarrassé de tout fichier orphelin ou dossier temporaire.

**Statut du tri :** 100% Terminé
**Volume global :** 8 421 fichiers classés avec rigueur documentaire
**Fichiers résiduels ou non triés :** 0 (Tous les dossiers temporaires `jsp` et `a trier` ont été absorbés et supprimés)

---

## Architecture des 4 Piliers Fondamentaux

```text
goku solo test/
├── 1 DragonWorld/           # Lore, Canonicité, Cosmologie, Règles & Ki (1 174 fichiers)
├── 2 Force calcul/          # Scaling, Exploits, Calculs & Puissances par Saga (4 488 fichiers)
├── 3 Capacité et autre/     # Capacités spéciales, Hax, Techniques & Métaphysique (480 fichiers)
└── 4 Debunk/                # Réfutations, Débats critiques & Traduction (2 279 fichiers)
```

---

## 1. `1 DragonWorld` — Le Monde de Dragon Ball et ses Règles

Ce dossier rassemble l'ensemble des fondements doctrinaux, cosmologiques et physiologiques de l'œuvre d'Akira Toriyama :

- **`Canon/`** : Traçabilité des continuités et degrés d'implication de l'auteur :
  - `Canon DBZ-S` : Continuité principale manga originale et Dragon Ball Super.
  - `Canon Daima` : Éléments canoniques introduits par Toriyama dans Dragon Ball Daima.
  - `Canon Film` : Statut des films (de la période 1986-1995 aux films modernes supervisés).
  - `Canon GT` : Statut officiel dérivé de Dragon Ball GT (continuation animée Shueisha, timelines, guides).
  - `Canon DrSlump` & `Canon Jaco` & `Canon NekoM` : Œuvres croisées partageant l'univers de Toriyama.
  - `Canon Jeu` : Apports de Dragon Ball Online, DBZ Kakarot et adaptations supervisées.
  - `toriyama implication` : Déclarations, interviews et notes de travail attestées de l'auteur.
  - `Debunk Canon` : Clarifications sur les rétropédalages (*retcons*) et idées reçues.
- **`Chronologie/`** : Ligne temporelle universelle des Âges (calendrier *Age* de la Shueisha, naissances, guerres, ères).
- **`Cosmos/`** : Cartographie tridimensionnelle du Macrocosme de l'Univers 7 et des dimensions :
  - `Macrocosm Map` : Structure sphérique universelle issue du *Daizenshuu 4*.
  - `L'univers` : Espace matériel mortel, galaxies et planètes.
  - `L'autre monde` : Royaume des Morts (*Anoyo*), Enma Daiō, Paradis, Enfer, Planètes Kaioh.
  - `Monde des Kaioshin` : Domaine sacré des Dieux de la Création gravitant hors du Macrocosme.
  - `Monde des Démons` : Le Makai et ses royaumes occultes inférieurs.
  - `Salle de l'esprit et du temps` : Propriétés physiques et temporelles de la Rosat.
  - `TDP map` : Arène du Monde du Néant lors du Tournoi du Pouvoir.
  - `Dimension Broly Gogeta`, `DeadZone`, `Sugoroku Space`, `arale toribot`, `koyama tweet`.
- **`Ki Fonctionnement/`** : Les règles biomécaniques et spirituelles de l'énergie :
  - `Les composants du ki` : La composition tripartite révélée par Toriyama (*Genki*, *Yūki*, *Shōki*).
  - `Devenir plus fort` : Physiologie de dépassement des limites et entraînement.
  - `Cyborg` : Modèles à énergie infinie (C-17, C-18) vs énergie absorbée (C-19, C-20).
  - `Pour gagner` : Stratégies martiales et gestion des réserves vitales.

---

## 2. `2 Force calcul` — Puissances, Exploits et Scaling par Saga

Ce dossier ordonne l'ensemble des preuves de puissance, calculs de destructions d'astres et comparaisons martiales chronologiques :

- **`1 Saga OG Puissance`** : De la quête initiale des Dragon Balls au 23e Tenkaichi Budokai (Kame Sennin détruisant la lune, Taopaipai, Piccolo Daimaō).
- **`2 Saga Freezer Puissance`** : Arrivée des Saiyans, entraînement sous gravité, Namek, Commando Ginyu, Freezer et le cap du Super Saiyan à 150 000 000 BP.
- **`3 Saga Cell Puissance`** : Menace des Cyborgs, C-16, Cell sous ses trois formes, Super Saiyan Grade 2 / Grade 3, Full Power et Gohan SSJ2.
- **`4 Saga Buu Puissance`** : Échelle complète de la saga Buu (Majin Vegeta, Goku SSJ3, Gotenks SSJ3, Gohan Ultime, Super Buu, Buutenks, Buuhan, Kid Buu).
- **`5 Saga Super Puissance`** : Ère divine moderne :
  - `Goku Files` : Formes divines (SSJG, SSJB, Beyond God, MUI, Chōjigen / Super-dimensionnel, trou noir, exploits de force).
  - `Broly Files` : Broly Berserk, contrôle de la puissance Oozaru en forme humaine, SSJ Full Power.
  - `Freezer files` : Résurrection de 'F', Golden Freezer, Black Freezer.
  - `Jiren files` : Jiren sérieux, absorption du Genkidama, supériorité sur les Dieux de la Destruction.
  - `Zamasu files` : Goku Black, Zenkai continus, Fused Zamasu, corruption dimensionnelle.
  - `Zeno files` : Effacement d'univers et de lignes temporelles entières.
  - `Trunks files` & `Kefla files`.
- **`6 Saga GT Puissance`** : Scaling de Dragon Ball GT (Goku enfant / SSJ4, Baby, Super 17, Rilder, Majuub, Omega Shenron, Gogeta SSJ4, seuil "dizaines de fois" du *GT Perfect File*).
- **`7 Saga Film Puissance`** : Exploits des films Toei 1986-1995 (Broly 1993, Bojack, Janemba, Hildegarn, Hatchiyack).
- **`8 Saga Daima`** : Évaluations de puissance des combattants régressés en enfants, du Roi Démon Gomah, de Glorio et des Tamagami.
- **`9 Xenoverse & SDBH`** : Scaling transcendant de Super Dragon Ball Heroes et Xenoverse (Demigra, Dark Ki, Chronoa, Tokitoki, parchemins de l'éternité).
- **`10 Jump Force & GodFusion`** : Exploits cross-média et formes transcendantes (Goku God Fusion 4D, Jump Force).
- **`force`** & **`règles de la force`** : Guides généraux de Battle Power et règles officielles de calcul.

---

## 3. `3 Capacité et autre` — Arsenal des Techniques, Hax et Capacités

Ce dossier répertorie l'ensemble des pouvoirs spéciaux, métaphysiques ou dimensionnels manifestés dans l'œuvre :

- **`Ultra Instinct`** : Biomécanique des réflexes autonomes, état d'esprit calme, corps renforcé, paliers d'évolution (Sign / MUI / TUI).
- **`Hakkai`** : Fonctionnement de l'énergie de destruction divine, effacement physique et spirituel, Hakai de Goku sur Zamasu.
- **`barrière d'énergie`** : Propriétés défensives des barrières de Ki (C-17, Cell, barrière de Vegetto contre l'absorption de Buu).
- **`respirer dans l'espace`** : Faits et contraintes physiologiques sur la survie des Saiyans dans le vide cosmique.
- **`Outer`** : Arguments et analyses conceptuelles sur les dimensions supérieures et le statut transcendant.
- **`Déplacement instantané`** : *Shunkan Idō* de Yardrat, ciblage de signature énergétique et franchissement transdimensionnel.
- **`Potentiel`** : Évolution sans plafond biologique des Saiyans (*aucune limite*, adaptation en plein combat au TDP).
- **`4ème mur`** : Ruptures du quatrième mur à travers le manga, l'anime, les jeux vidéo et les apparitions télévisées.
- **`ToonForce`** : Intégration de la physique humoristique et de la logique de gag (Arale Norimaki, Dr Slump).
- **`Absorbtion`** & **`regen`** : Mécanismes d'assimilation corporelle et régénération cellulaire (Nameks, Cell, Majin Buu).
- **`clonage`**, **`télépathie`**, **`telekinésie`**, **`Sentir les autres et ce qu'il se passe`**, **`Sentir les intentions`**.
- **`kamehameha`**, **`susano`** (avatar géant de Ki), **`Plot Armor`**, **`mort mais vivant`** (réanimation cardiaque de Goku).

---

## 4. `4 Debunk` — Réfutations Doctrinales, Débats et Corrections de Traduction

Ce dossier regroupe toutes les preuves contradictoires démontant les fausses croyances, les mauvaises traductions et les mythes de débats :

- **`Mauvaise Trad + falacieux`** : Scans et explications des erreurs de traduction courantes (ex. contresens sur *jigen o koeta* pour Beerus interprété à tort comme "dimensionnel", mauvaises versions anglaises).
- **`Crossverse et Matchups`** : Déconstruction des débats "Goku Solo" face à d'autres licences (Anos Voldigoad, Sung Jinwoo, Yogiri Takatou, Madoka, etc.).
- **`opm debunk`** : Débats et analyses comparatives sur Saitama / One Punch Man vs Dragon Ball.
- **`Vegetto Gogeta`** : Traitement exhaustif de la confrontation Potalas vs Métamol (règles de durée, bonus de rivalité, multiplicateurs officiels du SEG).
- **`Ki divin`** & **`beerus ment`** : Analyse des mensonges stratégiques de Beerus (ex. sur Monaka) et spécificités du Ki divin non détectable.
- **`dyspo vitesse`** : Réfutation des contresens sur la vitesse de la lumière de Dyspo (*Chō kōsoku*).
- **`laser lasseau`** : Explication de la bague laser de Sorbet perforant Goku en SSJ Blue (baisse de garde du Ki).
- **`cellule cell`** : Analyse du noyau régénérateur de Cell et des contradictions apparentes du manga.
- **`faiblesse siayan`** : Faiblesses biologiques saiyannes (virus cardiaque, vulnérabilité de la queue).
- **`Akira forget`** & **`delaisser l'entrainement`** & **`goku mentalité`**.
- **`Saga buu/`** : Le dossier de débat le plus exhaustif (34 sous-thématiques spécialisées) :
  - *KidBuu DataBook*, *KidBuu SSJ3*, *KidBuu VS Beerus*, *KidBuu Raison*, *KidBuu pas sérieux*.
  - *Buuhan SSJ3*, *debunk buutenks*, *Super Buu et KidBuu*, *Buu Intérieur*.
  - *Genkidama*, *Gohan Protagoniste*, *Gohan SSJ3*, *Gotenks SuperBuu Gohan*.
  - *Goku ment sur sa force*, *Goku numéro 1*, *Goku Retour*, *Goku DragonBalls*.
  - *Kaioshin Explication*, *Pouvoir Kaioshin*, *Cas de Koyama*, *Knock-Out*, *End Of Z*.
  - *Statement Z*, *Statement Super*, *Statement Daima*, *Statement GT*, *Statement Jeu*, *vsbattles_rules*.
- **`Debunk aleatoire`** : Archives de captures de débats, d'échanges communautaires et d'arguments secondaires.

---

*Indexation et certification établies par Shenron 🐉 le 8 Octobre 2026.*
