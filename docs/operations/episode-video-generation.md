<!-- SPDX-License-Identifier: Apache-2.0 -->

# Génération des captures et GIF des épisodes

Le lecteur Shenron et sa timeline utilisent le même MP4 publié sur le CDN. Le
serveur décode les captures et GIF avec `Bun.Video`, dans le runtime embarqué du
binaire `shenron-server`. Le navigateur ne décode pas une seconde copie de la
vidéo pour produire ces exports.

## Source et cache

`episodeTimelineSource` admet uniquement les épisodes 875, 876 et 877 et une URL
immuable `https://cdn.dragonballfr.com/media/episodes/<id>/<sha256>/source.mp4`.
L'identifiant du chemin doit correspondre à l'épisode demandé. Les paramètres,
identifiants de connexion, ports et origines étrangers sont refusés. La source
vient de `players` ; un champ `videoUrl` seul n'active pas cette route.

Le cache est `SHENRON_HOME/cache/episode-video/<id>-<sha256>.mp4`. En production,
`SHENRON_HOME=/var/lib/shenron` doit rester monté sur le stockage persistant et
inscriptible par l'utilisateur du site. Le `/tmp` du conteneur est limité à
64 Mio : il ne convient pas au MP4 E3 de 564 424 703 octets. Le serveur contrôle
le SHA-256 complet, la taille et la réponse HTTP avant de renommer une copie
temporaire ; la limite de source est de 1 Gio.

Le SHA-256 E3 qualifié le 25 octobre 2026 est
`d34399a0b71922d663667cdb2075659ae0b259bf56ecda9fef64ca1578173114`.
Les métadonnées mesurées sont 1920 × 1080, 1397,688 secondes, H.264 High/AAC,
24000/1001 images par seconde et 33 511 images. Les sous-titres français
incrustés ne constituent pas une piste VTT sélectionnable.

## API

`GET /api/episodes/877/timeline` retourne `durationSeconds`, `fps`, `frameCount`,
`width` et `height`. L'index représente une image source, pas un nombre de
secondes : pour 120 secondes sur E3, `Math.round(120 * fps)` donne 2877.

| Requête                                           | Résultat                   |
| ------------------------------------------------- | -------------------------- |
| `?kind=frame&index=2877`                          | WebP 320 × 180             |
| `?kind=gif&index=2877&duration=2&fps=6&width=320` | GIF animé de deux secondes |

Un GIF accepte une durée entière de 1 à 5 secondes, une cadence de 6, 12 ou
24 images/s et une largeur de 320, 480 ou 640 pixels. Le handler borne la
concurrence à deux opérations, la file d'attente à douze et son cache d'images
en mémoire à 32 Mio. Les requêtes identiques en cours partagent leur travail.
Une saturation répond 429 avec `Retry-After: 2`. Une requête invalide répond
400, une source absente 404 et un échec de génération 502 ; les erreurs portent
`Cache-Control: no-store`. Les sorties réussies sont publiques pendant 60 s.

## Livraison et vérification

Construire et activer une image scellée par les helpers Aphrody Infra décrits
dans `AGENTS.md`. Une URL vidéo accessible ou une frame stockée ne prouve pas
que cette image contient la nouvelle garde HTTP ni le moteur natif. Contrôler
le SHA de release actif, le label de l'image et `Bun.Video.available` dans son
exécutable réel avec `BUN_BE_BUN=1`.

Après activation de la garde 877, rétablir au besoin le player CDN Shenron par
l'API administrative sous préconditions CAS fraîches. Limiter le PATCH à
`players` et relire indépendamment la fiche ; préserver son récit, ses images,
ses pistes et les autres champs éditoriaux. Une garde encore ancienne répond
404 même pour une requête 877 invalide ; la nouvelle garde laisse le handler
répondre 400 à un paramètre inconnu avant toute génération.

Vérifier ensuite les métadonnées publiques, un WebP décodé, un GIF dont les
images et délais sont réellement comptés, puis la lecture et un seek dans
Chrome. Le probe de l'image c075be1e a produit un WebP 320 × 180 et un GIF de
12 images / 2000 ms sur le vrai E3 ; cela qualifie ce binaire isolé et ne vaut
pas, à lui seul, preuve de son activation en production. Une répétition au même
SHA prouve la stabilité des octets ; elle ne démontre pas un hit du cache LRU
serveur sans signal dédié.

Les reçus, scripts de qualification et médias restent dans `var/reports/`, hors
Git et hors du payload public. Aucun cookie, HAR, jeton, source privée ni
configuration d'administration ne rejoint les notes de release.
