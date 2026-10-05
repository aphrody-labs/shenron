# Mesures, géométrie et composants

## Mesurer et comparer

Depuis la skill :

```bash
python3 scripts/mesurer.py /tmp/sujet/planche.webp --teinte 20 45 --sat 0.3 --k 5
python3 scripts/mesurer.py /tmp/sujet/planche.webp --sombre
bun scripts/rendu.ts dessin.svg --tailles 512 128 64 32 16 --compare /tmp/sujet/planche.webp
bun scripts/icones.ts icone.svg --sortie /chemin/public
```

La segmentation isole la plus grande composante, rebouche les trous et produit
boîte, ratio, remplissage, palette HEX/RGB/HSL/OKLCH, déciles de luminance,
rythme des creux et trait médian. Regarder masque et découpe avant d'accepter
les mesures : un décor, une scène nocturne ou un scan jauni peut les fausser.
Une source en désaccord avec une autre reste documentée, pas tranchée en silence.

Mesurer le ratio sur l'encre après rognage alpha, pas sur le viewBox. Pour un
personnage : taille en têtes, épaules, position des yeux, mèches, bouche ; utiliser
`--boite` sur les zones. Les anciennes valeurs de trait 0,7–0,9 % du sujet et
2–3 % pour une icône sont des points de départ mesurés, pas des constantes
universelles. Relever les aplats et les changements de teinte/saturation de
l'ombre dans la référence choisie.

## Réutiliser le propriétaire

`@shenron/ui` vit dans `packages/ui` (couche UI unique du dépôt Shenron), dont les exports
`./toriyama-svg`, `./svg` et `./toriyama` sont déclarés par son `package.json`. Les primitives
M3 communes viennent des paquets publiés `@aphrody/m3-*`. Ne pas restaurer un checkout UI
séparé.

Lire seulement le fichier pertinent avant usage :

| Source sous `packages/ui/src/` | Décisions utiles |
| --- | --- |
| `toriyama-svg/geometry.ts` | `arcs`, `volute`, `meche`, `planDombre`, `inkStroke`, `mirrorX` ; creux, flèches, ombre découpée |
| `toriyama-svg/palette.ts` | Palette propriétaire ; vérifier ses mesures pour le sujet |
| `toriyama-svg/emblems.ts` | Emblèmes disponibles et clés actuelles |
| `toriyama/index.ts` | Composants emblèmes, sphère, radar, scouter, nuage, aura, silhouette, accessoires |
| `components/toriyama-*.tsx` | Badge, panel, slider, progress, speech bubble ; lire les `Props` actuelles |

Le script local `scripts/geometrie.ts` sert aux travaux hors monorepo. Dans
Aphrody, importer la bibliothèque existante plutôt que copier un moteur ;
ne pas recopier ici chaque prop/export déjà détenu par le code. Le générateur,
le composant et l'icône doivent partager la même géométrie maintenue.

## Contrôles de rendu

Le rendu à chaque taille doit être natif, agrandi au plus proche voisin pour
voir les pixels réels. Ouvrir la planche avec la référence à hauteur égale :
une tête trop longue ou une dérive de palette reste invisible au code seul.
Sous 64 px, supprimer les détails devenus bruit ; une illustration large ne
remplace pas une icône carrée. Un jaune sur blanc peut nécessiter une pastille
sombre ; vérifier le contraste effectivement mesuré.

Le générateur d'icônes produit un conteneur ICO multi-tailles réel, PNG 16/32/48/96,
Apple opaque, 192/512 `any`, 512 `maskable` séparée et tuile Windows. Vérifier
les balises et le crop effectif ; un PNG renommé `.ico` ou une image unique
`any maskable` ne qualifie pas ce jeu.
