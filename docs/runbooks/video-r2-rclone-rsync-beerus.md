# Runbook Operationnel : Telechargement Video, Synchronisation R2 (`rclone` / `rsync`) et Ingestion `DBS_BEERUS`

Ce runbook decrit l'architecture souveraine de telechargement video, d'extraction de medias par `Bun.Video`, de publication adressable par le contenu sur Cloudflare R2 et Garage S3, ainsi que le workflow reproductible d'ingestion des episodes `DBS_BEERUS` (episodes `875` a `879` et futurs episodes `880`+).

---

## 1. Architecture de Telechargement et Extraction Video (`@aphrody/shenron-media/video-download`)

Le module [`packages/media/src/video-download.ts`](../../packages/media/src/video-download.ts) fournit les primitives pures et deterministes utilisees par les pipelines serveur et CLI :

- **Version `yt-dlp` verouillee** : `PINNED_YT_DLP_VERSION = "2026.10.21"`.
- **Construction deterministe des arguments** via `buildYtDlpArgs` :
  - Validation stricte du protocole `https:` sans identifiants embarques dans l'URL.
  - Flags canoniques : `--no-part`, `--no-mtime`, `--no-playlist`, `--no-progress`, `--newline`, `--concurrent-fragments 8`, `--merge-output-format mp4`.
- **Decodage et extraction native** :
  - Inspection des conteneurs et pistes via `Bun.Video`, `mediabunny` et `ffprobe`.
  - Extraction de **41 captures de scenes** (`computeBeerusFrameTimecodes(durationSec, 41, 48.579, 32.5)`), bornees par `durationSec - 5` et encodees en WebP (`320x180`, qualite `75`).
  - Extraction de **3 captures Hero** aux timecodes canoniques `HERO_FRAME_TIMECODES = [240, 600, 1115]`.
  - Generation de l'apercu anime GIF (`DEFAULT_GIF_PREVIEW = { start: 600, duration: 2, fps: 12, width: 480 }`).
- **Validation des sous-titres WebVTT** (`validateWebVttContent`) :
  - Verification de l'en-tete `WEBVTT` en premiere ligne et validation chronologique stricte de chaque cue (`start < end`).

---

## 2. Publication R2 Adressable par le Contenu et Sharding de Manifestes (`@aphrody/shenron-media/r2-sync`)

Le module [`packages/media/src/r2-sync.ts`](../../packages/media/src/r2-sync.ts) orchestre le stockage immuable :

1. **Stockage par empreinte SHA-256 (`r2ObjectKey`)** :
   - Chaque fichier binaire (video MP4, WebP, GIF, WebVTT) est stocke sous la cle `_objects/<sha256>` (64 caracteres hexadecimaux en minuscules).
   - En-tete HTTP immuable : `Cache-Control: public, max-age=31536000, immutable`.
2. **Sharding a 256 entrees (`r2ShardId` & `buildManifestShards`)** :
   - Le chemin public normalise (`/media/episodes/<id>/<sha256>/source.mp4` ou `/assets/subtitles/dbs-beerus/<id>.<lang>.vtt`) est hache en SHA-256 ; les 2 premiers caracteres hexadecimaux (`00`..`ff`) determinent le shard `_migration/manifests/publication-<id>/<00..ff>.json`.
   - `buildManifestShards(entries, existing)` effectue une fusion en union sans jamais ecraser ni supprimer les entrees des episodes deja publies dans le meme shard.
3. **Synchronisation `origin-cdn.json`** :
   - Apres publication des shards et verification `HEAD` sur `https://cdn.dragonballfr.com`, le manifeste de reference `origin-cdn.json` et les variables de worker sont synchronises.

---

## 3. Bonnes Pratiques de Synchronisation `rclone` (R2) et `rsync` (Mesh WireGuard)

### 3.1 Synchronisation vers Cloudflare R2 / Garage S3 avec `rclone`

La fonction `buildRcloneR2Args` applique les parametres optimaux pour les gros objets MP4 et les lots de miniatures :

```sh
rclone copy $SHENRON_ROOT/staging/_objects r2:shenron-cdn/_objects \
  --transfers 16 \
  --checkers 32 \
  --s3-upload-concurrency 8 \
  --s3-chunk-size 64M \
  --s3-no-check-bucket \
  --fast-list \
  --checksum \
  --header-upload "Cache-Control: public, max-age=31536000, immutable"
```

### 3.2 Synchronisation inter-noeuds (`vps` <-> `cdn` <-> `prod`) avec `rsync`

Sur le reseau prive WireGuard (`10.200.77.0/24`), `buildRsyncMeshArgs` active la compression `zstd` niveau 3 et la reprise atomique :

```sh
rsync -aH --partial --partial-dir=.rsync-partial --inplace \
  --compress --compress-choice=zstd --compress-level=3 --info=progress2 \
  $SHENRON_ROOT/staging/ cdn:$SHENRON_ROOT/r2-mirror/
```

---

## 4. Workflow d'Ingestion `DBS_BEERUS` retire

Le script `scripts/ops/dbs-beerus-workflow.ts` est supprime : il telechargeait des flux Crunchyroll sous licence avec des cookies de compte, puis publiait `source.mp4` sur R2 (remplace par Garage, ADR 0009). Les episodes `DBS_BEERUS` sont maintenus par `scripts/ops/beerus-sync.ts`, voir la section 5.

## 5. Episodes 880 and later: metadata only (2026-11-19)

From episode 6 (`880`, `GE00389318JAJP`, « La Bataille des dieux », published by Crunchyroll France on 2026-11-15 at 17:00 UTC), new episodes are added by `.github/workflows/beerus-sync.yml` (Sunday 17:30 UTC and on demand). It runs `scripts/ops/beerus-sync.ts --apply` on the fr1 runner, which writes `bot.db_episodes` on prd over ssh under the deploy lock: titles, air date, arc and official source link. The watch offer is the Crunchyroll page. Downloading with account cookies and re-publishing `source.mp4` and subtitles on the CDN are not part of this workflow: they copy a licensed stream and stay out of any automation.

Caches after a new row: the episode API answers at once; the fr2 nginx cache keeps a 404 for 1 minute and a 200 for 10 minutes; the Next episode lists revalidate after 1 hour. Redis holds no episode cache.
