<!-- SPDX-License-Identifier: Apache-2.0 -->

# Illustrations des techniques

Les WebP sont des cases du manga extraites de DBFC, la colorisation française
du lecteur DBFR. Ce n'est pas présenté comme l'édition couleur officielle
Shueisha. Les SVG sont des **interprétations vectorielles dessinées
manuellement** des formes observées, avec les couleurs mesurées dans ces pages.
Ils ne sont ni des images de jeu, ni des portraits réattribués à une attaque,
ni des scans encapsulés dans un SVG, ni une vectorisation automatique du trait
de Toriyama.

`references.json` fixe pour chaque scène l'URL de lecture, l'image originale,
son empreinte SHA-256, ses dimensions et le rectangle exact de découpe
`[gauche, haut, largeur, hauteur]`. Le générateur vérifie l'empreinte avant de
découper. Les références complètes et les rendus de contrôle restent dans
`var/reports/technique-color-crossmatch-20261028/` et
`var/reports/technique-media-followup-20261028/`, hors de Git. Quarante scènes
sont qualifiées : 31 pages couleur vérifiées visuellement comme les mêmes scènes
que les références manga précédentes et 9 scènes supplémentaires nommées ou
reconnaissables dans la page. Les 40 fichiers source ont été revalidés par SHA-256.

## Géométrie et mesures

Chaque source a été ouverte visuellement avant la sélection. Les découpes sont
mesurées en pixels du scan original ; le générateur réduit leur largeur à
768 pixels au maximum en conservant leurs proportions. Le lecteur doit employer
`object-fit: contain` pour montrer le geste et le projectile entier.

L'icône a un repère carré de 96 unités. Les couleurs principales et secondaires
viennent des sujets mesurés dans la page couleur ; le fond bleu nuit et le
contour sombre sont des choix de contraste. Les traits secondaires de 2,5
unités sont un épaississement délibéré pour 28 pixels, la taille du badge du
catalogue. Les repères suivants décrivent les décisions de simplification ; ils
ne sont pas des mesures automatiques de toute l'encre du scan.

| Technique         | Référence manga | Forme observée et adaptation dans le repère de 96 unités                                                                                                                                                   |
| ----------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kamehameha        | tome 2, p. 13   | Masse d'énergie élargie, reliée au faisceau étroit ; noyau entre x47 et x88, faisceau horizontal entre x8 et x47. Rotation vers la droite pour la lecture de l'icône.                                      |
| Genkidama         | tome 18, p. 81  | Petit projectile rond lancé depuis la paume ; cercle de rayon 22 et traits de rayonnement séparés. La scène comporte une boule petite, pas le Genkidama géant de Namek.                                    |
| Kienzan           | tome 19, p. 41  | Disque très aplati au-dessus de Krilin ; ellipse 76 × 14,6, arcs de rotation séparés. La frange d'encre du scan est condensée en deux arcs lisibles.                                                       |
| Makankosappo      | tome 17, p. 110 | Rayon axial et trois spires principales visibles dans la case ; axe diagonal et trois boucles dégagées. La réduction conserve le principe hélicoïdal, pas chaque hachure.                                  |
| Final Flash       | tome 32, p. 133 | Éventail d'énergie des deux mains de Vegeta vers Cell ; silhouette évasée diagonale, deux stries noires. L'onomatopée est retirée de l'icône.                                                              |
| Shin Kikoho       | tome 31, p. 136 | Deux mains jointes formant une ouverture géométrique ; ouverture 28 × 36 et poignets séparés. Cette icône montre le geste de visée, pas un projectile inventé.                                             |
| Morsure du soleil | tome 11, p. 6   | Visage central de Tenshinhan et émission radiale ; tête blanche, trois repères faciaux et rayons. Aucun portrait complet n'est inventé.                                                                    |
| Big bang          | tome 29, p. 45  | Projectile compact relié à une traînée ; noyau décentré vers x65 et queue diagonale. Distinct de la boule sans traînée du Genkidama.                                                                       |
| Kikoho            | tome 11, p. 142 | Ouverture des mains cadrant le ring ; losange intérieur 40 × 38. La variante plus large suit la vue rapprochée du premier Kikoho.                                                                          |
| Mafuba            | tome 12, p. 175 | Vortex qui attire Piccolo ; spirale elliptique et cône resserré. La spirale constitue la silhouette de la technique ; le personnage n'est pas redessiné.                                                   |
| Dodompa           | tome 10, p. 125 | Rayon rectiligne du doigt de Chaozu ; axe très fin et pointe élargie. Le départ du rayon, la traînée et la pointe restent séparés à 28 pixels.                                                             |
| Kaioken           | tome 19, p. 120 | Enveloppe d'énergie pointue autour de Goku pendant son accélération contre Nappa ; contour en flamme. La flèche interne est un symbole éditorial d'amplification, pas un élément extrait du manga.         |
| Téléportation     | tome 28, p. 100 | Index et majeur près du front pendant le repérage de l'aura ; deux doigts levés et stries latérales. Les stries indiquent le déplacement pour l'icône ; la scène retenue représente la préparation nommée. |

