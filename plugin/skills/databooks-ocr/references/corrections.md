# Maintenance OCR — invariants

Cette référence conserve les invariants et contre-exemples de correction ; elle
se lit hors ligne. Leurs anciens volumes ne sont pas un état actuel. Les commandes
qui citent `apps/site/…` ou `scripts/…` exigent le dépôt Shenron (mainteneurs) ; le
code propriétaire est `apps/site/src/lib/databooks-ocr/` et ses runners
`apps/site/scripts/corrige-*.ts`.
Ne jamais corriger un caractère sans preuve dans le scan ou règle déterministe
qualifiée. Un nom absent du lexique n'est pas nécessairement fautif.

## Mesurer et qualifier

Chaque famille exige comptage courant des planches touchées, recherche de
contre-exemples légitimes et test de non-régression. Le filtre de découverte ne
doit pas être plus strict que celui de correction ; compter et journaliser les
candidats écartés. Annoter les occurrences agglutinées, les arbitrer depuis
le scan ; à défaut, conserver le signal sans réécrire.

Le point médian `・` est une frontière dans les règles de noms propres : un
filtre le traitant comme katakana bloquant a éliminé toutes les occurrences
propres de `プロリー`. Réutiliser le même prédicat pour découverte et correction.

Vérifier graphie et contexte dans le corpus, rapport de fréquence (l'ancien
critère exigeait au moins 2×), date et dictionnaire. Le rapport seul n'est pas
une preuve : `アビリティ` et `レアリティ` sont deux mots réels. Ne pas convertir
`ガンバー` dans un jeu de 1992 en Cumber, `トキドキ` d'un magazine de 1997 en
Tokitoki, ni `シレン` d'un jeu Chunsoft en Jiren. JMdict ignore les noms
propres étrangers et les termes du domaine ; des cartes Heroes ou tableaux de
trophées entièrement katakana peuvent être légitimes malgré leur score.

## Gardes de correction

```bash
bun apps/site/scripts/detecte-hallucinations.ts --json /tmp/rapport.json
bun apps/site/scripts/detecte-hallucinations.ts --famille boucle-motif-long
```

Le détecteur distingue **bloquant**, **signalé** et **témoin** ; une baisse des
témoins légitimes est une régression. Lire les seuils et leurs mesures dans le
source ; le code 1 signifie régression. Un module pur par famille évite les
conflits de workers ; simulation avant application, aucune suppression globale
du garde « texte corrigé < 50 % de l'original ». Une exception pour une boucle
dégénérée doit être un prédicat nommé, borné et testé.

Ne pas automatiser sans preuve nouvelle les familles suivantes :

| Motif | Contre-exemple ou limite |
| --- | --- |
| Ligne hiragana/furigana | Peut être du vrai texte |
| ソ/ン, シ/ツ, 一/ー | `ヤシ`, `ミート`, `キラー`, `一味`, `一家`, `一同` légitimes |
| Pleine chasse, texte court | `２０１３`, `1990`, `第51話` peuvent être des folios |
| `�` entre kana | Supprimer soude deux fragments et masque la lacune |
| Intrusion d'alphabet | Substitution sans motif fiable : exige le scan |
| Rōmaji seul | Logos, ISBN, copyright, ouvrages anglais légitimes |
| Nombre cerclé > 50 | Aucun caractère Unicode correspondant à inventer |
| Répétition inter-planches | Peut être un boilerplate authentique de magazine |

Préserver les frontières : `ベジタブル` ne contient pas une faute de Vegeta,
`スーパーボンバーマン` ne doit pas être altéré par une règle sur `パーボン`.
Un vrai folio est un chiffre nu ; le titre fabriqué `Page 4` est distinct.
`・` répété ≥3 peut être une ellipse, `・・` une puce : conserver les séparateurs
isolés. Une suite uniforme (`ーーーー`, `……`, `おおおお`) n'est pas une boucle
à supprimer mécaniquement.

## Lecture et dépôt

Recadrer les zones petites avant une seconde lecture (dans le dépôt :
`apps/site/scripts/decoupe-planche.ts`). Ne pas déduire la lisibilité de la résolution : un artbook peut être
sans texte. Les onomatopées dessinées peuvent rester illisibles. Plusieurs
lectures divergentes exigent comparaison au scan et audit, pas un choix fondé
sur la longueur seule. Confusions fréquentes à vérifier, jamais substitutions
universelles : `プロリー/フロリー` ↔ `ブロリー`, `ビッコロ` ↔ `ピッコロ`,
`フルマ` ↔ `ブルマ`, `ドラコンボール` ↔ `ドラゴンボール`.

Le lecteur ne dépose pas. Le propriétaire utilise le [flux de lot](lots.md)
ou l'[administration](../../shenron-admin/SKILL.md). Le mode `merge` cible les
planches ; un texte lu avant une autre correction peut l'écraser : coordonner
les ouvrages/numéros, puis refaire une simulation finale. Une chaîne vide n'est
pas une demande d'effacement ; `text: null` est destructif et exige son autorité.
Avant une application massive autorisée, conserver et checksum-vérifier la
sauvegarde dans le store protégé via le workflow propriétaire. Ne pas exporter
la base ni ses secrets dans les références ou reçus du plugin.

`ja-analyser.ts`, `ja-vocabulaire.ts` et `planches-a-relire.ts` fournissent des
suggestions, pas des corrections sûres. L'export de connaissance reste dans son
store privé. Les anciennes mesures de récupération, taux et volumes doivent
être rejouées sur un corpus fixé avant toute revendication.
