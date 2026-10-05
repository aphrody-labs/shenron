---
name: dragon-ball-canon
description: "Vérifie la canonicité Dragon Ball dans la doctrine Shenron et cite le verdict, son origine et les références."
---

# Canonicité sourcée

Appliquer le [contrat partagé](../../references/execution.md).

Interroger `dragonball_canon_check` (`question`) ou
`GET https://dragonballfr.com/api/canon?q=…`. Sans source joignable, le statut
reste non établi. Lire la doctrine actuelle ; les rangs et leurs inclusions
peuvent changer.

- `origine: entry:<id>` : décision curée par sujet ; `heuristic:<id>` : famille
  de formulations ; `fallback` : sujet non tranché, aucun rang à inventer.
- Si `entries[]` et `tiers[].inclut` divergent, citer le verdict du sujet avec
  son origine et signaler l'écart sans décider soi-même.
- `score` exprime l'autorité du rang, pas une probabilité. Une déclaration
  d'auteur est une pièce publiée, pas automatiquement un verdict.
- `references[]` peut être vide sans prouver l'absence de source. Citer édition,
  support, année et URL ; vérifier la planche lorsqu'elle est disponible.

Répondre rang → raison → preuves. Séparer les supports et traiter une question
par sujet. Ni Fandom, Reddit ni une interview sans source publiée ne fondent un
verdict. Pour parcourir les preuves, utiliser `dragonball_canon_references`
(`q`, `provenance`, `limit`, `offset`) ou `/api/canon/references`.

[Champs et routes détaillés](../dragon-ball/references/api.md#canon-arbitre-de-canonicité) ;
[graphies japonaises](../dragon-ball-japonais/SKILL.md).
