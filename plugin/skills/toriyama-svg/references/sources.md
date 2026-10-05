# Où trouver des références, et lesquelles croire

Le but de cette page : ne jamais dessiner de mémoire. Les souvenirs
d'entraînement sur Dragon Ball sont fréquemment faux (couleurs, nombre de
mèches, forme d'une technique), et un dessin fondé dessus a l'air « presque
juste », ce qui est pire qu'un dessin franchement différent.

## Hiérarchie des sources

1. **Le manga au trait** — la seule source où la FORME est de la main de
   Toriyama. C'est elle qui tranche les silhouettes, le nombre de mèches, le
   motif d'un nuage, la construction d'un œil.
2. **Le manga en couleur (éditions couleur, jaquettes, artbooks)** — tranche la
   COULEUR, en gardant en tête que la colorisation d'une édition n'est pas
   forcément de Toriyama. Le dire quand c'est le cas.
3. **Les databooks et guides officiels** — utiles pour les graphies japonaises,
   les noms, parfois des vues d'ensemble. Ils se contredisent : le
   _Super Exciting Guide_ montre un Kinto-Un bleu là où le manga couleur le
   donne jaune. Une contradiction se signale, elle ne se tranche pas en douce.
4. **Les cels et captures d'anime (Toei)** — dernier recours pour la forme. Le
   studio simplifie systématiquement : il supprime le trait d'encre interne,
   arrondit les motifs, désature les ombres. Utile pour les aplats, trompeur
   pour la silhouette.
5. **Les captures d'épisode compressées** — presque toujours inutilisables en
   colorimétrie. Mesuré sur une capture SD : teinte décalée de 14° vers
   l'orange, écart lumière/ombre réduit de 0,16 à 0,09 en clarté OKLab. Si
   c'est la seule source disponible, le dire dans les mesures.

**Fandom est banni** en rédaction comme en référence visuelle, doctrine du
dépôt. Les images y sont recompressées, recadrées et souvent redessinées par
des tiers.

## Où chercher

Hors ligne, les seules références sont les images fournies par la demande et les
mesures déjà embarquées ([Kinto-Un](mesures/kinto-un-analyse-visuelle.md),
[couverture et Dragon Ball](mesures/couverture-analyse-visuelle.md)). Ne pas
dessiner sans l'une ou l'autre : le dire.

Avec le dépôt Shenron (mainteneurs), le corpus auto-hébergé est sous
`apps/bot/assets/manga/DB/regular/vol<N>/<planche>.webp` (trait),
`apps/bot/assets/manga/DB/fullcolor/<arc>/t<N>/<planche>.webp` (couleur) et
`apps/site/public/databooks/<uuid>.jpg` (databooks). Si les sources vivantes
répondent, `dragonball_manga_search`, `dragonball_manga_page`,
`dragonball_databooks_search` et `dragonball_databooks_plates` (ou le RAG)
retrouvent une planche par une réplique, puisqu'ils indexent le texte des planches.

## Récupérer une image extérieure (si le réseau est disponible)

Beaucoup de sites renvoient un 403 aux outils de récupération de page mais
laissent passer `curl` avec un en-tête de navigateur :

```bash
curl -sSL -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" \
  -o /tmp/ref/image.webp "https://exemple/image.webp"
```

Travailler dans `/tmp/<sujet>/`, jamais dans le dépôt : les images de référence
sont du matériel de travail, pas des livrables. Ce qui entre dans le dépôt,
c'est le SVG produit et le document de mesures.

## Ce qu'on note d'une source

Pour chaque image retenue, consigner : l'URL ou le chemin, les dimensions, le
poids, et **ce qu'elle vaut** — pourquoi on la retient ou pourquoi on l'écarte.
Une source écartée avec sa raison vaut mieux qu'une source silencieusement
ignorée : c'est ce qui permet à la revue suivante de ne pas refaire le chemin.
