# DBXV2 : base de données et recherche (privées)

Les données du jeu (Bandai Namco / Dimps) sont privées, hors de l'attestation Toei/Shueisha :
jamais dans Git, le VFS public, un artefact de build ni le PostgreSQL de production.

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

- Les lecteurs MSG et CMS de `bun_re` (`summarize`) sont des maquettes ; `msg.ts` et `decodeCms` lisent les vrais layouts en attendant leur correction.
- CUS, BAC, BCM et moveset ne sont pas encore décodés fiablement : seuls le format et la catégorie sont indexés.
- Certaines clés de messages (`lobby_text`, `qs_*`) sont lues en UTF-16 puis décodées comme CJK (identifiants illisibles) : le décodage de clés de `msg.ts` reste à corriger ; le texte des valeurs est correct.
- sha256 calculé pour les genres `text` et `data` uniquement.
