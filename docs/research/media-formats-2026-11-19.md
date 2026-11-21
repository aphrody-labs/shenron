# Formats, codecs et compression des médias : relevé du 2026-11-19

Relevé fait le 2026-11-19 pour le dépôt (HEAD `66187f96`) et le CDN `https://cdn.dragonballfr.com`. Chaque ligne porte sa source. Une valeur marquée « point de départ » n'a pas été mesurée ici : elle se règle sur `fr2` avant d'être figée. Les versions datent du jour indiqué : relancer le relevé avant de fixer une dépendance. Contexte : ADR 0009 (étapes 3 et 4, `shenron-edge` et Garage).

## Sources et limites

- `web-features` 3.46.0 (npm, `data.json`) pour les statuts Baseline.
- `caniuse-lite` 1.0.30001826 (npm) pour les parts d'usage. Dernières versions de navigateur qu'il contient : Chrome 157, Edge 156, Firefox 160, Safari 27.2. Les pourcentages sont la somme de `usage_global` par version de navigateur : ils sont approximatifs. `y` = pris en charge, `a` = partiellement.
- API crates.io, registre npm, `gh api` (tête des dépôts et publications), requêtes `GET`/`HEAD` sur le CDN public, mesures locales.
- Mesures d'images : une seule image par classe (une planche de manga, une image d'anime), toutes deux des dérivés déjà compressés avec perte pris sur le CDN. Le PSNR est calculé contre l'image source décodée, donc il ne mesure pas la perte par rapport à l'original.
- Contrôles SVG par rastérisation `resvg` 2.6.2 (`@resvg/resvg-js`), pas par un navigateur.
- Aucun encodage JPEG XL n'a été lancé : `sharp` 0.35.5 précompilé n'a pas JXL et le poste n'a pas `cjxl`.
- Aucun jeu de données sur la part de décodage matériel n'a été récupéré : aucune part n'est donnée.

## État du dépôt

Sources : `git ls-files` (7815 fichiers suivis) et tailles sur disque par script Bun ; `rg` ; manifestes (`Cargo.toml`, `Cargo.lock`, `package.json`).

| Sujet | État lu | Source |
| --- | --- | --- |
| Crates image | `image` 0.25.10, `fast_image_resize` 6.1.0, `webp` 0.3.1, `brotli` 9.1.3, `zstd` 0.14.4 ; `ravif` 0.13.0 et `rav1e` 0.8.1 dans le verrou | `Cargo.toml`, `Cargo.lock` |
| Encodeur JS | `sharp` ^0.35.5 ; `@napi-rs/canvas` 1.0.9 | `package.json:115`, `:28` |
| WebP à la publication | `sharp` `.webp({quality 82, effort 4})`, accepté seulement si PSNR >= 38 (défaut) et plus petit que l'entrée | `packages/images/src/webp.ts:34,47,66` |
| Optimiseur sans perte | `jpegtran -optimize`, `oxipng -o max --strip safe`, `zopflipng`, `gifsicle -O3`, `cwebp -lossless -z 9 -exact`, brotli q11 lgwin 24 et gzip zopfli `--i15` en `.br` et `.gz` voisins. Pas d'AVIF, pas de JXL, pas de transcodage avec perte | `scripts/ops/cdn-optimize.ts:3-26,401-474,558,570` |
| AVIF à la volée | bot : `@napi-rs/canvas`, négociation `Accept` (avif, webp, png), webp qualité 75, avif `{quality 75, speed 7}` ; site : `next/image` formats `["image/avif","image/webp"]`, qualités `[70,75]` | `apps/bot/src/api/server.ts:346-380`, `apps/site/next.config.ts:199-214` |
| Vidéo | `libx264 -preset veryfast -crf 23 -g 48`, `yuv420p`, AAC 128 k stéréo, `hls_time 6`, segments `.ts`, `independent_segments` | `crates/shenron-tv/src/ingest.rs:65-79` |
| SVG | ni `svgo` ni `oxvg` dans `package.json`, `justfile` ou `scripts` | `rg` |
| Codecs absents | `rg` ne trouve ni `ravif` (hors verrou), ni `svt-av1`, `libaom`, `avifenc`, `jxl`, `jpegxl`, `libopus`, `vp9`, `av1` dans apps, packages, crates, scripts, deploy | `rg` |
| Bord | `shenron-edge` sans code de compression ; Pingora 0.9.1 | `crates/shenron-edge/Cargo.toml:33`, `rg` sur `src` et `deploy/edge` |
| Compression du Worker actuel | zstd (préféré) ou br via `CompressionStream` au niveau par défaut, seulement pour text, json, javascript, wasm, xml, svg, `font/ttf`, `font/otf`, taille >= 256 o ; jamais pour images, mp3, mp4, ni pour les réponses `Range` | `deploy/cloudflare/cdn-worker.ts:108-137,636-651` |
| nginx des passerelles | gzip niveau 6 à la volée pour text, json, js, xml, svg ; ni brotli, ni zstd, ni `gzip_static`/`brotli_static` (seul `deploy/nginx/ue-game-vfs.conf` les active, pour wasm) | `deploy/docker/compose-gateway.nginx.conf:38-43,72-89,278-280`, `deploy/docker/all-in-one/nginx.conf:38-42,67-75,144` |

