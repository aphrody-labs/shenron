# DBXV2 : base de données et recherche

Le propriétaire confirme le 2026-10-20 que l'accord confidentiel inclut Toei, Shueisha et Bandai
Namco pour Xenoverse 2, et demande la publication publique des données DBXV2. Le serveur reste
à ce stade sur le mesh privé ; son exposition publique suit le runbook Infra. Les CPK et la base
ne sont jamais copiés dans Git ni dans un artefact de build. Les secrets de service restent privés.

- Stockage de travail VPS : SQLite `/games/private/shenron-dbxv2/dbxv2.sqlite` (dossier 700, fichier 600), alimentée depuis les CPK montés. Le builder historique `build-dbxv2-db.ts` garde son défaut fabrique `~/var/dbxv2-db/dbxv2.sqlite` ; lui passer `--out` pour viser explicitement une autre copie. Le script refuse tout chemin dans le dépôt.
- Code : `packages/db/src/dbxv2/` (`openDbxv2Db`, `ingestDbxv2`, `embedPending`), script `scripts/data/build-dbxv2-db.ts`, tests `packages/db/test/dbxv2.test.ts` (échantillon synthétique).

## Schéma

`dbxv2_files` (cpk, chemin, offset, taille, taille extraite, format, catégorie, sha256,
`asset_path` vers l'arbre d'assets converti à la demande), `dbxv2_structured` (résumé JSON,
état de parsage, version du parseur, empreinte des octets source et erreur bornée),
`dbxv2_characters` (CMS), `dbxv2_msg` (textes), plus le store aphrody-rag du VFS (`docs`,
`chunks`, `chunks_fts`, `vectors_i8`), corpus `dbxv2`, visibilité `private`.

L’index TOC seul ne compte pas comme extraction complète. Le builder structuré lit les membres via
le serveur CPK authentifié, conserve les formats `full`, `header` et `unverified` parsables,
réactualise les extensions classées `unknown` et enregistre `deferred` pour les formats qui n’ont
pas encore de résumé JSON. Les erreurs de lecture et de parsing restent visibles sans interrompre
l’ingestion.

## Recherche

`openDbxv2Db(path, { embedder })` puis `search(query, { lang, kinds, limit })` : FTS5 BM25 fusionné par RRF avec le cosinus e5 (multilingual-e5-small, 384 d) ; lexical seul sans vecteurs. Aussi `files`, `file`, `characters`, `messages`.

## Exécution (fabrique)

```sh
bun scripts/data/build-dbxv2-db.ts build      # index, CMS, MSG, chunks
bun scripts/data/build-dbxv2-db.ts plan       # volumes + commande tmux d'embedding
bun scripts/data/build-dbxv2-structured.ts plan
bun scripts/data/build-dbxv2-structured.ts run # formats structurés connus; jeton CPK requis
bun scripts/data/build-dbxv2-structured.ts run --format ema,emo # tranche ciblée et reprise
bun scripts/data/sync-dbxv2-redis.ts # miroir privé vers Redis dédié du VPS
```

Le builder structuré lit `DBXV2_DB_PATH`, `DBXV2_SERVER_URL`, `DBXV2_TOKEN`,
`SHENRON_DBXV2_SRC` et `SHENRON_DBXV2_LIB` depuis l’environnement protégé du job. Il ne journalise
pas le jeton et ne matérialise pas les octets bruts sur disque.

Redis reste une projection reconstruisible de SQLite : les snapshots versionnés contiennent les
fiches de fichiers, les index par format et CPK, les entrées MSG et les personnages CMS. Le pointeur
`dbxv2:active` bascule après l’écriture complète. Le service Redis dédié écoute uniquement sur
loopback et persiste sous `/games/private/shenron-dbxv2/redis/`; les octets des CPK ne sont pas copiés.

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

- Les parseurs MSG/CMS de `bun_re` sont utilisables par le builder structuré; les lecteurs TypeScript restent présents pour la construction historique de la base.
- Les `.emo` et `.ema` ont maintenant un parseur complet dans Bun OS, appuyé par Ghidra et validé sur les CPK. Le builder doit encore être exécuté sur l’ensemble de la base pour que ses résultats apparaissent dans SQLite.
- BAC, BCM, BDM, BCS, BSA, EAN et EMM restent au niveau `header` (pas de frame data complète pour les combats ou animations EAN).
- Enregistrement de chaîne MSG `{offset, chars, bytes}` : UTF-16LE quand `bytes == chars*2 + 2`, UTF-8 quand `bytes == chars + 1` (la plupart des clés, quelques lignes). Lire ces dernières en UTF-16 produisait des identifiants CJK illisibles et perdait des entrées ; corrigé dans `msg.ts` (base reconstruite, voir le journal de build).
- sha256 calculé pour les genres `text` et `data` uniquement.
