# DBXV2 : base de données et recherche

Le propriétaire confirme le 2026-10-20 que l'accord confidentiel inclut Toei, Shueisha et Bandai
Namco pour Xenoverse 2, et demande la publication publique des données DBXV2. Le serveur reste
à ce stade sur le mesh privé ; son exposition publique suit le runbook Infra. Les CPK et la base
ne sont jamais copiés dans Git ni dans un artefact de build. Les secrets de service restent privés.

- Stockage : SQLite `~/var/dbxv2-db/dbxv2.sqlite` sur la fabrique (dossier 700, fichier 600). Le script refuse tout chemin dans le dépôt.
- Code : `packages/db/src/dbxv2/` (`openDbxv2Db`, `ingestDbxv2`, `embedPending`), script `scripts/data/build-dbxv2-db.ts`, tests `packages/db/test/dbxv2.test.ts` (échantillon synthétique).

## Schéma

`dbxv2_files` (cpk, chemin, offset, taille, taille extraite, format, catégorie, sha256, `asset_path` vers l'arbre d'assets converti à la demande), `dbxv2_characters` (CMS), `dbxv2_msg` (textes fr/en/ja), plus le store aphrody-rag du VFS (`docs`, `chunks`, `chunks_fts`, `vectors_i8`), corpus `dbxv2`, visibilité `private`.

## Recherche

`openDbxv2Db(path, { embedder })` puis `search(query, { lang, kinds, limit })` : FTS5 BM25 fusionné par RRF avec le cosinus e5 (multilingual-e5-small, 384 d) ; lexical seul sans vecteurs. Aussi `files`, `file`, `characters`, `messages`.

## Exécution (fabrique)

```sh
bun scripts/data/build-dbxv2-db.ts build      # index, CMS, MSG, chunks
bun scripts/data/build-dbxv2-db.ts plan       # volumes + commande tmux d'embedding
```

L'embedding utilise `aphrody-embed serve` local, sous `flock ~/build/locks/heavy.lock`, dans tmux. Jamais `rag:build` sur le bot de production.

Procédure exacte (qualifiée le 2026-10-18, 15578 chunks en environ 51 min) :

```sh
# 1. serveur : --model-dir obligatoire (modèle e5 dans ~/var/models), attendre ~25 s
aphrody-embed serve --port 18795 --model-dir $HOME/var/models &
# 2. embedding : lots de 16 au plus (au-delà, le serveur répond 400), défaut du script
flock ~/build/locks/heavy.lock bun scripts/data/build-dbxv2-db.ts embed --batch 16   --embed-url http://127.0.0.1:18795/v1 > ~/var/dbxv2-db/embed.log 2>&1
```

`--batch` vaut 16 par défaut ; `plan` imprime la commande tmux complète. La reprise est idempotente (`pendingChunks`).

## Validation de la recherche hybride (2026-10-18)

- Nombre de vecteurs int8 = nombre de chunks = 15578 (aucun chunk sans vecteur).
- Requêtes « Kamehameha », « Genkidama » (fr/en) et « かめはめ波 » (ja) via `openDbxv2Db(path, { embedder: "http://127.0.0.1:18795/v1" })` : `mode: "hybrid"`, 8 résultats ; sans embedder `mode: "lexical"`.
- L'hybride recoupe 4 à 5 résultats sur 8 avec le lexical et fait remonter des passages sémantiquement proches (par exemple la phase Genki pour « Genkidama ») que la correspondance de termes seule manque.

## Limites

- Les lecteurs MSG et CMS de `bun_re` (`summarize`, `game/formats/msg.rs`) restent des maquettes (chaînes terminées par NUL, identifiants `MSG_<i>`, aucune table de noms ni de lignes). `msg.ts` et `decodeCms` ne peuvent donc pas être remplacés par les lecteurs de `@shenron/dbxv2` : ils restent la seule lecture des vrais layouts, à retirer quand `bun_re` décodera les tables `{offset, chars, bytes}`.
- CUS, BAC, BCM et moveset ne sont pas encore décodés fiablement : seuls le format et la catégorie sont indexés.
- Enregistrement de chaîne MSG `{offset, chars, bytes}` : UTF-16LE quand `bytes == chars*2 + 2`, UTF-8 quand `bytes == chars + 1` (la plupart des clés, quelques lignes). Lire ces dernières en UTF-16 produisait des identifiants CJK illisibles et perdait des entrées ; corrigé dans `msg.ts` (base reconstruite, voir le journal de build).
- sha256 calculé pour les genres `text` et `data` uniquement.
