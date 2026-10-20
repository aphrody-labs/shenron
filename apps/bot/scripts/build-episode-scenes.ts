#!/usr/bin/env bun
/**
 * build-episode-scenes.ts — ORCHESTRATEUR de la feature « Scènes d'épisode ».
 *
 * Combine le pipeline existant en UN seul geste, par (série, épisode) :
 *   1. EXTRACTION — lance le producteur de frames adapté :
 *        `extract-dbz-frames.ts` (Bun Video sur master vidéo local), alimenté par
 *        `data/dbz-sources/<series>/<ep>.<ext>` ou `--input`. Le producteur qui
 *        aspirait des screencaps Fandom a été retiré : source interdite.
 *      Il écrit un dataset `data/dbz-frames/<series>-ep<NNN>.json`
 *      (contrat `frames-common.ts`) + les webp sous
 *      `assets/ext/db_episodes_frames/<series>/ep<NNN>/`.
 *   2. SÉLECTION — relit ce dataset, trie « notable d'abord » puis par `sortOrder`,
 *      cap à `--max` (défaut 24) → les meilleures frames du montage.
 *   3. PREVIEW — FilmCraft génère `preview.mp4` (montage court, `--hold` s/frame,
 *      images décodées par Bun.Image, H.264 YUV420 avec pertes).
 *   4. DATASET — réécrit `data/dbz-frames/<series>-ep<NNN>.json` au format
 *      orchestrateur : `{ series, number, episodeId, frames: EpisodeFrame[],
 *      scenePreview, meta, scrapedAt }`. `scenePreview` = chemin relatif
 *      `./assets/ext/db_episodes_frames/<series>/ep<NNN>/preview.mp4`.
 *
 * AUCUNE écriture DB ici (ingestion Neon gardée = `ingest-episode-frames.ts`).
 *
 * Bun-only : `Bun.spawn`, `Bun.file`, `Bun.write`. Pas de node/npm/tsx.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   bun apps/bot/scripts/build-episode-scenes.ts --series DBZ --ep 1 \
 *       [--max 24] [--hold 0.8] [--input <video>] \
 *       [--dry-run]
 *
 *   --series   série db_episodes (DB|DBZ|DBGT|DBS|DB_DAIMA|DBZ_KAI). défaut DBZ
 *   --ep       numberInSeries (obligatoire)
 *   --max      nombre de frames retenues pour le montage (défaut 24)
 *   --hold     durée d'affichage par frame dans le preview, en s (défaut 0.8)
 *   --input    chemin vidéo réel autorisé → source Bun Video
 *   --dry-run  smoke : exige --input, prouve captures réelles + preview.mp4,
 *              nettoie tout dans /tmp, n'écrit RIEN dans assets/ ni data/.
 */
