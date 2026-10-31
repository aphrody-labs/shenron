# Serveur DBXV2 à la demande

`scripts/ops/dbxv2-serve.ts` sert les CPK de Dragon Ball Xenoverse 2 à la demande : seules la table
des matières et les plages demandées sont lues, rien n'est extrait d'avance. La page publique
`/games/xenoverse-2` liste les archives, parcourt leurs entrées et charge au clic les formats pris
en charge dans le moteur WebAssembly du navigateur. Les 37 Go d'archives ne sont ni copiés dans Git,
ni inclus dans l'image, ni téléchargés en entier pour afficher le catalogue.

Le propriétaire déclare le 2026-10-20 que l'accord confidentiel Toei, Shueisha et Bandai Namco
couvre Xenoverse 2, et demande la publication des CPK et données DBXV2 sur dragonballfr.com.
L'accord n'a pas été vérifié indépendamment. Le serveur de données reste protégé par jeton et
joignable uniquement sur le mesh WireGuard ; seul le relais GET/HEAD explicite du site rend le
catalogue et les entrées choisies accessibles au public. Aucun octet servi n'est commité.

## Garde-fous

- Jeton obligatoire : `Authorization: Bearer <DBXV2_TOKEN>` (16 caractères minimum, comparaison à temps
  constant). Sans jeton valide : 401. Sans `DBXV2_TOKEN`, le processus refuse de démarrer.
- Liaison `DBXV2_HOST` (défaut `127.0.0.1` ; fabrique : `10.200.77.1`, interface `wg1`) ; les adresses génériques (`0.0.0.0`, `::`) sont refusées :
  utiliser le loopback ou une adresse mesh précise.
