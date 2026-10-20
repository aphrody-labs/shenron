#!/usr/bin/env bun
/**
 * extract-dbz-frames.ts — Extraction FRAME-PAR-FRAME d'un épisode DBZ depuis une
 * VIDÉO LOCALE via Bun Video / FilmCraft (cadence régulière), sortie webp.
 *
 * Réplique l'esprit du pipeline « frames d'anime » rpbey (cf.
 * apps/web/scripts/scrape-anime-frames.ts), mais adapté à la SOURCE shenron :
 * rpbey scrape des galeries de screencaps existantes ; côté DBZ, l'ayant droit dispose des MASTERS VIDÉO → on génère nos
 * propres captures HQ localement (pas de dépendance à un wiki tiers).
 *
 *   Source d'entrée : un fichier vidéo d'épisode (mp4/mkv/...) ou un dossier.
 *   Méthode : échantillonnage périodique natif, borné avant décodage par --max.
 *     La détection des changements de plan n'est pas exposée par Bun.Video :
 *     --scene non nul échoue explicitement au lieu de changer de décodeur.
 *   Sortie : webp (qualité réglable) dans
 *     apps/bot/assets/ext/db_episodes_frames/<series>/ep<NNN>/frame-<NNNNN>.webp
 *     + dataset JSON apps/bot/data/dbz-frames/<series>-ep<NNN>.json (contrat
 *     frames-common.ts). AUCUNE écriture DB (ingestion séparée, gardée).
 *
 * Bun.Video décode ; Bun.Image encode les WebP. Aucun exécutable média externe.
 *
 * ── Où déposer les vidéos sources ────────────────────────────────────────────
 *   apps/bot/data/dbz-sources/<series>/<numberInSeries>.<ext>
 *   ex. apps/bot/data/dbz-sources/DBZ/1.mkv  (l'épisode 1 de DBZ)
 *   (ou passer --input <chemin> pour un fichier hors arborescence.)
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   bun apps/bot/scripts/extract-dbz-frames.ts --series DBZ --ep 1 \
 *       [--input <video>] [--scene 0] [--period 6] [--quality 82] \
 *       [--max 400] [--dry-run]
 *
 *   --series   série db_episodes (DB|DBZ|DBGT|DBS|DB_DAIMA|DBZ_KAI). défaut DBZ
 *   --ep       numberInSeries (obligatoire)
 *   --input    chemin vidéo explicite (sinon résolu dans dbz-sources/)
 *   --scene    0 uniquement ; la sélection par coupe reste indisponible
 *   --period   1 frame régulière toutes N secondes (défaut 6 ; strictement positif)
 *   --quality  qualité webp 0..100 (défaut 82)
 *   --max      cap de frames gardées après extraction (défaut 600)
 *   --dry-run  n'écrit ni webp ni dataset : compte seulement les frames candidates
 */
import { mkdir, readdir, stat, rm, mkdtemp } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  type EpisodeFrame,
  type FramesDataset,
  type Series,
  pad,
  resolveEpisode,
  writeDatasetIfNonEmpty,
} from "./lib/frames-common.js";

const SERIES_VALUES: Series[] = ["DB", "DBZ", "DBGT", "DBS", "DB_DAIMA", "DBZ_KAI"];
const ROOT = Bun.fileURLToPath(new URL("../", import.meta.url));
const SOURCES_DIR = join(ROOT, "data", "dbz-sources");
const ASSETS_DIR = join(ROOT, "assets", "ext", "db_episodes_frames");
const DATA_DIR = join(ROOT, "data", "dbz-frames");
const VIDEO_EXTS = [".mkv", ".mp4", ".m4v", ".webm", ".avi", ".mov", ".ts"];

