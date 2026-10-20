/**
 * scene-preview.ts — Aperçu animé court d'une scène d'épisode : diaporama des
 * captures, chacune tenue `hold` secondes.
 *
 * Partagé par `build-episode-scenes.ts` (captures tirées d'un master local) et
 * `build-scene-previews.ts` (captures déjà déposées par `frames-depuis-lecteur.ts`).
 *
 * Le format suit l'extension de sortie :
 *   - `.mp4`  : H.264 natif FilmCraft, MP4 fragmenté ;
 *   - `.webp` : WebP animé en boucle, une image par capture. C'est le format que
 *     `/assets` du bot sert aujourd'hui (le MP4 n'y est pas autorisé), et la
 *     page épisode l'affiche comme une image — aucun lecteur vidéo à armer.
 * Le chemin WebP animé historique demande encore son encodeur propriétaire.
 */
import { join } from "node:path";
import { $ } from "bun";

export interface ScenePreviewOptions {
  /** Durée d'affichage de chaque capture, en secondes. */
  hold: number;
  /** Dossier de travail temporaire, nettoyé par l'appelant. */
  workDir: string;
  /** Largeur maximale ; une capture plus large est réduite, proportions gardées. */
  maxWidth?: number;
}

const echapper = (chemin: string) => chemin.replace(/'/g, "'\\''");

/** Encode one native H.264 sample per still, preserving the requested hold to milliseconds. */
async function buildNativeMp4(images: string[], output: string, opts: ScenePreviewOptions) {
  const encoder = process.env.SHENRON_VIDEO_ENCODER;
  if (!encoder || !/^(?:\/|[A-Za-z]:[\\/])/.test(encoder) || !(await Bun.file(encoder).exists()))
    throw new Error("SHENRON_VIDEO_ENCODER must name the qualified native encoder");
  const Image = (Bun as any).Image;
  const Video = (Bun as any).Video;
  if (typeof Image !== "function" || !Video?.available)
    throw new Error("Bun.Image and Bun.Video are required for native scene previews");
  const holdMs = Math.round(opts.hold * 1000);
  if (!Number.isFinite(opts.hold) || holdMs < 17 || holdMs > 100_000 || images.length > 1800)
    throw new Error("Scene preview exceeds the native frame or timing budget");
  const first = await new Image(images[0], { maxPixels: 16_777_216 }).metadata();
  const maxWidth = opts.maxWidth ?? 1920;
  if (!Number.isSafeInteger(maxWidth) || maxWidth < 16 || maxWidth > 1920)
    throw new Error("Invalid native preview maximum width");
  const width = Math.floor(Math.min(first.width, maxWidth) / 2) * 2;
  const height = Math.floor((first.height * width) / first.width / 2) * 2;
  if (width < 16 || height < 16 || height > 1920 || width * height > 2_073_600)
    throw new Error("Scene preview exceeds the native geometry budget");
  if (await Bun.file(output).exists()) throw new Error("Refusing to overwrite a scene preview");
  const temporary = join(opts.workDir, `native-preview-${crypto.randomUUID()}.mp4`);
  const processHandle = Bun.spawn(
    [
      encoder,
      "encode-rgba",
      "--width",
      String(width),
      "--height",
      String(height),
      "--fps-num",
      "1000",
      "--fps-den",
      String(holdMs),
      "--frames",
      String(images.length),
    ],
    {
      stdin: "pipe",
      stdout: Bun.file(temporary),
      stderr: "pipe",
      env: { ...process.env, RAYON_NUM_THREADS: "1" },
    },
  );
  const errorText = new Response(processHandle.stderr).text();
  const timer = setTimeout(() => processHandle.kill("SIGKILL"), 120_000);
  try {
    for (const path of images) {
      const image = new Image(path, { maxPixels: 16_777_216 });
      const metadata = await image.metadata();
      if (metadata.width !== first.width || metadata.height !== first.height)
        throw new Error("Scene captures must share the same source dimensions");
      const rgba = await image.resize(width, height).rgba();
      processHandle.stdin.write(rgba.data);
      await processHandle.stdin.flush();
    }
    processHandle.stdin.end();
    if ((await processHandle.exited) !== 0)
      throw new Error(`Native scene encoding failed: ${(await errorText).slice(-600)}`);
    const metadata = await new Video(temporary).metadata();
    if (
      metadata.width !== width ||
      metadata.height !== height ||
      metadata.frameCount !== images.length ||
      !String(metadata.codec).startsWith("H.264") ||
      Math.abs(metadata.duration - (images.length * holdMs) / 1000) > 0.001
    )
      throw new Error("Native scene preview differs from the requested montage");
    await Bun.write(output, Bun.file(temporary));
  } finally {
    clearTimeout(timer);
    if (processHandle.exitCode === null) processHandle.kill("SIGKILL");
    await processHandle.exited;
    await errorText;
    await $`rm -f ${temporary}`.quiet();
  }
}

/** Écrit `sortie` (`.mp4` ou `.webp`) à partir de `images` (chemins absolus, dans l'ordre). */
export async function buildScenePreview(
  images: string[],
  sortie: string,
  opts: ScenePreviewOptions,
): Promise<void> {
  const derniere = images.at(-1);
  if (derniere === undefined) throw new Error("montage : aucune capture");
  const webp = sortie.toLowerCase().endsWith(".webp");
  if (!webp) {
    if (!sortie.toLowerCase().endsWith(".mp4")) throw new Error("Unsupported scene preview format");
    await buildNativeMp4(images, sortie, opts);
    return;
  }
  const lignes = images.flatMap((p) => [`file '${echapper(p)}'`, `duration ${opts.hold}`]);
  const liste = join(opts.workDir, "concat.txt");
  await Bun.write(liste, `${lignes.join("\n")}\n`);

  const echelle = opts.maxWidth
    ? `scale=trunc(min(iw\\,${opts.maxWidth})/2)*2:-2`
    : "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  const encodage = [
    "-vf",
    `${echelle},fps=${1 / opts.hold}`,
    "-c:v",
    "libwebp_anim",
    "-lossless",
    "0",
    "-q:v",
    "72",
    "-compression_level",
    "4",
    "-loop",
    "0",
  ];
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      liste,
      ...encodage,
      "-y",
      sortie,
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`ffmpeg (preview) a échoué (code ${code}):\n${stderr.slice(-600)}`);
  }
}
