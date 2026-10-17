# Serveur DBXV2 à la demande (privé)

`scripts/ops/dbxv2-serve.ts` sert les CPK de Dragon Ball Xenoverse 2 comme un CDN, à la demande : seuls
la table des matières et les plages demandées sont lues, rien n'est extrait d'avance.

**Données privées** (Bandai Namco / Dimps, hors attestation Toei/Shueisha). Le serveur n'est jamais
exposé publiquement, jamais déployé en service permanent, et aucun octet servi n'est commité.

## Garde-fous

- Jeton obligatoire : `Authorization: Bearer <DBXV2_TOKEN>` (16 caractères minimum, comparaison à temps
  constant). Sans jeton valide : 401. Sans `DBXV2_TOKEN`, le processus refuse de démarrer.
- Liaison `DBXV2_HOST` (défaut `127.0.0.1`) ; les adresses génériques (`0.0.0.0`, `::`) sont refusées :
  utiliser le loopback ou une adresse mesh précise.
- Réponses `Cache-Control: private`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`, pas de CORS.

## Aucun parseur ici

Les opérations viennent du paquet `@shenron/dbxv2` (dépôt `aphrody-labs/bun-distribution`, branche `os`,
rev `08c6ed5d71`, `packages/shenron-dbxv2`, doc `docs/re/DBXV2.md`) : `cpkFind`, `cpkRead`, `embToPng`,
`audioToWav`, `usmToVideo`, `modelJson`, `modelGlb`. Le script le charge par chemin (`DBXV2_PKG_DIR`) ;
Shenron ne dépend pas de bun-distribution. La bibliothèque native est `libshenron_dbxv2.so`
(`DBXV2_LIB`).

## Configuration

| Variable | Défaut |
| --- | --- |
| `DBXV2_TOKEN` | obligatoire |
| `DBXV2_PKG_DIR` | `~/src/bun-os/packages/shenron-dbxv2` |
| `DBXV2_LIB` | `target/release/libshenron_dbxv2.so` du paquet (ou `SHENRON_DBXV2_LIB`) |
| `DBXV2_CPK_DIR` | `/games/SteamLibrary/steamapps/common/DB Xenoverse 2/cpk` (fabrique) |
| `DBXV2_HOST` / `DBXV2_PORT` | `127.0.0.1` / `8788` |
| `DBXV2_CACHE_DIR` | `~/.cache/shenron/dbxv2-serve` (hors dépôt) |
| `DBXV2_CACHE_MAX_MB` | `4096` |

## Routes (GET)

- `/cpk` : liste des CPK (nom, taille, date).
- `/cpk/:name/find?q=ext:emb|glob|chemin&limit=&offset=` : entrées (`total`, pagination, 10 000 max).
- `/cpk/:name/raw/*path` : octets décompressés ; `Range`, `ETag`, `If-None-Match` (304), 416.
- `/cpk/:name/png/*path?index=N` : entrée d'un EMB en PNG.
- `/cpk/:name/wav/*path?cue=N` : sous-son d'un ACB en WAV (404 pour un ACB en flux, forme d'onde dans l'AWB voisin).
- `/cpk/:name/video/*path` : USM en MP4, WebM ou MPEG-2 (type déduit du contenu).
- `/cpk/:name/model/*path.json|.glb` : EMD assemblé ; EMB et ESK frères de même nom, ou `?emb=&esk=`.

Les conversions sont calculées une fois puis servies depuis le cache disque borné (éviction du plus ancien
accès), avec `Range`. Les appels natifs sont synchrones : un décodage lourd bloque les autres requêtes.
Erreurs : 404 (inconnu), 422 (entrée non décodable), 500 (échec natif, détail dans le journal seul).

## Lancer et qualifier (fabrique VPS, tmux, jamais permanent)

```sh
export DBXV2_TOKEN=$(head -c24 /dev/urandom | base64 | tr -dc A-Za-z0-9)xxxxxxxx
tmux new-session -d -s dbxv2-srv -e DBXV2_TOKEN "bun scripts/ops/dbxv2-serve.ts > srv.log 2>&1"
curl -H "Authorization: Bearer $DBXV2_TOKEN" localhost:8788/cpk
tmux kill-session -t dbxv2-srv
```

Tests : `bun test scripts/ops/dbxv2-serve.test.ts` (authentification, Range, ETag, cache, avec un backend
factice) ; `DBXV2_LIVE=1` ajoute un échantillon réel par format (raw, EMB, ACB, USM, EMD) sur la fabrique.
Qualifié le 2026-10-17 : 14 tests verts, 401 sans jeton, liste authentifiée, arrêt vérifié.

## Limite connue

`modelJson` renvoie un `ModelJson` ; il manque l'adaptateur `ModelJson` vers l'`AssembledCharacterModel`
de `model_serve` (non écrit ici).