interface Args {
  series: Series;
  ep: number;
  input: string | null;
  scene: number;
  period: number;
  quality: number;
  max: number;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const val = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (flag: string, def: number): number => {
    const v = val(flag);
    return v !== undefined && v !== "" ? Number(v) : def;
  };
  const series = (val("--series") ?? "DBZ").toUpperCase() as Series;
  if (!SERIES_VALUES.includes(series)) {
    throw new Error(`--series invalide « ${series} ». Valeurs: ${SERIES_VALUES.join(", ")}`);
  }
  const ep = num("--ep", NaN);
  if (!Number.isInteger(ep) || ep <= 0) {
    throw new Error("--ep <numberInSeries> requis (entier > 0).");
  }
  const result = {
    series,
    ep,
    input: val("--input") ?? null,
    scene: num("--scene", 0),
    period: num("--period", 6),
    quality: num("--quality", 82),
    max: num("--max", 600),
    dryRun: argv.includes("--dry-run"),
  };
  if (result.scene !== 0)
    throw new Error(
      "FilmCraft scene-cut selection unavailable; use explicit periodic sampling with --scene 0",
    );
  if (
    !(Number.isFinite(result.period) && result.period > 0) ||
    !Number.isInteger(result.max) ||
    result.max < 1 ||
    result.max > 600 ||
    !Number.isInteger(result.quality) ||
    result.quality < 0 ||
    result.quality > 100
  )
    throw new Error("Invalid native sampling period, frame budget or WebP quality");
  return result;
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** Résout la vidéo source : --input explicite, sinon dbz-sources/<series>/<ep>.<ext>. */
async function resolveInput(args: Args): Promise<string> {
  if (args.input) {
    if (!(await exists(args.input))) throw new Error(`--input introuvable: ${args.input}`);
    return args.input;
  }
  const dir = join(SOURCES_DIR, args.series);
  if (await exists(dir)) {
    const files = await readdir(dir);
    const stem = String(args.ep);
    // Match exact "<ep>.<ext>" puis, à défaut, un nom contenant le numéro.
    const exact = files.find((f) => VIDEO_EXTS.some((e) => f.toLowerCase() === `${stem}${e}`));
    const loose = files.find(
      (f) =>
        VIDEO_EXTS.some((e) => f.toLowerCase().endsWith(e)) &&
        new RegExp(`(^|[^0-9])0*${stem}([^0-9]|$)`).test(f),
    );
    const pick = exact ?? loose;
    if (pick) return join(dir, pick);
  }
  throw new Error(
    `Vidéo source introuvable pour ${args.series} ep ${args.ep}.\n` +
      `  Dépose-la dans ${dir}/${args.ep}.<ext> (${VIDEO_EXTS.join("/")}) ou passe --input <chemin>.`,
  );
}

/** Qualified FilmCraft metadata; invalid sources fail explicitly. */
async function probeDuration(input: string): Promise<number> {
  if (!(Bun as any).Video?.available) throw new Error("Bun Video / FilmCraft unavailable");
  const metadata = await new (Bun as any).Video(input).metadata();
  if (!(Number.isFinite(metadata.duration) && metadata.duration > 0))
    throw new Error("Native video duration unavailable");
  return metadata.duration;
}

/** Bounded periodic native extraction. Scene-cut scoring is not an exposed Bun.Video capability. */
async function extractPngs(
  input: string,
  outDir: string,
  args: Args,
): Promise<{ file: string; timecodeSec: number }[]> {
  if (args.scene !== 0)
    throw new Error(
      "FilmCraft scene-cut selection is unavailable; use --scene 0 --period <seconds> for explicit periodic sampling",
    );
  if (
    !(Number.isFinite(args.period) && args.period > 0) ||
    !Number.isInteger(args.max) ||
    args.max < 1 ||
    args.max > 600
  )
    throw new Error("Native sampling requires a positive period and --max 1..600");
  const duration = await probeDuration(input);
  const produced: { file: string; timecodeSec: number }[] = [];
  for (let i = 0; i < args.max && i * args.period < duration; i++) {
    const timecodeSec = i * args.period;
    const file = join(outDir, "raw-" + pad(i + 1, 5) + ".png");
    await new (Bun as any).Video(input).frame(timecodeSec).png().write(file);
    produced.push({ file, timecodeSec });
  }
  return produced;
}

/** Encode and inspect through Bun.Image, preserving the source dimensions. */
async function pngToWebp(
  png: string,
  webp: string,
  quality: number,
): Promise<{ width: number; height: number }> {
  if (!(Bun as any).Image?.available) throw new Error("Bun.Image provider unavailable");
  const image = new (Bun as any).Image(png);
  await image.webp({ quality }).write(webp);
  const metadata = await new (Bun as any).Image(webp).metadata();
  if (!(metadata.width > 0 && metadata.height > 0))
    throw new Error("Native WebP dimensions unavailable");
  return { width: metadata.width, height: metadata.height };
}

async function main() {
  const args = parseArgs();
  const input = await resolveInput(args);
  const epId = resolveEpisode(args.series, args.ep);
  const epTag = `ep${pad(args.ep, 3)}`;
  const duration = await probeDuration(input);

  console.log(
    `Extraction frames — ${args.series} ${epTag} (db id ${epId?.id ?? "?"})\n` +
      `  source : ${input} (${duration ? `${duration.toFixed(0)}s` : "durée inconnue"})\n` +
      `  params : periodic 1/${args.period}s, scene detection unavailable, webp q${args.quality}, cap ${args.max}` +
      (args.dryRun ? "  [DRY-RUN]" : ""),
  );

  // Dossier de travail temporaire pour les PNG bruts (toujours hors assets prod).
  const work = await mkdtemp(join(tmpdir(), "dbz-frames-"));

  const raws = await extractPngs(input, work, args);
  console.log(`  Bun Video / FilmCraft → ${raws.length} periodic frame(s) extracted.`);
  if (raws.length === 0)
    throw new Error("0 frame extraite — vérifier la vidéo / abaisser --scene.");

  const kept = raws.slice(0, args.max);
  if (kept.length < raws.length) {
    console.log(`  cap --max ${args.max} → ${raws.length - kept.length} frame(s) ignorée(s).`);
  }

  const relBase = `${args.series}/${epTag}`;
  const assetDir = join(ASSETS_DIR, relBase);
  if (!args.dryRun) await mkdir(assetDir, { recursive: true });

  const frames: EpisodeFrame[] = [];
  let sortOrder = 0;
  for (const r of kept) {
    const idx = pad(sortOrder + 1, 5);
    const fileName = `frame-${idx}.webp`;
    const relPath = `./assets/ext/db_episodes_frames/${relBase}/${fileName}`;
    let width: number | null = null;
    let height: number | null = null;
    if (!args.dryRun) {
      const dest = join(assetDir, fileName);
      const dims = await pngToWebp(r.file, dest, args.quality);
      width = dims.width;
      height = dims.height;
    }
    frames.push({
      source: "bun-video",
      sourceId: `bun-video:${args.series.toLowerCase()}:${pad(args.ep, 3)}:${idx}`,
      sourceUrl: input,
      episodeNumber: args.ep,
      imagePath: args.dryRun ? null : relPath,
      timecodeSec: r.timecodeSec,
      width,
      height,
      characterNames: [],
      tags: ["bun-video-periodic"],
      caption: null,
      // Periodic sampling alone does not establish narrative significance.
      isNotable: false,
      sortOrder: sortOrder++,
    });
  }

  // Nettoyage des PNG bruts (toujours, même dry-run).
  if (!resolve(work).startsWith(resolve(tmpdir()) + sep))
    throw new Error("Invalid owned temporary directory");
  await rm(work, { recursive: true, force: true });

  const dataset: FramesDataset = {
    series: args.series,
    episodeNumber: args.ep,
    episodeId: epId?.id ?? null,
    source: "bun-video",
    meta: {
      input,
      durationSec: duration || null,
      scene: args.scene,
      periodSec: args.period,
      quality: args.quality,
      producer: "Bun.Video / FilmCraft",
      selection: "periodic",
      sceneDetection: "unavailable",
    },
    scrapedAt: new Date().toISOString(),
    frames,
  };

  if (args.dryRun) {
    console.log(
      `\n[DRY-RUN] ${frames.length} frame(s) candidate(s) — rien écrit. ` +
        `Sortie réelle irait dans ${assetDir}/ + ${join(DATA_DIR, `${args.series}-${epTag}.json`)}`,
    );
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  const out = join(DATA_DIR, `${args.series}-${epTag}.json`);
  await writeDatasetIfNonEmpty(out, dataset);
  console.log(
    `\nOK — ${frames.length} webp dans ${assetDir}\n` +
      `  dataset : ${out}\n` +
      `  ingestion DB (gardée) à faire séparément (Neon db_episodes).`,
  );
}

main().catch((e) => {
  console.error("ÉCHEC:", e?.message ?? e);
  process.exit(1);
});
