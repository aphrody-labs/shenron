# Traduction JA→FR — lexique et contrôle

## Hors ligne (toujours)

1. Masquer : `bun scripts/lexique.js masque "<texte japonais>" > masque.json`
   (ou `-` pour lire l'entrée standard). Les termes du lexique deviennent `Zeta001`,
   `Zeta002`…, le plus long d'abord, sans mordre dans un mot katakana plus long
   (`セル` ne touche pas `カプセルコーポレーション`).
2. Traduire le champ `masque` en gardant chaque jeton tel quel : par le modèle
   lui-même, ou par un moteur disponible localement si la demande le couvre.
3. Restaurer : `bun scripts/lexique.js restaure "<traduction>" --table masque.json`.
   Code de sortie 2 et liste `residuels` non vide : un jeton s'est perdu ou a été
   déformé, la traduction est **refusée**, pas corrigée à la main.
4. Contrôler : chaque nom présent dans le japonais est restauré sous sa forme du
   lexique ; nombres, dates, prix et ordre des valeurs sont exacts ; aucun nom n'est
   rendu littéralement ni avalé.

Respecter la casse : un nom tiré de l'épicerie n'autorise pas à protéger le mot
commun. Les homonymes ambigus (Vegeta prince ou planète) exigent le contexte, pas
une sélection silencieuse ; l'indiquer. Un terme hors lexique n'est pas une faute :
le traduire avec prudence et le signaler comme non vérifié.

## Style

Garder le style factuel et les ellipses ; dates et prix restent exacts, les
honorifiques ne s'ajoutent que s'ils portent du sens. Une source contenant `�` ou
du charabia relève d'abord de la relecture : ne pas la traduire, ne pas combler ses
lacunes. Conserver les onomatopées non établies plutôt que les traduire mécaniquement.

## Limites

Le lexique permet JA→FR ; il ne garantit aucune graphie canonique à partir d'un nom
français. Le marqueur dépend du moteur : `Zeta001` traverse la plupart des moteurs,
qui le rendent parfois `Zêta001` (la restauration le tolère) ; requalifier sur un
échantillon avant un lot. Ne pas installer de moteur ni déléguer une traduction
payante hors du périmètre de la demande. Le traducteur livre une proposition, pas
une écriture en base ; le propriétaire Shenron contrôle et dépose.

## Avec le dépôt Shenron (mainteneurs, facultatif)

Les mêmes règles vivent dans `@shenron/lexicon` (`packages/lexicon`, `maskText`,
`restoreTokens`) et le crate Rust `shenron-lexicon`, sur `data/lexicon/terms.json` ;
la boucle `bun apps/site/scripts/traduction-boucle.ts --lots 1 --moteur google` est
en simulation, `--appliquer` exige l'autorité d'écriture et ses contrôles.
