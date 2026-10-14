# Catalogue Toriyama et marque DBFR

La marque publique dit **Dragon Ball France**. Le nuage Kinto-Un remplace la boule
dans le wordmark ; les anciens emblèmes, sphères et motifs restent disponibles pour
leurs usages éditoriaux. Les formes du nuage ont un seul propriétaire dans
`packages/ui/src/toriyama-svg/kinto-un.ts`.

`packages/ui/src/toriyama/catalog.json` inventorie les composants exportés,
l'artwork empaqueté, les glyphes maison, les Material Symbols retenus et les rôles
typographiques. Il est exporté comme `TORIYAMA_CATALOG` par le sous-chemin
`@aphrody/shenron-ui/toriyama`. Génération et contrôle :

```sh
bun scripts/design/build-dragon-wordmark.ts --check
bun scripts/design/build-toriyama-catalog.ts --check
```

Les 27 Material Symbols Rounded de 24 unités proviennent du catalogue propriétaire
`@aphrody/material-design-icons` version 1.0.0. Le snapshot consigne leurs empreintes
et conserve la licence Apache-2.0. `MaterialSymbol` sert ces SVG inline depuis
`@aphrody/shenron-ui/icones`, sans ligatures, requête de catalogue ni police
d'icônes complète. Pour rafraîchir ce sous-ensemble, fournir le chemin explicite du
paquet propriétaire :

```sh
bun scripts/design/sync-material-symbols.ts <owner-package-root> --check
```

**Shenron Text** est une adaptation déclarée d'Inter sous OFL 1.1, avec espacement
élargi de 1 % em. Les WOFF2 Latin/accents sont produits par la recette propriétaire
`@aphrody/m3-fonts` et pèsent 76 568 et 77 144 octets ; les TTF sources, la licence
et la provenance restent disponibles pour la reproduction. Les rôles M3
`--aphrody-font-brand`, `--aphrody-font-plain` et `--aphrody-font-code` consomment les
stacks du site. Le japonais utilise Noto Sans JP ; aucune police de lettrage Dragon
Ball n'est imposée aux phrases ou aux commandes.

Les thèmes sont mesurés sur le key visual officiel
`https://dragonball-super.com/img/kv-2.webp` (2 800 × 3 950 pixels).
Le sombre utilise l'espace bleu nuit (`#0e102b`), l'orange solaire (`#fe8648`)
et l'or de Freezer (`#d3bf69`). Le clair utilise le blanc cyan du Kamehameha
(`#f6ffff`) et le bleu de l'aura de Goku (`#00acff`). Les identifiants
techniques `beerus` et `goku` restent compatibles avec les préférences existantes.
Les rectangles normalisés, modes de pixels, nombres de pixels retenus,
empreinte SHA-256 et rôles M3 dérivés sont dans `brand/home-palette.json`.
`bun scripts/design/extract-home-palette.ts <key-visual> --write` reproduit
ces mesures avec Bun.Image, sous une limite de 16 millions de pixels.
`bun packages/ui/scripts/generate-home-theme.ts` produit le snapshot CSS unique
consommé par le site ; `--check` détecte la dérive. Les tests vérifient les
paires de texte et de boutons à 4,5:1. Aucun rôle hex n'est recopié dans le
CSS consommateur.
L'image PNG de 1279 × 585 est conservée intacte dans le paquet UI puis synchronisée
dans les assets publics. L'accueil l'utilise avec un voile adapté au thème ; le
recadrage responsive ne modifie pas le fichier. Les anciens fonds d'épisode ne
sont plus superposés à cette illustration sur l'accueil.
Le jaune `#fef102` et le rouge `#e50113` du logo restent mesurés dans la référence
de marque du propriétaire ; textes, boutons et focus ont des tons dérivés lisibles.
Le wordmark et le thème restent distincts : un jaune de logo ne devient pas un texte
jaune sur fond blanc. Les contrôles restent nommés, de 44 px au minimum, et le mode
de couleurs forcées conserve les rôles système.

La référence source est petite : cette reconstruction ne revendique pas une
reproduction pixel à pixel du logo officiel. Les contrôles de composants dans
Chrome à 1440, 390 et 320 px ne prouvent pas une activation en production.

L'accueil reconnecte les clips des sections configurées sur leur origine CDN
canonique. Chaque section occupe le viewport disponible ; le navigateur gère le
scroll snap, la profondeur par timeline de défilement et la transition de vue
entre deux écrans. Le passage émet une seule traînée d'énergie, par transform et
opacité, sans animation de flou ni boucle JavaScript par frame. Les anciennes
plateformes gardent la navigation native. Un bouton SVG permet de mettre les
fonds en pause ; les vidéos hors écran ou dans un onglet masqué restent arrêtées.
La préférence système de mouvement réduit et l'économie de données conservent
le poster. L'animation complète est active par défaut.
