# Chaîne japonaise du dépôt Shenron (mainteneurs, facultatif)

> **Ne s'applique que si** le dépôt Shenron est le répertoire de travail et que Bun
> est installé. La skill n'en a pas besoin : son lexique et son masquage sont
> embarqués (`scripts/lexique.js`). Sans dépôt, ne lancer aucune commande d'ici.

## Ressources hors dépôt

```bash
bun apps/site/scripts/ja-preparer.ts [--force]   # dans apps/site/.ja-data/
```

| Ressource | Rôle | Poids |
| --- | --- | --- |
| dictionnaire **kuromoji** (IPADIC) | découpage, nature, lecture, lemme | 18 Mo |
| index **JMdict** (EDRDG, CC BY-SA 4.0) | « ce mot existe-t-il ? » | 7,6 Mo |

## Modules — `apps/site/src/lib/ja/`

| Fichier | Contenu | Pur ? |
| --- | --- | --- |
| `normalisation.ts` | écritures, `normaliserJa`, katakana → hiragana, furigana | oui |
| `anomalies.ts` | distance bornée, index du lexique, suggestion | oui |
| `traduction.ts` | masquage des termes, jetons, segments traduisibles | oui |
| `lexique-canonique.ts` | lexique `data/lexique-db-canonique.json`, contrôles de dépôt | fichiers |
| `lexique.ts` | lexique du domaine depuis `bot.*` | `server-only` |
| `dictionnaire.ts` | kuromoji + JMdict, chargement paresseux | fichiers |

`scripts/lexique.js` du plugin est généré depuis `traduction.ts` et
`normalisation.ts` par `bun scripts/plugin/build-references.ts`.

## Scripts

```bash
bun apps/site/scripts/ja-analyser.ts    --json rapport.json   # fautes de lecture
bun apps/site/scripts/ja-vocabulaire.ts --json vocab.json     # vocabulaire manquant
bun apps/site/scripts/ja-techniques.ts  [--apply]             # simulation par défaut
```

Les deux premiers lisent le même signal en sens inverse : une graphie inconnue
partout est une faute si elle est **rare** et ressemble à un terme connu, du
vocabulaire manquant si elle est **fréquente** et ne ressemble à rien.

Une graphie n'est signalée que si quatre filtres la laissent passer : inconnue
d'IPADIC ; inconnue de JMdict (qui absout les emprunts comme `コミックス`,
`バーサス`) ; ni terme ni **morceau** de terme du domaine (`ンクス`, bout de
`トランクス`) ; forme correcte présente **et dominante** dans le corpus. Le
détecteur a des faux positifs : rien n'est appliqué sans vérification au scan.

## Pièges vécus

- `import.meta.dir` est une API Bun, `undefined` sous Turbopack : le dossier des
  ressources se résout à l'appel, jamais à l'évaluation du module.
- Sans `.ja-data`, l'analyse peut répondre « 0 anomalie » alors qu'elle en trouve en
  local : un résultat rassurant et faux est pire qu'une erreur.
- L'index du lexique se construit une fois et se met en cache, pas par planche.
- Le corpus bouge pendant la transcription : deux mesures espacées d'une heure ne
  portent pas sur le même texte.
