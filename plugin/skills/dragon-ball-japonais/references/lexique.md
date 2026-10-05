# Lexique japonais — pièges et attestations

Les couples graphie → forme française viennent du **lexique embarqué**
([lexique-canonique.md](lexique-canonique.md), interrogeable par
`bun scripts/lexique.js cherche <terme>`) : instantané des fiches du wiki, avec sa
révision et sa date. Cette page garde ce que le lexique ne dit pas : les pièges.

## Attestation dans le corpus (relevé daté)

Nombre d'occurrences comptées dans les databooks transcrits de dragonballfr.com le
2026-08-22 (plus de 6 000 planches). Il mesure l'attestation, pas l'importance, et
il augmente avec la transcription (le 2026-10-01, `かめはめ波` donnait 737 au lieu
de 570) : seuls les ordres de grandeur sont réutilisables, avec leur date. Hors
ligne, ces chiffres sont **établis au 2026-08-22**, rien de plus.

| Japonais | Corpus | Japonais | Corpus |
| --- | --- | --- | --- |
| `ドラゴンボール` | 3 104 | `サイヤ人` | 3 009 |
| `ベジータ` | 2 686 | `フリーザ` | 2 400 |
| `セル` | 2 214 | `ピッコロ` | 1 770 |
| `超サイヤ人` | 1 627 | `孫悟空` | 1 507 |
| `トランクス` | 1 202 | `ブルマ` | 1 086 |
| `クリリン` | 1 025 | `ナメック星` | 896 |
| `人造人間` | 780 | `魔人ブウ` | 686 |
| `天津飯` | 652 | `かめはめ波` | 570 |
| `ヤムチャ` | 543 | `神龍` | 524 |
| `孫悟飯` | 420 | `亀仙人` | 321 |
| `元気玉` | 215 | `瞬間移動` | 207 |
| `界王拳` | 133 | `龍拳` | 120 |
| `カカロット` | 115 | `ギニュー特戦隊` | 78 |
| `残像拳` | 60 | `界王様` | 44 |
| `気功砲` | 41 | `魔貫光殺砲` | 37 |
| `気円斬` | 37 | `武天老師` | 29 |
| `ギャリック砲` | 28 | `超元気玉` | 24 |
| `魔閃光` | 21 | `超かめはめ波` | 14 |
| `操気弾` | 3 | | |

`亀仙人` (« l'ermite tortue ») et `武天老師` désignent le même personnage ; le premier
domine largement. `人造人間` se traduit littéralement « humain artificiel » ; le
français hésite entre « cyborg » et « androïde » selon les éditions : prendre la
forme du lexique ou de la fiche, ne pas trancher seul.

## Pièges d'écriture

`かめはめ波` mêle trois hiragana et un kanji : ni `カメハメ波`, ni `亀破波`, ni tout
en kana. `気円斬` s'écrit en kanji, pas `キエンザン`. Une même graphie peut avoir
plusieurs fiches (variante, futur, jeu) : prendre celle du support cité.

## Pièges de translittération

Les modèles généralistes translittèrent au son et se trompent :

| Sortie fautive courante | Forme correcte |
| --- | --- |
| Végitta, Vegita | **Vegeta** |
| Frézza, Freeza | **Freezer** (français officiel) |
| Son-gu, Songoku | **Son Goku** |
| Saïya, Saïyas | **Saiyan** / **Saiyans** |
| « le poing du roi » | la technique `界王拳` (forme du lexique) |
| « une vague de coups » | **Kamehameha** |

Les deux dernières lignes sont le motif à retenir : une technique dont le nom est
composé de kanji se fait **traduire littéralement** au lieu d'être translittérée.
`界王拳` = `界王` (roi des mondes) + `拳` (poing) — d'où « poing du roi »,
grammaticalement correct et complètement faux. Le masquage (`lexique.js masque`)
existe pour cela.

## Jeux de mots de Toriyama

Lecture répandue des noms par familles (légumes pour les Saiyans, sous-vêtements
pour la famille Briefs, produits laitiers pour le commando Ginyu, froid pour la
famille de Freezer, limaces pour Namek). Ce n'est **pas** une donnée sourcée de ce
plugin : utile pour comprendre un nom, à ne jamais présenter comme établi sans
déclaration publiée de l'auteur.