### Inventaire des médias suivis

Source : `git ls-files` plus tailles sur disque. 1443 fichiers, 134 812 508 o.

| Extension | Fichiers | Octets |
| --- | --- | --- |
| png | 261 | 35 906 299 |
| otf | 1 | 32 682 580 |
| webp | 514 | 19 636 840 |
| jpg | 261 | 16 461 906 |
| gif | 125 | 7 672 751 |
| woff2 | 135 | 6 952 496 |
| wasm | 3 | 4 289 780 |
| ttf | 15 | 3 725 324 |
| mp3 | 49 | 3 522 993 |
| m4a | 2 | 2 698 120 |
| svg | 63 | 759 890 |
| wav | 8 | 349 624 |
| avif | 1 | 106 619 |
| ico | 2 | 27 530 |
| glb | 3 | 19 756 |

Aucun mp4, webm, mkv, jxl, heic, opus, ogg ni flac suivi. `data/` (426 fichiers, `MAP.tsv` 46,4 Mo) ne contient que json, jsonl, md, html.

| Zone (`MAP.tsv`) | Fichiers | Octets | Contenu principal |
| --- | --- | --- | --- |
| `apps/site` | 431 | 54 396 017 | png 57 (16,3 Mo), webp 124 (11,0 Mo), jpg 39 (10,4 Mo), woff2 135 (7,0 Mo), mp3 49, ttf 10, m4a 2, wav 8, avif 1, glb 3 |
| `packages/ui` | 117 | 40 922 379 | otf 1 (32,7 Mo), webp 40 (5,5 Mo), png 20 (2,3 Mo), svg 55 |
| `apps/bot` | 844 | 22 989 343 | png 147 (7,9 Mo), gif 125 (7,7 Mo), jpg 218 (3,5 Mo), webp 349 (3,1 Mo), ttf 5 |
| `docs` | 31 | 9 313 038 | png 29 (9,2 Mo), jpg 2 |
| `crates/koharu-ml` | 4 | 2 473 063 | jpg 2 (fixtures de bench, 2,4 Mo), png 2 |
| `packages/engine` | 1 | 2 040 613 | wasm |
| `packages/koharu` | 1 | 1 899 442 | wasm |
| `packages/pipeline` | 1 | 349 725 | wasm |
| `themes` | 4 | 260 161 | svg |
| `crates/shenron-desktop` | 7 | 73 915 | png 5, ico 1, svg 1 |
| `scripts` | 1 | 67 794 | webp |
| `plugin` | 1 | 27 018 | png |

Plus gros fichiers : `packages/ui/src/koharu/assets/NotoSansCJK-VF.otf` 32 682 580 o (référencé par `@font-face` à `packages/ui/src/koharu/styles.css:6`, `format("opentype")`, soit 24 % des octets de médias suivis) ; `apps/bot/assets/sanctions/jail.gif` 3 855 110 o ; `apps/site/public/banners/banner-19.png` 2 877 852 o, `banner-09.png` 2 824 104 o, `banner-03.png` 2 722 840 o.

Écart de comptage : le rapport de recherche compte 123 SVG (985 186 o), 554 webp, 355 png, 261 jpg et 183 fichiers de police (77 194 388 o) sur le disque ; l'inventaire ci-dessus compte les fichiers suivis par git (63 svg, 514 webp, 261 png). L'écart n'a pas été réconcilié. Les mesures SVG de la section 2 portent sur les 123 fichiers.

