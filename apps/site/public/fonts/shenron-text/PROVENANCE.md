# Shenron Text

Police d’interface dérivée d’Inter, pas une police originale dessinée depuis un logo
Dragon Ball. Les deux fichiers TrueType statiques restent sous SIL Open Font
License 1.1 ; la licence intégrale et la notice des auteurs sont dans `OFL.txt`.

Source : les faces locales `../Inter-Medium.ttf` et `../Inter-Bold.ttf`, portant
la notice « Copyright 2016 The Inter Project Authors ». Licence upstream :
https://github.com/rsms/inter/blob/master/LICENSE.txt.

Modification : chaque glyphe à avance positive gagne 1 % de l’em arrondi à
l’unité TrueType (20 unités sur un em de 2 048) ; 10 unités sont ajoutées à son espacement
gauche. Les glyphes à avance nulle gardent leurs métriques. Les contours,
accents, tables de caractères, substitutions et ajustements de crénage sont
inchangés. Les métriques horizontales agrégées et les sommes de contrôle sont
recalculées. Les noms de famille et PostScript deviennent Shenron Text.

Ce réglage apporte davantage d’espace aux libellés compacts. Il ne revendique
pas d’amélioration clinique de la lisibilité et ne remplace pas un contrôle du
contraste et de la taille des textes. Les caractères japonais restent assurés
par la police de repli japonaise du site.

Génération reproductible, sans dépendance :
`bun scripts/design/build-shenron-font.ts`.
Famille CSS : `Shenron Text`, faces Medium 500 et Bold 700.

Les sources ont 2 926 glyphes chacune. Leur SHA-256 :

- Inter Medium : `1bda81124d6ae26ed16a7201e2bd93766af5a3b14faf79eea14d191ebbd41146`
- Inter Bold : `0cb1bc1335372d9e3a0cf6f5311c7cce87af90d2a777fdeec18be605a2a70bc1`

Les notices intégrées à la table `name` sont conservées. La table `head` ne
déclare plus l’égalité entre espacement gauche et minimum horizontal du
contour, puisque l’espacement a été modifié.

## Versions web minimisées

Les faces WOFF2 sont produites par la recette propriétaire de `@aphrody/m3-fonts`
(`scripts/subset.py`), sans copier cette source ni reconstruire le package M3.
Le générateur Shenron l’appelle par `bun uv run --script`, avec ses dépendances
isolées et épinglées `fonttools==4.60.1` et `brotli==1.1.0`.

Commande : `bun scripts/design/build-shenron-font.ts --web --m3-fonts <répertoire m3-fonts>`.
La variable `M3_FONTS_DIR` peut fournir ce répertoire à la place de l’option.

Le sous-ensemble conserve le latin étendu, les accents combinés, les caractères
vietnamiens, la ponctuation, les devises, les flèches et les symboles mathématiques
présents dans les sources. `subsets.json` consigne exactement les points Unicode
disponibles et les tailles. Les tables de mise en forme sont adaptées par fontTools
au sous-ensemble ; les coordonnées des contours et métriques conservés sont
vérifiées après décompression. Les notices restent intégrées et dans `OFL.txt`.

| Face   |    TTF complet |     WOFF2 web | Réduction |
| ------ | -------------: | ------------: | --------: |
| Medium | 411 512 octets | 76 568 octets |   81,39 % |
| Bold   | 415 088 octets | 77 144 octets |   81,42 % |

Qualification de décompression :
`SHENRON_FONTTOOLS_VERIFY=1 bun test scripts/design/build-shenron-font.test.ts`.
La qualification navigateur complète dépend du chargement des faces dans le site.
