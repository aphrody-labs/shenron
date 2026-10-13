<!-- SPDX-License-Identifier: Apache-2.0 -->
# Lecteurs et thèmes d’épisodes

Les commandes natives servent avant hydratation. Ensuite, une seule barre gère
la lecture, le volume, le cinéma et le plein écran. Les réglages de vitesse,
qualité, audio et sous-titres restent repliés et suivent les pistes réellement
observées. Les embeds externes conservent leurs propres commandes et leur langue.

La normalisation des lecteurs et pistes appartient à `packages/media` ; le site
projette leurs transports publics dans ses API. Un MP4 n’est jamais annoncé
comme playlist HLS. Les styles et couleurs appartiennent à `packages/ui`.

Les deux thèmes utilisent des captures navigateur de l’épisode875, sans média
synthétique. Vingt captures ont été comparées le13octobre2026 : Beerus à434s
pour le gros plan sombre, Beerus/Whis à779s pour violet/cyan/or, Goku Super Saiyan
à285s pour l’aura dorée. Les hashes, zones et graines sont dans
`packages/ui/src/episode-theme-reference.json`. Les captures de travail restent
dans les rapports privés, hors Git.

Le violet est mesuré dans la zone272,69,155,205 de la capture779s ; l’aura dans
la zone355,0,340,180 de la capture285s. FFmpeg décode enRGBA ; l’échantillonnage
regroupe les canaux par pas16. M3`vibrant` génère les rôles à contraste0,15,
avec familles cyan et dorée distinctes. Génération reproductible :

```sh
bun packages/ui/scripts/generate-episode-themes.ts
bun packages/ui/scripts/generate-episode-themes.ts --check
```

Beerus : contraste texte/primaire8,29:1, texte/carte13,13:1. Goku :7,94:1
et15,50:1. Le sélecteur conserve le choix localement et l’amorce l’applique avant
la peinture. Les couleurs forcées suivent les couleurs système.

L’étoile SVG vient du propriétaire `toriyama-svg/couverture` (ratio r/R0,45
mesuré sur le tankōbon124), réutilisée dans les scènes et le sélecteur. Aucune
nouvelle géométrie de personnage ni correspondance pixel-par-pixel n’est annoncée.

Les contrôles navigateur du composant utilisent la vidéo réelle875 à1280/390px.
Ils qualifient lecture, réglages, cinéma/Escape et absence de débordement. Les
pages complètes attendent la base locale et la livraison de production ; la
lecture effective du fournisseur externe445 reste une preuve séparée.
