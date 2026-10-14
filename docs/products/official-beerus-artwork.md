# Visuels officiels Beerus

Le registre pur `apps/site/src/lib/official-beerus-artwork.ts` décrit les 27 fichiers
déjà publiés dans `/dragonball-super/` sur le CDN Dragon Ball FR. Chaque entrée
conserve son URL source officielle, la page de provenance, ses dimensions,
son type MIME, sa taille et le SHA-256 qui adresse les octets publics.

Le rapprochement du 14 octobre 2026 compare les octets servis par les images
référencées dans le HTML et le CSS de [l’accueil officiel](https://dragonball-super.com/en/)
et de [la page musicale](https://dragonball-super.com/en/music/index.html).
L’ICO contient une image de 48 × 48 ; les dimensions SVG décrivent son `viewBox`.
Attribution : ©BIRD STUDIO/SHUEISHA, TOEI ANIMATION.

Les rôles distinguent les logos, le visuel principal, les portraits de Goku et
Beerus, les deux artistes, les trois vignettes de bande-annonce, les titres
éditoriaux, les textures et les ornements. Ce répertoire ne contient pas les
neuf portraits ni les six images de récit désormais présents sur le site source.
Il ne prétend pas fournir ces fichiers absents du catalogue CDN qualifié.

`WatchLayout` utilise le fond spatial officiel uniquement pour la série
`DBS_BEERUS`, avec une image décorative sans libellé et sans interaction.
L’image est peu opaque, fondue vers la surface et désactivée en couleurs forcées.
Les posters, scènes, sous-titres et sources de lecture des fiches restent issus
de leurs données canoniques. Aucun champ éditorial, corpus ou index RAG ne s’écrit
depuis ce registre.

La qualification Chrome décode les 27 URL CDN, y compris SVG et ICO, ainsi que
le décor effectivement monté par `WatchLayout`. Les captures et reçus privés
restent dans `var/reports/watch-layout/` ; ce contrôle de composants ne constitue
pas un déploiement ni une preuve de lecture d’un épisode.
