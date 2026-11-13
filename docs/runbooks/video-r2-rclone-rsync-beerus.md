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
rclone copy /srv/shenron/staging/_objects r2:shenron-cdn/_objects \
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
  /srv/shenron/staging/ cdn:/srv/shenron/r2-mirror/
```

---

## 4. Workflow Reproductible d'Ingestion `DBS_BEERUS` (`875`..`879` et `880`+)

Le script [`scripts/ops/dbs-beerus-workflow.ts`](../../scripts/ops/dbs-beerus-workflow.ts) automatise la preparation et l'execution de bout en bout.

### 4.1 Registre Canonique des Episodes 1 a 5

| ID Shenron | Episode | ID Crunchyroll   | Date de diffusion | Stills Officiels   | Titre FR                            |
| :--------- | :------ | :--------------- | :---------------- | :----------------- | :---------------------------------- |
| `875`      | 1       | `GE00389313JAJP` | `2026-10-04`      | `st01_01..04.webp` | Le reveil du dieu de la destruction |
| `876`      | 2       | `GE00389314JAJP` | `2026-10-11`      | `st02_01..04.webp` | La prophetie du Super Saiyan Divin  |
| `877`      | 3       | `GE00389315JAJP` | `2026-10-18`      | `st03_01..04.webp` | Beerus descend sur la planete Kaio  |
| `878`      | 4       | `GE00389316JAJP` | `2026-10-25`      | `st04_01..04.webp` | La fureur de Vegeta                 |
| `879`      | 5       | `GE00389317JAJP` | `2026-11-01`      | `st05_01..04.webp` | Le rituel des six Saiyans           |

### 4.2 Etapes d'Ingestion d'un Nouvel Episode (ex. Episode 6 / ID `880`)

1. **Generation du plan de workflow (`--plan` / `--dry-run`)** :
   ```sh
   bun run scripts/ops/dbs-beerus-workflow.ts --episode 6 --id 880 --plan --dry-run
   ```
2. **Export des cookies Crunchyroll et telechargement source** :
   - Placer le fichier de cookies Netscape dans un chemin temporaire hors depot (`/run/user/1000/cr-cookies.txt`).
   - Executer la commande `yt-dlp` generee par le planificateur pour recuperer `source.mp4` et les pistes `.ja.vtt` / `.fr-FR.vtt`.
3. **Validation WebVTT et extraction `Bun.Video`** :
   - Valider les fichiers `.vtt` avec `validateWebVttContent`.
   - Extraire les 41 frames WebP, les 3 captures Hero (`240s`, `600s`, `1115s`) et le GIF d'apercu (`600s`, `2s`, `12 fps`, `480px`).
4. **Publication R2 et mise a jour des shards** :
   - Calculer le SHA-256 du fichier `source.mp4`, copier l'objet vers `_objects/<sha256>` via `rclone`, et fusionner le shard correspondant via `buildManifestShards`.
5. **Upsert PostgreSQL et verification** :
   - Mettre a jour la ligne de l'episode dans PostgreSQL (`players`, `subtitles`, `availability` Crunchyroll) en transaction et verifier la reponse HTTP `200`/`206` sur `https://cdn.dragonballfr.com/media/episodes/<id>/<sha256>/source.mp4`.