## Second lot : neuf scènes supplémentaires

| Technique            | Référence manga | Forme observée et adaptation dans le repère de 96 unités                                                                                                                                                                                |
| -------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canon Garric         | tome 20, p. 10  | Faisceau de Vegeta lancé des deux mains ; noyau ovale et deux stries axiales. La diagonale de la scène est conservée, tournée pour la lecture de l'icône.                                                                               |
| Masenko              | tome 19, p. 71  | Gohan projette une colonne d'énergie après la préparation explicitement nommée p. 70 ; colonne diagonale étroite et pointe resserrée.                                                                                                   |
| Beignets galactiques | tome 41, p. 61  | Anneau creux qui descend autour de Boo ; ellipse extérieure 70 × 34 et trou 50 × 18. Les arcs séparés indiquent la rotation observée.                                                                                                   |
| Kamehameha téléporté | tome 34, p. 51  | Apparition de Goku juste devant Cell, mains en position de tir ; la page 52 inspectée montre le tir. L'icône combine la boule du Kamehameha et une traînée discontinue : la discontinuité est un symbole éditorial du déplacement.      |
| Super Kamehameha     | tome 16, p. 33  | Illustration du chapitre 185 qui nomme le Super Kamehameha et montre Goku avec les mains en coupe. Deux contours autour d'un espace central vide figurent le geste de charge ; cette image ne prétend pas montrer le tir achevé.        |
| Sokidan              | tome 15, p. 71  | Boule suspendue au-dessus de la paume de Yamcha et projectile lancé dans la case suivante ; cercle de rayon 20, trois rayons courts. La flèche courbe est un repère éditorial de guidage, pas un trait extrait du manga.                |
| Attaque volley-ball  | tome 11, p. 80  | Haikyuken nommé sur la page ; mains jointes de Tenshinhan renvoyant Goku en l'air. La manchette devient un contour plein, et la petite figure envoyée en l'air un point de repère ; il ne s'agit pas d'un ballon présent dans la scène. |
| Technique du loup    | tome 1, p. 173  | Enchaînement de Yamcha annoncé comme Roga Fufu Ken sur la page 172 inspectée ; main ouverte de frappe et doigts séparés. La main est simplifiée, sans inventer un loup spectral absent de cette case.                                   |
| Image rémanente      | tome 4, p. 115  | Silhouette de Goku brouillée par les stries pendant le combat contre Jackie Chun ; trois silhouettes schématiques décalées de 19–20 unités représentent la rémanence. Les gris sont un choix de lisibilité monochrome.                  |

## Troisième lot : neuf scènes supplémentaires

