---
name: dragon-ball-canon
description: "Vérifie la canonicité Dragon Ball avec la doctrine Shenron embarquée (moteur hors ligne, même verdict que /api/canon) et cite le verdict, son origine et ses références."
---

# Canonicité sourcée

Appliquer le [contrat partagé](../../references/execution.md).

## 1. Verdict hors ligne (toujours)

Depuis le dossier de cette skill :

```bash
bun scripts/canon.js "Broly est-il canon ?"         # verdict lisible
bun scripts/canon.js --json "Broly est-il canon ?"  # même forme que GET /api/canon?q=
bun scripts/canon.js --liste                        # sujets tranchés : id, rang, score
bun scripts/canon.js --entree broly                 # un sujet complet
bun scripts/canon.js --doctrine                     # même forme que GET /api/canon
```

`canon.js` embarque le moteur `canon-engine.ts` du site et sa doctrine par défaut
(révision et date dans l'en-tête du fichier et dans le champ `instantane`). Sans Bun,
lire la [doctrine lisible](references/doctrine.md) : rangs, inclusions, règles,
sources admises et refusées, familles de formulations, et chaque sujet tranché avec
verdict, explication, citation et sources.

Statut à citer :

- `origine: entry:<id>` → **établi (instantané)** : décision curée pour ce sujet.
- `origine: heuristic:<id>` → **non établi** : rang seulement présumé par une
  famille de formulations ; le dire.
- `origine: fallback` → **non établi** : la doctrine n'a pas tranché ; aucun rang à
  inventer, le score de repli (50) ne fonde rien.
- `troll:*` → hors des sources (crossover, invention, hors sujet).

## 2. Enrichissement vivant (facultatif)

Si `dragonball_canon_check` (MCP) ou `GET https://dragonballfr.com/api/canon?q=…`
répondent, ils ajoutent la doctrine de production (retouchable dans `/admin/canon`,
donc parfois différente de l'instantané), le corpus de `references[]`, les planches
et les fiches, qui ne sont pas embarqués. Un écart entre verdict vivant et
instantané se signale, avec les deux origines. Preuves : `dragonball_canon_references`
(`q`, `provenance`, `limit`, `offset`) ou `/api/canon/references`.
[Champs et routes](../dragon-ball/references/api.md#canon-arbitre-de-canonicité).

## Règles

- Si `entries[]` et `tiers[].inclut` divergent, citer le verdict du sujet avec son
  origine et signaler l'écart sans décider soi-même.
- `score` exprime l'autorité du rang ou du sujet, pas une probabilité ; chaque sujet
  porte son propre score. Une déclaration d'auteur est une pièce publiée, pas
  automatiquement un verdict ; une citation marquée « paraphrase » n'est pas littérale.
- `references[]` vide ne prouve pas l'absence de source. Citer édition, support,
  année et URL quand la doctrine ou la source vivante les donne ; ne pas les inventer.
- Répondre rang → raison → preuves → statut et révision de l'instantané. Séparer les
  supports et traiter une question par sujet. Ni Fandom, ni Reddit, ni une interview
  sans source publiée ne fondent un verdict.

Déclarations d'Akira Toriyama embarquées : `bun ../dragon-ball/scripts/faits.ts section declarations_auteur`.
Graphies japonaises : [skill dédiée](../dragon-ball-japonais/SKILL.md).