## État du CDN public

Source : `HEAD` sur `https://cdn.dragonballfr.com` avec `Accept-Encoding: zstd, br, gzip` et `Accept: image/avif,image/webp,*/*`. Le manifeste (`.../assets/ext/cf-migrate-20261011/manifests/index.json`, `cdn-worker.ts:61`) répond 404 en public ; substitut : 187 URL `cdn.dragonballfr.com` extraites du code suivi (hors docs, `.agents`, `.claude`) : 141 en 200, 46 en 404 (fixtures de test comme `/a.png`). `Server: cloudflare`, HTTP/3 annoncé. Parmi les 141 : jpg 78, webp 29, png 21, mp3 6, json 3, svg 2, mp4 1, ico 1.

| Constat | Valeur observée |
| --- | --- |
| `Cache-Control` sur les 141 | 115 x `max-age=86400, stale-while-revalidate=604800` ; 22 x `immutable` ; 3 x `no-store` ; 1 x `604800 swr 2592000` |
| `Content-Encoding` sur les 141 | 6 x zstd (json, svg, ico) ; 135 sans encodage (images, mp3, mp4) |
| Négociation d'image | aucune : `Accept: image/avif` renvoie `image/jpeg` ; les voisins `.avif` et `.webp` de `/assets/manga/DBFC/ch1/023.jpg` et d'un `/dragonball-super/<sha>.png` répondent 404 ; `/sfx/click.opus` et `/sfx/click.m4a` répondent 404 |
| Pages de manga | `/assets/manga/DBFC/chN/NNN.jpg`, 310 288 à 584 944 o, `max-age=86400` |
| Objets adressés par hash | `/dragonball-super/<64 hex>.<ext>` en `max-age=86400` sur 27 URL ; l'expression d'immutabilité (`cdn-worker.ts:99-102`) exige `.` ou `-` avant le hash, `/` ne convient pas |
| Polices | `font/woff2`, sans encodage, immutables un an |
| Vidéo | `/media/episodes/875/<sha>/source.mp4` : 681 525 411 o, `immutable`, `Accept-Ranges: bytes`, premiers octets `ftypisom ... avc1`, `moov` à l'offset 0x20 (H.264, démarrage rapide) |

## 1. Images

| Format / outil | Version (date) | Prise en charge (source) | Usage recommandé ici | Réglages |
| --- | --- | --- | --- | --- |
| AVIF | libavif 1.4.2 (2026-05-26) ; libaom 3.15.1 dans `sharp` | `web-features` : Baseline high, low 2024-01-25, high 2026-07-25 ; `caniuse` y 96,69 %. Chrome 85, Edge 121, Firefox 93, Safari 16.1 (images fixes, partiel, macOS 13+) | Format avec perte principal : images d'anime, photos, couvertures, pages de manga ; précalculé à la publication sur `fr1` | mesures ci-dessous ; `ravif` : qualité 80, vitesse 5 par défaut (source de la crate) |
| WebP | libwebp v1.6.0 ; `sharp` 0.35.5 | Baseline high (2023-03-16) ; `caniuse` y partout | Repli d'AVIF ; garder les WebP existants | q80 effort 6 ; sans perte seulement pour sprites et interface |
| JPEG XL | libjxl v0.13.0 (2026-11-11) ; `jxl-rs` 0.8.0 (2026-10-19, décodeur) | `web-features` : Baseline false. Chrome 155 (2026-10-06), Firefox 158 (2026-10-13), Safari 27 partiel (fixe seulement, sans progressif), Edge non à 156. `caniuse` y 53,99 %, a 15,26 % | Pas de format principal. `<source type="image/jxl">` optionnel pour le lecteur de manga, seulement après un banc d'essai | non mesuré. Notes libjxl 0.13.0 : brotli 1.2.1 pour une CVE et correctifs de sécurité du décodeur. `jpegxl-rs` 0.16.0 lie encore libjxl 0.12.0 : compiler contre libjxl 0.13 système ou attendre |
| Optimiseur PNG | oxipng 10.2.1 (2026-09-02) | sans objet | PNG qui doivent rester PNG (favicons, OG, les 261 suivis) | `-o 4 --strip safe --alpha` (exemple du README) ; `-o max` ou zopfli pour les actifs rarement reconstruits |
| Encodeur AVIF Rust | `ravif` 0.13.0 (2026-01-19, `rav1e` 0.8.1, dernière version de `rav1e` 2025-06-16) ; crate `libavif` 0.15.0 sur libavif 1.4.2 (2026-11-13) | `image` 0.25.10 : fonctions avif, webp, png, jpeg ; pas de fonction jxl | `ravif` est en Rust pur et n'a pas de mode sans perte ; `libavif-sys` si sans perte ou SVT-AV1 | `Encoder::new().with_quality(q).with_speed(4)` ; threads via la fonction `rayon` |
| JXL en Rust | `jxl` 0.8.0 et `jxl-oxide` 0.12.6 (décodage seul) ; `zune-jpegxl` 0.5.2 (encodeur « modular ») ; `jpegxl-rs` 0.16.0 | descriptions crates.io | encoder via `jpegxl-rs` seulement si JXL est adopté | sans objet |
| `Bun.Image` (Bun 1.4.5) | intégré | méthodes avif, heic, jpeg, png, webp ; pas de jxl | Pas pour la publication : backend `system` ici, l'encodage AVIF a échoué (« Image: encode failed ») alors que WebP et HEIC ont marché | garder `Bun.Image` pour WebP et `metadata()` |
| `sharp` | 0.35.5 (2026-09-27) | libvips 8.18.7, libheif 1.23.5, libaom 3.15.1, mozjpeg 0826579 ; sans jxl | encodeur de publication côté Bun sur `fr1` | voir mesures |

