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

## Limites

- Les lecteurs MSG et CMS de `bun_re` (`summarize`) sont des maquettes ; `msg.ts` et `decodeCms` lisent les vrais layouts en attendant leur correction.
- CUS, BAC, BCM et moveset ne sont pas encore décodés fiablement : seuls le format et la catégorie sont indexés.
- sha256 calculé pour les genres `text` et `data` uniquement.