- Réponses `Cache-Control: private`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`, pas de CORS.

## Aucun parseur ici

Les opérations viennent du paquet `@shenron/dbxv2` (dépôt `aphrody-labs/bun-distribution`, branche `os`,
rev `08c6ed5d71`, `packages/shenron-dbxv2`, doc `docs/re/DBXV2.md`) : `cpkFind`, `cpkRead`, `embToPng`,
`audioToWav`, `usmToVideo`, `modelJson`, `modelGlb`. Le script le charge par chemin (`DBXV2_PKG_DIR`) ;
Shenron ne dépend pas de bun-distribution. La bibliothèque native est `libshenron_dbxv2.so`
(`DBXV2_LIB`).

## Configuration

| Variable                      | Défaut                                                                  |
| ----------------------------- | ----------------------------------------------------------------------- |
| `DBXV2_TOKEN`                 | obligatoire                                                             |
| `DBXV2_PKG_DIR`               | `~/src/bun-os/packages/shenron-dbxv2`                                   |
| `DBXV2_LIB`                   | `target/release/libshenron_dbxv2.so` du paquet (ou `SHENRON_DBXV2_LIB`) |
| `DBXV2_CPK_DIR`               | `/games/SteamLibrary/steamapps/common/DB Xenoverse 2/cpk` (fabrique)    |
| `DBXV2_HOST` / `DBXV2_PORT`   | `127.0.0.1` / `8788`                                                    |
| `DBXV2_WORKERS`               | `4` (1 à 16)                                                            |
| `DBXV2_CACHE_DIR`             | `~/.cache/shenron/dbxv2-serve` (hors dépôt)                             |
| `DBXV2_CACHE_MAX_MB`          | `4096`                                                                  |
| `DBXV2_VIDEO_BIN`             | `shenron-video` du PATH (`~/.local/bin` sur la fabrique)                |
| `DBXV2_MP4_MAX_SECONDS`       | `90` (durée maximale d'un segment `/mp4/`)                              |
| `DBXV2_TRANSCODE_CONCURRENCY` | `2` transcodages simultanés                                             |

## Routes (GET, HEAD)

- `/health` : sonde de vie, sans jeton, sans donnée (`{"ok":true}`), jamais bloquée par une conversion.
- `/cpk` : liste des CPK (nom, taille, date).
- `/cpk/:name/find?q=ext:emb|glob|chemin&limit=&offset=` : entrées (`total`, pagination, 10 000 max).
- `/cpk/:name/raw/*path` : octets décompressés ; `Range`, `If-Range`, `ETag`, `If-None-Match` (liste, `*`, faible) → 304, 416.
- `/cpk/:name/png/*path?index=N` : entrée d'un EMB en PNG.
- `/cpk/:name/wav/*path?cue=N` : sous-son d'un ACB en WAV (404 pour un ACB en flux, forme d'onde dans l'AWB voisin).
- `/cpk/:name/video/*path` : USM en MP4, WebM ou MPEG-2 (type déduit du contenu).
- `/cpk/:name/mp4/*path?t=S&d=S` : segment du même USM transcodé à la demande en MP4 fragmenté H.264 High
  (yuv420p), sans audio (l'USM n'expose pas son audio), `Range` compris. `t` = début (s, défaut 0), `d` = durée
  (plafonnée à `DBXV2_MP4_MAX_SECONDS`). C'est le format web : `/video/` rend le flux natif (MPEG-1/2, illisible
  dans Chrome). Un USM déjà en MP4 est servi tel quel.
- `/cpk/:name/model/*path.json|.glb` : EMD assemblé ; EMB et ESK frères de même nom, ou `?emb=&esk=`.

## Accès public par le site, WASM et CDN

Le relais `apps/site/src/app/api/public/dbxv2/cpk/[...path]/route.ts` expose uniquement les
opérations GET/HEAD autorisées (`/cpk`, `find`, `raw`, `png`, `wav`, `video`, `mp4`, `model`). Il
injecte `DBXV2_TOKEN` côté serveur, transmet les plages HTTP et ne relaie ni cookie ni en-tête
d'authentification du navigateur. Les listes sont mises en cache une heure et les entrées avec ETag
une journée côté CDN, avec revalidation ; erreurs et indisponibilités ne sont jamais mises en cache.
Le CDN conserve `/_next/static`/WASM et relaie `/api/public/dbxv2/cpk/*` vers ce handler par le
vhost NGINX `cdn.dragonballfr.com`. Le navigateur n'accède jamais au mesh ni au secret.

Le relais reste désactivé sans `DBXV2_PUBLIC_CPK=1`, `DBXV2_SERVER_URL` et `DBXV2_TOKEN`. Ces trois
valeurs sont injectées dans l'environnement privé du site par Infra. La page ne télécharge que
l'entrée sélectionnée (maximum analysable de 16 Mio) et appelle `parseGameDataFile` en WASM ; les
autres formats restent listés avec leur taille sans être chargés. Les gros CPK ne sont jamais
aspirés dans le navigateur en bloc.

## Fonctionnement

- Tous les appels natifs (index, lecture, EMB→PNG, audio, vidéo, modèles) s'exécutent dans un pool borné de
  Bun Workers (`scripts/ops/dbxv2-worker.ts`, une instance du backend par worker) : le fil HTTP ne fait
  aucun appel synchrone et `/health` répond pendant les conversions lourdes.
- File d'attente bornée (256) : au-delà, 503. Une conversion qui dépasse 120 s donne 504 et le worker est remplacé ;
  un worker qui plante est remplacé, la requête fautive reçoit 500.
- Les requêtes identiques concurrentes partagent un seul calcul ; le résultat va au cache disque borné
  (éviction du plus ancien accès) puis est servi avec `Range`. Les index (TOC) sont mémoïsés par version de CPK.
- Transcodage `/mp4/` : binaire Rust pur `shenron-video` (crate `crates/shenron-video` : décodeur MPEG-1/2
  `filmcraft-mpeg2v`, encodeur H.264 `filmcraft-h264enc`, muxeur fMP4 `filmcraft-isobmff`), sans ffmpeg ni C.
  Octets par stdin/stdout, aucun fichier de travail ; le décodage démarre à l'image intra précédant `t`. Le segment
  entre dans le cache disque borné (clé = USM + `t` + `d`). Concurrence limitée (file FIFO), délai 300 s (504),
  binaire absent : 503, échec : 500 (stderr au journal seul). Débit mesuré : voir `docs/products/shenron-video.md`.
- Journal : `MÉTHODE chemin statut durée`, sans jeton ni paramètres de requête.
- Erreurs : 404 (inconnu), 500 (échec natif, détail dans le journal seul), 503 (file pleine), 504 (délai).

## Service permanent (hôte de service)

Unité systemd utilisateur (même mécanisme que `bun-os-lancache` ; linger actif) :
`~/.config/systemd/user/dbxv2-serve.service`.

```ini
[Unit]
Description=Shenron DBXV2 private on-demand CPK server (mesh only)
After=network-online.target

[Service]
EnvironmentFile=%h/.config/shenron/dbxv2-serve.env
ExecStart=%h/.local/bin/bun %h/src/shenron/scripts/ops/dbxv2-serve.ts
Restart=always
RestartSec=3
Slice=bun-os-gaming.slice

[Install]
WantedBy=default.target
```

`~/.config/shenron/dbxv2-serve.env` (mode 600, jamais dans Git) contient `DBXV2_TOKEN=…`,
`DBXV2_HOST=10.200.77.1`, `DBXV2_PORT=8788`. Le jeton n'apparaît ni dans les arguments, ni dans le journal.

Exploitation :

```sh
systemctl --user status dbxv2-serve
journalctl --user -u dbxv2-serve -n 50 --no-pager
systemctl --user restart dbxv2-serve
curl -s http://10.200.77.1:8788/health        # depuis un pair du mesh
```

Récupération :

- Plantage ou arrêt : `Restart=always` relance en 3 s. Échec persistant : lire le journal ; causes
  habituelles : `DBXV2_PKG_DIR` absent, bibliothèque native non construite (`DBXV2_LIB`), port occupé,
  `wg1` indisponible (l'adresse mesh n'existe pas : le service retente jusqu'au retour de l'interface).
- Rotation du jeton : régénérer la ligne `DBXV2_TOKEN` du fichier d'environnement (`chmod 600`), puis `restart`.
  Communiquer le nouveau jeton hors Git.
- Cache : supprimer `~/.cache/shenron/dbxv2-serve` est sûr (il se reconstruit à la demande).
- Mise à jour : mettre à jour le checkout du service (`git -C <checkout> pull --ff-only`), puis
  `systemctl --user restart dbxv2-serve` applique.

## Tests

`bun test scripts/ops/dbxv2-serve.test.ts` : authentification, Range/If-Range, ETag, HEAD, cache, pool de
workers avec un backend factice bloquant (20 requêtes mixtes concurrentes, `/health` < 150 ms pendant les
conversions, déduplication), transcodage `/mp4/` (segments, plafond de durée, cache, Range, transcodeur factice). Le codec Rust se teste par
`cargo test -p shenron-video` sur la fabrique. `DBXV2_LIVE=1` ajoute un échantillon réel par format sur la fabrique.

## Adaptateur moteur

`crates/shenron-engine/src/render/model_adapter.rs` : `model_from_json(json, textures)` convertit le
`ModelJson` (positions, normales, uv, indices, `textureIndex`, squelette) en `AssembledCharacterModel`
consommé par `model_serve`. Le JSON ne contient pas de pixels : textures fournies par l'appelant (route
`/png`) ou gris neutre de la taille déclarée. Géométrie incohérente (indices hors bornes, longueurs
divergentes) refusée.