Mesures avec `sharp` 0.35.5 (taille, PSNR, temps) :

| Échantillon | Encodage | Taille | PSNR | Temps |
| --- | --- | --- | --- | --- |
| Planche de manga 1662x2560, source JPEG 489 511 o | avif q50 e4 4:2:0 | 247 756 o (51 %) | 35,4 dB | 526 ms |
| | avif q60 e6 4:4:4 | 349 692 o (71 %) | 39,3 dB | 1630 ms |
| | webp q80 e6 | 459 486 o (94 %) | 38,5 dB | 505 ms |
| | mozjpeg q80 | 531 404 o (109 %) | 39,3 dB | 280 ms |
| | webp sans perte | 3 132 304 o | inf | 1438 ms |
| | avif sans perte | 4 340 599 o | inf | 1303 ms |
| | avif niveaux de gris q60 e6 | 296 895 o | 39,8 dB | 1012 ms |
| | avif niveaux de gris q40 e6 | 150 883 o | 34,0 dB | 1155 ms |
| Image d'anime 1440x810, source WebP 60 362 o | avif q50 e4 | 23 591 o | 40,7 dB | 153 ms |
| | avif q60 e6 4:4:4 | 33 338 o | 43,4 dB | 616 ms |
| | webp q80 e6 | 41 764 o | 42,4 dB | 86 ms |
| | mozjpeg q80 | 67 503 o | 42,4 dB | 56 ms |

Lecture : à PSNR égal (39,3 dB) l'AVIF q60 4:4:4 pèse 349 692 o contre 531 404 o pour mozjpeg, soit 34 % de moins sur la planche. Sur l'image d'anime, l'AVIF à 43,4 dB (33 338 o) est 20 % plus petit que le WebP q80 à 42,4 dB (41 764 o), pour un PSNR plus haut de 1 dB. Le sans perte coûte 6 à 9 fois la source JPEG sur la planche (scan bruité).

## 2. SVG

| Outil | Version (date) | État | Usage recommandé | Réglages |
| --- | --- | --- | --- | --- |
| svgo | 4.1.0 (2026-08-24) | en 4.1.0, `removeViewBox` et `removeTitle` ne sont pas dans `preset-default` (svgo avertit si on les surcharge) : le défaut garde `viewBox` et `title` | optimiseur de publication, toujours derrière une porte de pixels | configuration B ci-dessous |
| oxvg | 0.0.9 (2026-10-05, napi, wasm, crate ; tête 2026-11-18) | pré-1.0, le README dit « pas un remplaçant 1:1 de SVGO ». Sur `clouds-cc0.svg`, sortie par défaut différente de 358 918 octets de raster (delta max 42) contre 14 019 pour svgo par défaut | ne pas adopter ; retester à chaque version (9 à 35 ms contre 36 à 115 ms par fichier sur quatre échantillons) | sans objet |
| resvg / usvg | 0.50.0 (2026-11-11) ; `@resvg/resvg-js` 2.6.2 | sans objet | rastériseur de la porte d'identité | raster de 512 px de large, comparaison octet à octet |