| Technique                | Référence manga | Mesure et choix d'icône dans le repère de 96 unités                                                                                                                                                                                                     |
| ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Super fantômes kamikazes | tome 41, p. 69  | La page nomme Super Ghost Kamikazé Attack. Le fantôme possède des cheveux dressés et une queue courbe ; contour de 68 × 76 unités et visage réduit à trois traits. Le poing et les plis sont supprimés pour le badge.                                   |
| Explosion finale         | tome 39, p. 103 | Vegeta au centre d'une décharge très grande, bras écartés ; enveloppe pointue de 80 × 82 unités et personnage réduit à un cercle de rayon 6 et cinq segments. Les proportions du personnage sont volontairement agrandies.                              |
| Grenade infernale        | tome 31, p. 43  | C-17 entouré des sphères de Piccolo ; sept cercles de rayon 6 ou 9 entourent un pentagone schématique. Les quatre segments internes symbolisent la convergence ; le pentagone remplace la cible, sans prétendre dessiner son portrait.                  |
| Kamehameha père-fils     | tome 35, p. 109 | Gohan tire d'une main, Goku apparaît derrière lui. La découpe garde les deux figures et les mains. Le faisceau blanc mesure environ 79 × 52 unités ; deux petits signes ramifiés représentent schématiquement les deux participants.                    |
| Boule de la Mort         | tome 26, p. 155 | Petite sphère noire irrégulière au-dessus de l'index de Freezer, pendant le duel contre le Genkidama. Le noyau est noir de rayon 16, la bordure blanche mesure environ 56 × 51. Le doigt reste séparé de 8 unités. Ce n'est pas une image de Supernova. |
| Super Vegeta             | tome 32, p. 47  | Autodésignation explicite dans la case. Cheveux dressés et implantation en V, visage de 42 × 30 unités ; épaules réduites à deux traits. Cette image représente bien la forme nommée, pas un portrait de base réutilisé.                                |
| Super Saiyen             | tome 27, p. 27  | Goku se nomme Super Saiyan dans la case ; cheveux clairs dressés, contour asymétrique de 75 × 44 unités. Le visage est simplifié ; aucun jaune n'est inventé pour une source monochrome.                                                                |
| Super Saiyen 2           | tome 34, p. 155 | Gohan transformé face à Cell, aura et cheveux dressés. Contour des cheveux de 73 × 43 unités ; deux marques latérales anguleuses sont une convention éditoriale de l'aura, et non deux éclairs précisément relevés sur cette page.                      |
| Super Saiyen 3           | tome 42, p. 93  | Goku en SSJ3, longue chevelure dans l'aura ; contour de 67 × 80 unités qui descend sous le visage. La page 91, inspectée puis rejetée, montrait Goku aux cheveux courts parlant de la forme.                                                            |

La carte du fantôme correspond uniquement au slug `super-fantomes-kamikazes`.
La proximité du nom d'une autre compétence du catalogue ne suffit pas à lui attribuer cette scène.

## Reproduire

```powershell
bun packages/ui/assets/techniques/generate.ts
bun plugin/skills/toriyama-svg/scripts/rendu.ts packages/ui/assets/techniques/kienzan.svg --tailles 512 128 64 32 28 16 --sortie var/reports/technique-media-20261026/render-kienzan
```

La primitive maintenue `radialSpeedlines` vient de
`packages/ui/src/toriyama-svg/geometry.ts`. Aucune copie de moteur n'est ajoutée.
Le générateur produit des fichiers stables à partir des sources épinglées.

Qualification du 26 octobre 2026 : les 31 découpes et les 62 planches PNG
clair/sombre ont été ouvertes. Le rendu emploie réellement le moteur WebView
Chrome de Bun à 512, 128, 64, 32, 28 et 16 pixels, puis agrandit les petites
tailles au plus proche voisin pour le contrôle. Les silhouettes restent
distinctes à 28 pixels ; à 16 pixels les traits du visage solaire et de la main
de téléportation se simplifient. Cette taille n'est pas celle du badge livré.

Les 31 scènes ne couvrent pas toutes les techniques du catalogue. Une absence du
manifeste signifie « média pas encore vérifié », sans substitution par un portrait.
La qualification locale ne prouve pas que ces nouveaux fichiers sont déjà servis
par le déploiement public.
