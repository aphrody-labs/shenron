# Shenron Video

Bibliothèque vidéo Rust pure, sans ffmpeg ni C : `crates/shenron-video` (lib `shenron_video` + binaire
`shenron-video`). Premier consommateur : `scripts/ops/dbxv2-serve.ts` (route `/cpk/:name/mp4/*path`).

## Choix techniques

| Rôle              | Brique                                           | Pourquoi                                                                                                         |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Décodage MPEG-1/2 | `filmcraft-mpeg2v` (Bun OS, MIT/Apache)          | Rust pur, MPEG-1 + MPEG-2 (Main/High, 4:2:2, entrelacé), déjà dans le dépôt Bun OS : aucune dépendance nouvelle. |
| Encodage H.264    | `filmcraft-h264enc` (High, CABAC, B-frames, CRF) | Rust pur, lisible partout (Chrome, Safari, Firefox).                                                             |
| Mux               | `filmcraft-isobmff` (`FragmentedWriter`)         | fMP4 : `<video>` et MSE.                                                                                         |
| Image fixe        | PNG RGBA maison (blocs deflate stockés)          | zéro dépendance ; le TypeScript recompresse via `Bun.Image`.                                                     |

Écartés : ffmpeg (consigne propriétaire) ; `Bun.Video` (FilmCraft natif) qui lit/remuxe MP4 H.264+AAC mais
n'encode pas et ne qualifie pas le MPEG-1/2 ; `rivet-mpeg2` (licence NOASSERTION), `rusty_h264`, `rav1e`,
`muxide` : redondants avec les crates FilmCraft déjà présents, ils ajouteraient des dépendances à auditer.
AV1 (`filmcraft-av1` décode seulement ; `rav1e` pour l'encodage) reste à qualifier : l'H.264 suffit au web.

## CLI

```
shenron-video mp4 [--crf 23] [--preset speed|balanced|quality] [--start S] [--duration S] < in.m2v > out.mp4
shenron-video probe < in.m2v          # JSON : codec, taille, cadence, nombre d'images, durée
shenron-video frame [--time S] < in.m2v > still.png
```

Entrée : flux élémentaire MPEG-1/2 (ce que rend `/cpk/:name/video/*path` pour un USM). Le décodage d'un
segment commence à l'image intra précédant `--start`. L'audio d'un USM n'est pas exposé par le serveur
natif DBXV2 : la sortie est sans audio.

## Mesures (fabrique VPS, 12 vCPU Haswell, sans GPU, 2026-10-18)

USM `movie/D09_A01.usm` du CPK `data_d4_5_xv1` : MPEG-1, 1920x1080, 29,97 i/s, 2850 images (95,1 s), 44,7 Mo.

| Opération                            | Durée                              | Sortie                     |
| ------------------------------------ | ---------------------------------- | -------------------------- |
| `mp4` complet (CRF 23, preset speed) | 129 s (≈ 22 i/s, 0,74x temps réel) | 53,6 Mo                    |
| `mp4 --start 20 --duration 10`       | 14,5 s                             | 6,2 Mo                     |
| `probe`                              | < 1 s                              | JSON                       |
| `frame --time 5`                     | < 1 s                              | PNG 8,3 Mo (non compressé) |

USM `movie/D02_L00M.usm` (1280x720, 62 images) : 1,4 s, 0,46 Mo.

Limite : le débit est inférieur au temps réel en 1080p ; le serveur borne donc un segment à
`DBXV2_MP4_MAX_SECONDS` (90 s) et met le résultat en cache.

## Qualification (2026-10-18)

- `Bun.Video.metadata()` sur la sortie de `D02_L00M.usm` : H.264 (High), 1280x720, 30000/1001, 62 images, sans
  piste audio ; `frame(0.5).rgba()` décode 1280x720 (3 686 400 octets).
- Chrome réel (Windows, headless, service de la fabrique par relais temporaire qui porte le jeton) :
  `D02_L00M.usm` (1280x720) : `canplay`, `videoWidth` 1280, lecture jusqu'à la fin (2,07 s) ;
  `D09_A01.usm?t=20&d=8` (1920x1080) : `canplay`, `videoWidth` 1920, `currentTime` 3,05 -> 6,05 sur 3 s.

## Reste à faire

Enveloppe TypeScript `packages/video` (`@aphrody/shenron-video`), pont wasm navigateur, AV1 (encodage),
WebM, extraction audio, GIF animé, entrées H.264/MP4 (décodage), cache de segments par plage côté lecteur.
Le crate doit rejoindre le workspace racine quand la révision Bun OS portant FilmCraft sera publiée.
