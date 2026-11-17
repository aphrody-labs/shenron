---
name: dragon-ball-japonais
description: "Vérifie les graphies et traduit le japonais Dragon Ball en français avec le lexique attesté embarqué (hors ligne), enrichi par le wiki et les databooks quand ils répondent."
---

# Japonais Dragon Ball

Appliquer le [contrat partagé](../../references/execution.md).

Une graphie de fiction ne se déduit ni du rōmaji ni de la prononciation. Sans
preuve, signaler l'incertitude et laisser la graphie vide. L'absence de JMdict ou
d'IPADIC n'est pas une preuve de faute, l'absence du lexique non plus.

## 1. Lexique embarqué (toujours)

Depuis le dossier de cette skill :

```bash
bun scripts/lexique.js cherche ベジータ          # graphie → formes française et anglaise
bun scripts/lexique.js cherche "Kaiô-ken"       # forme française ou anglaise → graphie
bun scripts/lexique.js termes "孫悟空は界王拳を使った"
bun scripts/lexique.js masque "孫悟空は界王拳を使った" > masque.json   # --en : formes anglaises
bun scripts/lexique.js restaure "Zeta001 a utilisé le Zeta002." --table masque.json
```

Le lexique (`references/lexique-canonique.json`, lisible dans
[lexique-canonique.md](references/lexique-canonique.md)) est l'instantané du lexique
unique de Shenron (`data/lexicon/terms.json` : japonais, français du wiki, anglais quand une
source l'établit, alias) ; `lexique.js` applique les règles de `@aphrody/shenron-lexicon`, les mêmes que
le site, l'API et le traducteur de Shenron Studio (le plus long d'abord, frontières de mot
katakana, jetons `Zeta001`). Une forme anglaise vide n'est pas établie : ne pas l'inventer.
Graphies prouvées par une planche de databook : `bun ../dragon-ball/scripts/faits.ts
section graphies_japonaises_prouvees` ; techniques avec lecture et premier chapitre :
`section techniques`. Pièges de graphie et de translittération : [lexique](references/lexique.md).

## 2. Vérification vivante (facultative)

Si les sources répondent : occurrences dans les databooks avec
`dragonball_databooks_plates` ou `GET https://dragonballfr.com/api/databooks/search?q=…&limit=3`
(l'index trigramme devient bruité sous trois signes ; un OCR isolé peut être faux),
forme française retenue avec `dragonball_wiki_search` ou
`https://bot.dragonballfr.com/api/public/wiki/search?q=…&limit=5` (`name`, `name_ja`).
Les routes `/api/bot-user/…` exigent une session et ne sont pas ce flux public.

## 3. Traduire

Protéger le lexique, traduire les segments masqués, restaurer, puis vérifier tous
les termes et nombres ([méthode et contrôle](references/traduction.md)). Ne pas
traduire une source illisible ni combler ses lacunes ; conserver le ton factuel et
les ellipses. Normaliser les points médians pour comparer ; séparer les cellules
mixtes `name_ja` sur les virgules. Le contexte et la date de l'ouvrage priment sur
la ressemblance d'un mot. Citer pour chaque nom la source : lexique (instantané,
révision, date), planche prouvée, ou source vivante.

[Outils du dépôt](references/outils.md) : seulement pour un mainteneur qui a le
code Shenron, jamais nécessaires à cette skill.
