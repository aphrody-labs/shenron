# Inspection visuelle des tomes manga et frames d'animé

Ce guide détaille le protocole d'inspection visuelle multimodale permettant de convertir fidèlement des planches de tomes manga (tankōbon) ou des photogrammes d'animé (genga, dōga, celluloïds) en tracés vectoriels Toriyama mesurés, sans approximation ni décalquage générique (« AI slop »).

## 1. Inspection directe via l'outil d'image (`view_file`)

L'agent inspecte directement les scans haute résolution et les captures d'animé grâce à `view_file`. L'analyse visuelle relève systématiquement :

1. **La boîte englobante et l'axe de perspective** :
   - Coordonnées de la case (_koma_) ou du sujet principal dans la planche.
   - Ligne d'horizon et point de fuite de la composition (Toriyama utilise souvent des contre-plongées légères avec une perspective à 2 ou 3 points très accentuée).
2. **La silhouette et les points d'ancrage** :
   - Points de rupture angulaires (mâchoire, sourcils, coudes, plis de gi, pointes de mèches).
   - Rapport largeur / hauteur de la boîte réelle du sujet rogné.
3. **Le calibre du trait d'encre** :
   - Épaisseur mesurée du contour extérieur par rapport à la largeur totale (ratio 0,6 % à 0,9 % typique de Toriyama).
   - Dynamique du tracé à la plume G (_G-pen_) : attaque effilée, corps plein au centre de l'arc, sortie conique rapide.

## 2. Analyse des planches de tomes du manga (Tankōbon)

Le trait du manga imprimé constitue la **source primaire absolue pour la forme** (voir [sources](sources.md)).

### Caractéristiques fondamentales du trait Toriyama

- **Arcs tendus et lobes pincés** : Les contours organiques (muscles, nuages, mèches de cheveux) ne sont jamais de simples ellipses symétriques. Ce sont des arcs de cercle successifs reliés par des creux pincés (_cusps_). La flèche d'arc est systématiquement mesurée avant modélisation avec `arcs(points, fleches)`.
- **Mèches de cheveux pleines** : Chaque mèche est un polygone plein fermé (`meche(base, pointe, largeur, courbure)`), partant d'une base large, décrivant une courbe franche puis revenant en pointe aiguë. Jamais un contour filaire à trait d'épaisseur constante.
- **Équilibre d'encre (_Beta-nuri_)** : Les masses de noir pur (_beta_) ancrent la gravité du dessin (cheveux, ceintures, bottes, ombres profondes). Mesurer le ratio surfacique noir/blanc : sur une case d'action Toriyama, le noir solide occupe généralement 18 % à 32 % de la surface de la silhouette.
- **Trames mécaniques (_Screentones_) vs aplats** : Toriyama utilise les trames de manière parcimonieuse (points réguliers 40 à 60 lignes par pouce pour les demi-teintes du gi ou des décors, lignes de vitesse radiales _shūchūsen_ tracées à la règle pour les impacts). Ne pas simuler une trame par un dégradé flou : utiliser les motifs SVG géométriques dédiés (`toriyama-halftone`, `radialSpeedlines`).

## 3. Analyse des photogrammes et celluloïds d'animé (Toei)

L'animé fournit une référence précieuse pour les aplats chromatiques, mais introduit des simplifications de studio qu'il convient de corriger.

### Décomposition des couches de celluloïd (_Cel Shading_)

Dans l'animation Dragon Ball Z / Super, une surface corporelle ou vestimentaire se décompose en 3 ou 4 teintes discrètes rigides :

1. **Le rehaut lumineux (_Tsuya_ / ツヤ)** : Fine zone blanche ou très claire (ex. brillance sur les bottes, les muscles huilés ou l'aura).
2. **La teinte locale de base (_Jigami_ / 地紙)** : Aplat mat principal (ex. orange du gi `#e78220`, peau Saiyan `#f7dbad`).
3. **L'ombre de niveau 1 (_Kage-1_ / 影1)** : Ombre portée franche délimitée par une courbe nette, sans fondu. Mesurée et reproduite via `planDombre(contour, decalage, largeur)`.
4. **L'ombre profonde d'occlusion (_Kage-2_ / 影2)** : Présente dans les plis serrés, sous le menton ou entre les mèches.

### Corrections impératives lors de la vectorisation depuis l'animé

- **Restaurer les arêtes angulaires** : Les intervallistes de la Toei arrondissent souvent les pointes de mèches et les muscles pour faciliter l'animation intercalaire (_dōga_). Toujours redresser ces arrondis vers les angles vifs caractéristiques du manga au trait.
- **Éliminer la dérive colorimétrique vidéo** : La compression MPEG/H.264 et le sous-échantillonnage chroma YUV 4:2:0 estompent la saturation et décalent les teintes vers l'orange boueux. Toujours convertir la palette échantillonnée en espace OKLab et recaler les teintes sur les étalons mesurés de la charte Shenron (`tokens.color`).
- **Aura de Ki et traînées de vitesse (_Zanzōken_)** : Ne pas utiliser de flou gaussien SVG lourd et baveux. Préférer des bandes d'énergie superposées à opacité graduée et des contours en dents de scie mesurés.

## 4. Outil de mesure et d'extraction (`inspecter-manga-anime.ts`)

Pour extraire instantanément les métriques quantitatives d'une planche ou d'une frame :

```bash
# Analyse d'une case de manga (isolation d'encre, épaisseur de plume, ratio de noir)
bun scripts/inspecter-manga-anime.ts /chemin/tome-04-page-42.webp --mode manga --boite 120 340 580 890

# Analyse d'une frame d'animé (séparation des couches cel shading et palette OKLab)
bun scripts/inspecter-manga-anime.ts /chemin/goku-ssj-frame-1240.png --mode anime --k 4 --sortie /tmp/analyse-ssj
```

Le script produit un rapport JSON structuré :

- `boite` : coordonnées exactes et ratio d'aspect.
- `trait` : épaisseur médiane du trait d'encre en pixels et pourcentage du sujet.
- `couchesCel` : liste ordonnée des couleurs discrètes avec coordonnées RGB, OKLCH, luminance et surface relative.
- `betaRatio` : pourcentage de remplissage en noir plein.
- `recommandationGeometrie` : paramètres suggérés pour `arcs`, `meche` et `planDombre`.

## 5. Synthèse et livraison

Tout asset vectoriel issu d'un tome ou d'une frame doit être accompagné de son fichier d'analyse visuelle dans `references/mesures/` consignant :

1. Le chemin ou l'identifiant exact de la planche/frame source.
2. La capture de référence originale et le masque extrait.
3. Les mesures relevées (proportions, traits, palette).
4. Le code générateur reproductible exploitant `toriyama.js`.