Sur les 123 SVG du dépôt (985 186 o ; brotli q11 au total 256 699 o) :

| Chaîne | Identiques au pixel | Octets | Brotli q11 |
| --- | --- | --- | --- |
| svgo `preset-default`, multipass | 110/123 | 582 448 (-40,9 %) | 152 752 |
| Configuration B | 118/123 | 644 457 (-34,6 %) | 163 895 |
| Configuration C | 121/123 | 951 725 | 243 765 |
| B gardé, sinon C, sinon original | 123/123 par construction | 753 648 (-23,5 %) | 196 994 |

Avec la porte, 3 fichiers retombent sur C et 2 gardent l'original.

- Configuration B : `{multipass:true, plugins:[{name:"preset-default", params:{overrides:{cleanupNumericValues:false, mergePaths:false, convertTransform:false, convertPathData:{floatPrecision:5}}}}]}`.
- Configuration C : B avec `convertPathData:false`.
- Bissection des greffons : `cleanupNumericValues` est la cause principale de la dérive sur `wordmark.svg` (1300 octets de raster différents, 33 une fois désactivé ; le delta max de 64 reste tant que `mergePaths` n'est pas aussi désactivé). `mergePaths`, `convertPathData` et `convertTransform` causent le reste.
- Exemple en ligne : le logo du CDN pèse 55 207 o brut et 21 402 o avec le brotli du bord ; après svgo puis brotli q11, 5324 o, identique au pixel à 1024 px.

## 3. Vidéo

| Codec / outil | Version (date) | Prise en charge (source) | Usage recommandé | Réglages |
| --- | --- | --- | --- | --- |
| H.264 | ffmpeg n9.0.2 (2026-09-17 ; 9.0 le 2026-08-03) | `caniuse` mpeg4 y partout | échelon universel ; garder, passer en fMP4/CMAF | actuel : `veryfast`, `crf 23` |
| AV1 | SVT-AV1 v4.3.1 (2026-11-18/19) ; dav1d 1.5.5 (2026-11-16) ; libaom 3.15.x | `caniuse` y 81,05 %, a 15,26 %. Chrome 70, Edge 121, Firefox 67 ; Safari partiel (appareils à décodeur matériel seulement) | échelon efficace pour l'anime (aplats). Toujours sonder `MediaCapabilities` | notes SVT-AV1 4.3.1 : environ 14 à 15 % de CPU en moins au preset 5 contre 4.3.0. Point de départ non testé : `libsvtav1` preset 5 à 8, crf 28 à 34, GOP égal à la durée du segment |
| HEVC | x265 : tête du 2020-12-15 (périmé) | `caniuse` y 18,06 %, a 76,69 % (partiel = dépend du matériel ; Safari y) | ignorer : licences et prise en charge inégale, pas de gain sur AV1 pour ce site | sans objet |
| VP9 | libvpx via ffmpeg | pas d'entrée VP9 dans `caniuse` ; webm y 96,65 % | repli WebM seulement si AV1 et H.264 ne suffisent pas | sans objet |
| VVC | vvenc v1.14.0 (2026-01-21) ; vvdec v3.2.1 (2026-10-07) ; ffmpeg a un décodeur vvc natif | aucune entrée dans `caniuse-lite` ni `web-features` | non livrable aux navigateurs ; essais côté serveur seulement | sans objet |
| Empaquetage HLS | shaka-packager v3.9.3 (2026-07-27) ; GPAC v26.07.0 (2026-07-24) ; mp4ff v0.63.0 (2026-11-13) | `caniuse` : HLS natif y 85,42 % (Chrome, Safari, iOS, Samsung ; ni Edge ni Firefox) ; MSE y 84,16 %, a 13,34 %. Lecteurs : hls.js 1.7.4, shaka-player 5.3.5 | remplacer les segments `.ts` par du CMAF fMP4 : un seul jeu de segments sert H.264 et AV1 | `-hls_segment_type fmp4`, segments indépendants ; `-g` et `-keyint_min` égaux à la durée du segment |

`MediaCapabilities.decodingInfo` : Baseline high (2022-04-28, `web-features`) ; sert à choisir l'échelon.

## 4. Audio

| Codec | Version | Prise en charge (source) | Usage recommandé | Réglages |
| --- | --- | --- | --- | --- |
| Opus | libopus v1.5.2 (2024-09-11 ; tête 2026-11-18, non publiée) ; crate `opus` 0.4.0 | `caniuse` y 93,32 %, a 4,07 % (Safari partiel : macOS 15.4+) | clips de voix, actifs du bot et des jeux, en Ogg ou WebM | 96 à 128 kb/s stéréo (point de départ) |
| AAC | encodeur natif de ffmpeg | `caniuse` y 95,07 %, a 2,50 % (Firefox partiel : codecs du système) | rendition audio par défaut du HLS fMP4 | AAC-LC 128 kb/s (point de départ ; valeur déjà utilisée par `ingest.rs`) |

## 5. Polices

| Format / outil | Version | Prise en charge (source) | Usage recommandé | Réglages |
| --- | --- | --- | --- | --- |
| WOFF2 | google/woff2 v1.0.2 (2017-11-13 ; tête 2026-10-28) ; brotli 1.2.1 | `caniuse` y partout | seul format web ; retirer les copies ttf et otf des chemins publics | sans objet |
| Polices variables | sans objet | `caniuse` y 97,35 % | garder, mais réduire les axes | fixer ou limiter les axes inutilisés |
| Sous-ensembles | harfbuzz 15.1.0 (2026-11-04) ; `subset-font` 2.9.0 (2026-09-20) ; crates `subsetter` 0.2.6, `fontcull` 2.0.1, `read-fonts` 0.47.0 | sans objet | limitation d'axes à la publication avec `subset-font` ou `hb-subset` | voir mesures |

Mesures sur `apps/site/public/fonts/google-sans-flex/fa677db111b6e8c5.woff2` (472 392 o ; axes opsz 6-144, wdth 25-151, wght 1-1000, ROND 0-100). Ce nom de fichier n'existe plus (supprimé par le commit `290a9f51`) ; le dossier contient `7e93aa08665b6bd5.woff2` et `ba44afad26587de4.woff2` :

- `fonts.css` déclare `font-weight: 1 1000` et `font-stretch: 25% 151%`.
- `rg` dans `apps/site/src` ne trouve ni `wdth`, ni `ROND`, ni `font-stretch` hors `fonts.css` (seulement `font-variation-settings: normal`).
- Le fichier est déjà découpé par écriture : le seul sous-ensemble de glyphes gagne peu.

| Sous-ensemble (glyphes latins sauf mention) | Taille |
| --- | --- |
| glyphes seuls | 457 828 o (96,9 %) |
| wght 400-700 | 313 544 o (66 %) |
| wght 400-700, wdth 100 | 116 808 o (24,7 %) |
| wght 100-900, wdth 100, ROND 0 | 114 360 o (24,2 %) |
| idem, opsz fixé à 18 | 45 768 o (9,7 %) |

Fixer `opsz` change le dessin optique : décider par usage. Newsreader latin : 146 872 o passe à 101 988 o avec wght 400-700.

## 6. Compression de transfert

| Élément | Version | Prise en charge (source) | Usage recommandé | Réglages |
| --- | --- | --- | --- | --- |
| Brotli | google/brotli 1.2.1 (2026-10-21) ; crate `brotli` 9.1.3 | Baseline high (2020-03-19) | `.br` précompressé pour tout le texte | q11, lgwin 24 |
| Zstandard (Content-Encoding) | libzstd 1.5.7 (zlib de Node, crate `zstd` 0.14.4) | `web-features` : Baseline low (2026-02-11). Chrome et Edge 123, Firefox 126, Safari 26.3 (macOS 26.3+ ; iOS y). `caniuse` y 84,27 %, a 2,18 % ; Samsung non | deuxième variante précompressée, servie si `Accept-Encoding` le permet | niveau 19 |
| Compression Dictionary Transport | RFC 9842 (sept. 2025, Proposed Standard, rfc-editor) | `web-features` : Baseline false, Chrome et Edge 130 seulement. Position Mozilla positive (close 2023-06-13, bug 1882979) ; position WebKit « support » (issue 160, close 2024-05-06) | essai sur du JSON ou JS versionné seulement, en amélioration progressive | non mesuré (pas de version précédente à utiliser comme dictionnaire) |
| Implémentation au bord | Pingora (branche principale) : `compression/{brotli,gzip,zstd}.rs` ; `tower-http` 0.7.1 : `precompressed_{gzip,br,deflate,zstd}` | lu sur GitHub | `shenron-edge` sert des objets précompressés par négociation `Accept-Encoding` avec `Vary: Accept-Encoding` | sans objet |

Mesure sur le CDN : `https://cdn.dragonballfr.com/publications/manga-catalogue/index.json`, 725 757 o bruts, `Cache-Control: no-store`, derrière Cloudflare (`Server: cloudflare`).

| Encodage | Taille |
| --- | --- |
| gzip du bord | 91 628 o |
| br du bord | 78 983 o |
| zstd du bord | 79 681 o |
| gzip 9 local | 88 737 o |
| brotli q5 local | 74 379 o |
| brotli q11 lgwin 24 local | 62 692 o (687 ms d'encodage, 1,2 ms de décodage) |
| zstd 3 local | 79 712 o |
| zstd 19 local | 66 664 o (184 ms d'encodage, 0,8 ms de décodage) |
| zstd 22 local | 66 650 o |

Le brotli q11 précompressé est 20,6 % plus petit que le br du bord ; le zstd 19 est 16,3 % plus petit que le zstd du bord.

## 7. Conteneurs et archives

| Cas | Mesure | Recommandation |
| --- | --- | --- |
| JSON | section 6 | publier `.br` (q11) et `.zst` (19) à côté de chaque JSON ; brotli par défaut, zstd pour les clients qui préfèrent la vitesse |
| SQLite | seul `apps/bot/data/bot.db` (106 496 o) existe : brotli q11 1131 o, zstd 19 1325 o, gzip 9 2602 o. Fichier presque vide : non représentatif. Aucune mesure de livraison réelle | téléchargement entier : précompresser en br ou zstd. Accès par plages (VFS HTTP de sqlite-wasm) : fichier non compressé, ou format zstd cherchable (`contrib/seekable_format` de facebook/zstd existe) |
| Archives | non mesuré | garder les objets adressés par contenu (`_objects/<sha256>`, `deploy/garage/cdn-origin.ts`) tels quels ; ne précompresser que les types texte |

## Recommandation par classe de média

Les réglages marqués « point de départ » n'ont pas été mesurés sur le contenu réel ; ceux qui renvoient à une section l'ont été. Toutes les images de test sont des dérivés avec perte : si l'original existe, encoder depuis l'original, pas depuis le JPEG du CDN.

| Classe | Aujourd'hui (preuve) | Recommandation | Réglages exacts |
| --- | --- | --- | --- |
| Planches de manga | JPEG de 310 288 à 584 944 o sur le CDN, sans voisin avif ni webp (404), pas de négociation, `max-age=86400` | publier un AVIF et un WebP voisins de chaque JPEG à la publication sur `fr1` ; le navigateur choisit par `<picture>` (le CDN ne négocie pas) ; garder le JPEG comme dernier repli ; pas de sans-perte (6 à 9 fois la source) | AVIF q50-60 effort 6 ; entrée en niveaux de gris quand la page est monochrome (q60 : 296 895 o, 39,8 dB ; q40 : 150 883 o, 34,0 dB sur l'échantillon) ; repli WebP q80 effort 6 ; JXL seulement après banc d'essai |
| Images d'anime (frames) | WebP de 9 046 à 321 554 o sur le CDN, pas d'AVIF | AVIF primaire, WebP en repli ; 4:4:4 là où les bords de couleur plate comptent | AVIF q50 effort 4 (23 591 o, 40,7 dB) ou q60 effort 6 4:4:4 (33 338 o, 43,4 dB) ; WebP q80 effort 6 |
| Photos et couvertures | WebP/JPEG sans variante AVIF hors `next/image` | AVIF primaire | q60 effort 6 (point de départ, mesuré seulement sur manga et anime) |
| SVG du wiki | 123 fichiers, 985 186 o, pas d'optimiseur dans le dépôt | svgo configuration B derrière la porte de pixels `resvg` (B, sinon C, sinon original), puis brotli q11 et zstd 19 voisins | section 2 : `-23,5 %` en octets bruts, 196 994 o en brotli q11 sur 123/123 identiques au pixel ; PNG/UI : oxipng `-o 4 --strip safe --alpha` |
| Vidéo | H.264 `veryfast` `crf 23`, segments `.ts` de 6 s ; `source.mp4` de 681 525 411 o servi brut | passer en CMAF fMP4 ; garder H.264 comme échelon universel, ajouter AV1 pour l'anime, sonder `MediaCapabilities` côté client ; ignorer HEVC et VVC | `-hls_segment_type fmp4`, segments indépendants, `-g` et `-keyint_min` égaux au segment ; AV1 `libsvtav1` preset 5-8, crf 28-34 (point de départ, à régler sur `fr2`) |
| Audio | 49 mp3, 8 wav (349 624 o), 2 m4a suivis ; le CDN ne sert que du mp3 (opus et m4a en 404) | AAC dans le HLS fMP4 ; Opus pour clips et actifs ; compresser les 8 wav | AAC-LC 128 kb/s ; Opus 96-128 kb/s stéréo (points de départ) |
| Polices | 135 woff2 + 15 ttf + 1 otf de 32 682 580 o sans version woff2 ni sous-ensemble | WOFF2 seul ; supprimer ttf et otf des chemins publics ; limiter les axes de Google Sans Flex à la publication ; produire une version woff2 sous-ensemble de la police CJK | Google Sans Flex : wght 100-900, wdth 100, ROND 0 : 472 392 o passe à 114 360 o (24,2 %), opsz fixé à 18 : 45 768 o ; décider `opsz` par usage |
| JSON et SQLite | JSON sans `.br` ni `.zst` voisin, zstd à la volée par le Worker | `.br` q11 et `.zst` 19 voisins à la publication, servis par `shenron-edge` avec `Vary: Accept-Encoding` ; SQLite : précompresser pour un téléchargement entier, sinon laisser non compressé pour l'accès par plages | brotli q11 lgwin 24 : 62 692 o (725 757 o bruts) ; zstd 19 : 66 664 o |

### Transfert et cache

| Constat | Preuve | Action |
| --- | --- | --- |
| Les `.br` et `.gz` écrits par `cdn-optimize.ts` ne sont pas servis par les passerelles nginx (ni `brotli_static` ni `gzip_static`) | `compose-gateway.nginx.conf`, `all-in-one/nginx.conf` | servir les voisins précompressés dans `shenron-edge` (étapes 3 et 4 de l'ADR 0009) |
| Le Worker compresse à chaque requête au niveau par défaut | `cdn-worker.ts:125-137` ; mesure : br du bord 78 983 o contre 62 692 o précompressé | remplacé par la variante stockée |
| Objets `/dragonball-super/<sha>.<ext>` et pages `/assets/manga/**` en 86400 s alors que le contenu est adressé ou ne change pas | 27 URL observées ; `cdn-worker.ts:99-102` | étendre la règle d'immutabilité au séparateur `/` et aux chemins adressés par hash |
| `/assets` et `/wiki` en `expires 30d` + `public, no-transform`, sans `immutable` | `compose-gateway.nginx.conf:72-89` | `immutable` pour les chemins à hash |
| `apps/activity` sert du gzip seulement | `apps/activity/src/server.ts:183` | brotli ou zstd statique au bord |
| `next/image` qualités `[70,75]` fixes, ré-encodage du bot à qualité 75 vitesse 7, sans porte PSNR | `next.config.ts:205`, `server.ts:379-380` ; porte seulement dans `packages/images/src/webp.ts` | une qualité par classe (tableau ci-dessus) et la porte PSNR partagée |

## Suite, dans l'ordre

1. Étape de publication sur `fr1` : AVIF (`sharp`, ou `libavif-sys` si sans perte ou SVT-AV1) à côté du WebP ; svgo configuration B avec la porte `resvg` pour les SVG.
2. `.br` et `.zst` dans le manifeste de publication du CDN ; négociation `Accept-Encoding` dans `shenron-edge` (Pingora ou `tower-http`).
3. Sous-ensemble de Google Sans Flex à la publication (`wdth` 100, `ROND` 0, plage `wght` alignée sur le CSS) ; version woff2 de la police CJK.
4. `shenron-tv` en CMAF fMP4 ; échelon AV1 mesuré sur `fr2` avant d'être activé.
5. Banc d'essai JXL après build de libjxl 0.13 : seulement si le gain sur les planches justifie un troisième format.