import { mkdir, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { type EpisodeFrame, type Series, pad, resolveEpisode } from "./lib/frames-common.js";
import { buildScenePreview } from "./lib/scene-preview.js";

const SERIES_VALUES: Series[] = ["DB", "DBZ", "DBGT", "DBS", "DB_DAIMA", "DBZ_KAI"];
const ROOT = new URL("../", import.meta.url).pathname; // apps/bot/
const SOURCES_DIR = join(ROOT, "data", "dbz-sources");
const ASSETS_DIR = join(ROOT, "assets", "ext", "db_episodes_frames");
const DATA_DIR = join(ROOT, "data", "dbz-frames");
const SCRIPTS_DIR = join(ROOT, "scripts");
const VIDEO_EXTS = [".mkv", ".mp4", ".m4v", ".webm", ".avi", ".mov", ".ts"];

interface Args {
  series: Series;
  ep: number;
  max: number;
  hold: number;
  input: string | null;
  dryRun: boolean;
}

/** Sortie orchestrateur écrite sur disque (superset du contrat partagé). */
interface SceneDataset {
  series: Series;
  /** = number_in_series. Alias `number` exigé par le contrat partagé. */
  number: number;
  episodeId: number | null;
  frames: EpisodeFrame[];
  /** Chemin relatif du MP4 montage (`./assets/.../preview.mp4`). */
  scenePreview: string;
  meta: Record<string, unknown>;
  scrapedAt: string;
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
  return {
    series,
    ep,
    max: num("--max", 24),
    hold: num("--hold", 0.8),
    input: val("--input") ?? null,
    dryRun: argv.includes("--dry-run"),
  };
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** True si un master vidéo local existe pour (série, ep) ou via --input. */
async function hasLocalVideo(args: Args): Promise<boolean> {
  if (args.input) return exists(args.input);
  const dir = join(SOURCES_DIR, args.series);
  if (!(await exists(dir))) return false;
  const files = await readdir(dir);
  const stem = String(args.ep);
  return files.some(
    (f) =>
      VIDEO_EXTS.some((e) => f.toLowerCase().endsWith(e)) &&
      new RegExp(`(^|[^0-9])0*${stem}([^0-9]|$)`).test(f),
  );
}

/** Lance un script producteur en sous-process Bun, hérite stdio. */
async function runProducer(script: string, scriptArgs: string[]): Promise<void> {
  const proc = Bun.spawn(["bun", join(SCRIPTS_DIR, script), ...scriptArgs], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${script} a échoué (code ${code}).`);
}

/** Relit le dataset producteur et renvoie ses frames (peut être vide). */
async function readProducerFrames(datasetPath: string): Promise<EpisodeFrame[]> {
  if (!(await exists(datasetPath))) {
    throw new Error(`Dataset producteur introuvable: ${datasetPath}`);
  }
  const raw = (await Bun.file(datasetPath).json()) as { frames?: EpisodeFrame[] };
  return Array.isArray(raw.frames) ? raw.frames : [];
}

/** Tri « notable d'abord » puis ordre stable, cap à `max`. */
function selectTopFrames(frames: EpisodeFrame[], max: number): EpisodeFrame[] {
  return frames
    .filter((f) => f.imagePath) // seules les frames réellement écrites
    .toSorted((a, b) => {
      if (a.isNotable !== b.isNotable) return a.isNotable ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    })
    .slice(0, Math.max(1, max));
}

/** Résout le chemin absolu d'une frame : `/abs` tel quel, sinon `./assets/...` depuis ROOT. */
function frameAbsPath(imagePath: string): string {
  if (imagePath.startsWith("/")) return imagePath;
  return join(ROOT, imagePath.replace(/^\.\//, ""));
}

/** Monte le preview MP4 des frames sélectionnées (cf. lib/scene-preview.ts). */
async function buildPreview(
  frames: EpisodeFrame[],
  outMp4: string,
  hold: number,
  workDir: string,
): Promise<void> {
  await buildScenePreview(
    frames.map((f) => frameAbsPath(f.imagePath as string)),
    outMp4,
    { hold, workDir },
  );
}

/** Qualify a real authorized master in temporary storage, without editorial writes. */
async function smoke(args: Args): Promise<void> {
  if (!args.input || !(await Bun.file(args.input).exists()))
    throw new Error("--dry-run requires --input with a real authorized local video");
  const Video = (Bun as any).Video;
  if (!Video?.available) throw new Error("Bun.Video provider unavailable");
  const video = new Video(args.input);
  const metadata = await video.metadata();
  if (!Number.isFinite(metadata.duration) || metadata.duration <= 0)
    throw new Error("Real source has no finite positive duration");
  const work = join("/tmp", "scenes-smoke-" + crypto.randomUUID());
  await mkdir(work, { recursive: true });
  try {
    const count = Math.min(3, args.max);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid smoke frame count");
    const frames: EpisodeFrame[] = [];
    for (let index = 0; index < count; index++) {
      const time = (metadata.duration * (index + 1)) / (count + 1);
      const path = join(work, "frame-" + pad(index, 5) + ".webp");
      await video.frame(time).resize(640).webp({ quality: 80 }).write(path);
      const image = await new (Bun as any).Image(path).metadata();
      frames.push({
        source: "bun-video",
        sourceId: "smoke:" + pad(index, 5),
        sourceUrl: args.input,
        episodeNumber: args.ep,
        imagePath: path,
        timecodeSec: time,
        width: image.width,
        height: image.height,
        characterNames: [],
        tags: ["smoke"],
        caption: null,
        isNotable: index === 0,
        sortOrder: index,
      });
    }
    const preview = join(work, "preview.mp4");
    await buildPreview(frames, preview, args.hold, work);
    const probe = await new Video(preview).metadata();
    console.log(
      JSON.stringify({
        schema: "shenron.scene.smoke/v1",
        source: args.input,
        sourceMetadata: metadata,
        captures: frames.map(({ timecodeSec, width, height }) => ({ timecodeSec, width, height })),
        preview: probe,
        bytes: Bun.file(preview).size,
        backend: "Bun.Video + Bun.Image + shenron-video/FilmCraft",
        editorialWrites: false,
      }),
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const epTag = `ep${pad(args.ep, 3)}`;

  if (args.dryRun) {
    console.log(
      `build-episode-scenes — ${args.series} ${epTag}  [DRY-RUN / SMOKE]\n` +
        `  (master réel autorisé, montage natif, nettoyage /tmp — zéro écriture prod)`,
    );
    await smoke(args);
    return;
  }

  // ── 1. EXTRACTION ──────────────────────────────────────────────────────────
  const aVideo = await hasLocalVideo(args);
  const epId = resolveEpisode(args.series, args.ep);

  console.log(
    `build-episode-scenes — ${args.series} ${epTag} (db id ${epId?.id ?? "?"})\n` +
      `  source : Bun Video (master local)\n` +
      `  params : max ${args.max} frames, hold ${args.hold}s/frame`,
  );

  if (!aVideo && !args.input) {
    throw new Error(
      `Aucun master vidéo pour ${args.series} ${epTag} : dépose-le sous ` +
        `data/dbz-sources/${args.series}/ ou passe --input <video>. ` +
        `(Le repli par screencaps Fandom a été retiré : source interdite.)`,
    );
  }
  const extraArgs = ["--series", args.series, "--ep", String(args.ep)];
  if (args.input) extraArgs.push("--input", args.input);
  await runProducer("extract-dbz-frames.ts", extraArgs);

  // ── 2. SÉLECTION ───────────────────────────────────────────────────────────
  const datasetPath = join(DATA_DIR, `${args.series}-${epTag}.json`);
  const allFrames = await readProducerFrames(datasetPath);
  const selected = selectTopFrames(allFrames, args.max);
  if (selected.length === 0) {
    throw new Error(
      "Aucune frame écrite exploitable (imagePath null). Relance le producteur sans --dry-run.",
    );
  }
  console.log(
    `  → ${allFrames.length} frame(s) extraite(s), ${selected.length} retenue(s) pour le montage` +
      ` (${selected.filter((f) => f.isNotable).length} notable).`,
  );

  // ── 3. PREVIEW MP4 ─────────────────────────────────────────────────────────
  const relBase = `${args.series}/${epTag}`;
  const assetDir = join(ASSETS_DIR, relBase);
  await mkdir(assetDir, { recursive: true });
  const previewAbs = join(assetDir, "preview.mp4");
  const previewRel = `./assets/ext/db_episodes_frames/${relBase}/preview.mp4`;
  const work = join("/tmp", `scenes-build-${args.series}-${epTag}-${Date.now()}`);
  await mkdir(work, { recursive: true });
  try {
    await buildPreview(selected, previewAbs, args.hold, work);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  const previewStat = await stat(previewAbs);
  console.log(`  → preview.mp4 : ${previewRel} (${previewStat.size} octets)`);

  // ── 4. DATASET ORCHESTRATEUR ────────────────────────────────────────────────
  const out: SceneDataset = {
    series: args.series,
    number: args.ep,
    episodeId: epId?.id ?? null,
    frames: selected,
    scenePreview: previewRel,
    meta: {
      producer: "extract-dbz-frames",
      totalExtracted: allFrames.length,
      selected: selected.length,
      holdSec: args.hold,
    },
    scrapedAt: new Date().toISOString(),
  };
  await mkdir(DATA_DIR, { recursive: true });
  await Bun.write(datasetPath, JSON.stringify(out, null, 2));

  console.log(
    `\nOK — scène d'épisode prête :\n` +
      `  dataset : ${datasetPath}\n` +
      `  frames  : ${selected.length} webp dans ${assetDir}\n` +
      `  preview : ${previewRel}\n` +
      `  → ingestion Neon (gardée) :\n` +
      `      bun apps/bot/scripts/ingest-episode-frames.ts --series ${args.series} --ep ${args.ep} --apply`,
  );
}

main().catch((e) => {
  console.error("ÉCHEC:", e?.message ?? e);
  process.exit(1);
});
