/**
 * canvas-kit — primitives de rendu 2D partagées.
 *
 * Extraites de `CardService` + `commands/fun/Scan.ts`, réutilisables par les
 * futurs canvases (/top, /fusion, /shop, /gay, /raciste, /bingo, /morpion, /pfc, /pendu).
 *
 * Pas de logique métier ici — uniquement des helpers sans état.
 * L'enregistrement des fonts est fait au chargement de ce module (side effect),
 * donc `import "~/lib/canvas-kit"` suffit à garantir leur disponibilité.
 */
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { botFile } from "~/lib/asset-files";
import { CANVAS_FONT_FILES } from "~/lib/canvas-fonts";
import { drawIcon, ICON_BOX } from "~/render/icons";
import { logger } from "~/lib/logger";

export { FONT_STACK, font } from "~/lib/canvas-fonts";

// ─── Fonts ────────────────────────────────────────────────────────────────

/** Racine `apps/bot` vue depuis ce module (indépendante du cwd). */
const BOT_ROOT = `${import.meta.dir}/../..`;

/**
 * Enregistrement des fonts — idempotent au niveau module.
 * Ne throw jamais : fallback silencieux sur sans-serif si un fichier manque.
 */
function registerFonts(): void {
  for (const [file, family] of CANVAS_FONT_FILES) {
    try {
      const primaryPath = botFile(`assets/fonts/${file}`, BOT_ROOT);
      if (existsSync(primaryPath)) GlobalFonts.registerFromPath(primaryPath, family);
    } catch (err) {
      logger.debug({ err, file, family }, "Font non chargée (fallback sans-serif)");
    }
  }
}
registerFonts();

// ─── Couleurs ──────────────────────────────────────────────────────────────

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  if (!hex || typeof hex !== "string") return { r: 255, g: 255, b: 255 };
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{3,8}$/.test(clean)) {
    return { r: 255, g: 255, b: 255 };
  }
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.slice(0, 6);
  const n = parseInt(expanded, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Paths ─────────────────────────────────────────────────────────────────

export function roundRectPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function circlePath(ctx: SKRSContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
}

// ─── Effets ────────────────────────────────────────────────────────────────

/** Glow radial centré — remplit un carré englobant. */
export function fillRadialGlow(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  r: number,
  hex: string,
  opacity = 0.8,
): void {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, rgba(hex, opacity));
  grad.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** Scanlines horizontales style CRT/scouter. */
export function drawScanlines(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  step = 4,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let yy = y; yy < y + h; yy += step) {
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Gauge / barre de progression horizontale arrondie. */
export function drawGauge(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  opts: { bg: string; fill: string; stroke?: string; radius?: number } = {
    bg: "#1f2937",
    fill: "#fbbf24",
  },
): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  const radius = opts.radius ?? h / 2;
  ctx.save();
  // Fond
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = opts.bg;
  ctx.fill();
  // Fill
  if (clamped > 0) {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.fillStyle = opts.fill;
    ctx.fillRect(x, y, w * clamped, h);
    ctx.restore();
  }
  // Contour
  if (opts.stroke) {
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.lineWidth = 1;
    ctx.strokeStyle = opts.stroke;
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Texte ─────────────────────────────────────────────────────────────────

export interface TextShadowOptions {
  color: string;
  font: string;
  shadow?: string;
  blur?: number;
  offsetY?: number;
  align?: CanvasTextAlign;
}

export function textWithShadow(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  options: TextShadowOptions,
): void {
  ctx.save();
  ctx.font = options.font;
  if (options.align) ctx.textAlign = options.align;
  if (options.shadow) {
    ctx.shadowColor = options.shadow;
    ctx.shadowBlur = options.blur ?? 8;
    ctx.shadowOffsetY = options.offsetY ?? 2;
  }
  ctx.fillStyle = options.color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export interface TextStrokedOptions {
  color: string;
  stroke: string;
  strokeWidth: number;
  font: string;
  align?: CanvasTextAlign;
}

export function textStroked(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  options: TextStrokedOptions,
): void {
  ctx.save();
  ctx.font = options.font;
  if (options.align) ctx.textAlign = options.align;
  ctx.lineWidth = options.strokeWidth;
  ctx.strokeStyle = options.stroke;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = options.color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ─── Formes thématiques DBZ ───────────────────────────────────────────────

/** Circumradius of the measured star glyph, in the units of its 24-unit drawing box. */
const STAR_GLYPH_RADIUS = 9;

/** Star of `points` branches; the five-pointed one is the measured glyph of the site. */
export function drawStar(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  r: number,
  points = 5,
  color = "#ffffff",
): void {
  if (points === 5) {
    drawIcon(ctx, "star", cx, cy, (r * ICON_BOX) / STAR_GLYPH_RADIUS, color);
    return;
  }
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r / 2.2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Dragon Ball avec étoile(s) rouge(s). starCount 1-7. */
export function drawDragonBall(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  r: number,
  starCount: number,
): void {
  const grad = ctx.createRadialGradient(cx - r / 3, cy - r / 3, r / 8, cx, cy, r);
  grad.addColorStop(0, "#fef3c7");
  grad.addColorStop(0.35, "#f59e0b");
  grad.addColorStop(1, "#c2410c");
  ctx.fillStyle = grad;
  circlePath(ctx, cx, cy, r);
  ctx.fill();

  ctx.strokeStyle = "rgba(124, 45, 18, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const starR = r * 0.18;
  const ring = r * 0.45;
  if (starCount === 1) {
    drawStar(ctx, cx, cy, starR, 5, "#b91c1c");
  } else {
    for (let i = 0; i < starCount; i++) {
      const angle = (i * 2 * Math.PI) / starCount - Math.PI / 2;
      drawStar(ctx, cx + Math.cos(angle) * ring, cy + Math.sin(angle) * ring, starR, 5, "#b91c1c");
    }
  }

  // Reflet
  const shine = ctx.createRadialGradient(
    cx - r / 2.2,
    cy - r / 2.2,
    0,
    cx - r / 3,
    cy - r / 3,
    r / 2.5,
  );
  shine.addColorStop(0, "rgba(255, 255, 255, 0.6)");
  shine.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = shine;
  circlePath(ctx, cx, cy, r);
  ctx.fill();
}

// ─── Images ────────────────────────────────────────────────────────────────

/**
 * Dessine une image en mode `object-fit: cover` — remplit la zone cible en
 * préservant le ratio, crop ce qui dépasse. Évite la distorsion des
 * backgrounds d'aspects variés.
 */
export function drawImageCover(
  ctx: SKRSContext2D,
  img: { width: number; height: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  /** Centre of interest as fractions of the image (default: its centre): the crop follows it. */
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): void {
  const srcRatio = img.width / img.height;
  const dstRatio = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > dstRatio) {
    // source plus large → crop gauche/droite
    sw = img.height * dstRatio;
    sx = Math.min(img.width - sw, Math.max(0, focus.x * img.width - sw / 2));
  } else {
    // source plus haute → crop haut/bas
    sh = img.width / dstRatio;
    sy = Math.min(img.height - sh, Math.max(0, focus.y * img.height - sh / 2));
  }
  // @ts-expect-error signature drawImage 9-arg
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// ─── Formatters ────────────────────────────────────────────────────────────

/** Compresse un nombre en K / M / B / T (pour affichage scouter). */
export function kiScouterLabel(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1).replace(/\.0$/, "")}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

// ─── Images distantes (avatars, frames d'épisodes) ─────────────────────────

export interface RemoteImageCacheOptions {
  /** Decoded images kept (LRU). */
  max: number;
  /** How long a decoded image is served without asking again. */
  ttlMs: number;
  /** Time allowed for one download. */
  timeoutMs: number;
  /** A response above this is not an image of this kind and is not decoded. */
  maxBytes: number;
  /** How long a failed URL is not asked again (a CDN outage must not cost a timeout per card). */
  failureTtlMs: number;
  /**
   * Directory of a disk copy of the downloaded bytes, shared by every process and render
   * worker of the machine (a download is paid once, a restart does not pay it again).
   */
  diskDir?: () => string | null;
}

export interface RemoteImageCache {
  load(url: string): Promise<Image | null>;
  clear(): void;
}

/** Disk name of a URL: a hash, so any URL maps to a safe file name. */
const diskName = (url: string): string => `${Bun.hash(url).toString(16)}.img`;

/**
 * Bounded cache of remote pictures, decoded once and shared by every card: LRU, expiry,
 * one download for simultaneous requests of the same URL, a timeout, a size cap and a memory
 * of failures. A failed or slow URL resolves `null` and the caller draws its fallback.
 */
export function createRemoteImageCache(options: RemoteImageCacheOptions): RemoteImageCache {
  const images = new Map<string, { image: Image; at: number }>();
  const failures = new Map<string, number>();
  const inflight = new Map<string, Promise<Image | null>>();

  const fromDisk = async (url: string): Promise<Buffer | null> => {
    const dir = options.diskDir?.();
    if (!dir) return null;
    try {
      const file = Bun.file(`${dir}/${diskName(url)}`);
      if (!(await file.exists()) || file.size === 0) return null;
      return Buffer.from(await file.arrayBuffer());
    } catch {
      return null;
    }
  };
  const toDisk = async (url: string, bytes: Buffer): Promise<void> => {
    const dir = options.diskDir?.();
    if (!dir) return;
    try {
      const target = `${dir}/${diskName(url)}`;
      const partial = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.part`;
      await Bun.write(partial, bytes); // creates the directory
      await rename(partial, target);
    } catch {
      // the disk copy is an optimisation, never a failure
    }
  };

  const remember = (url: string, image: Image): void => {
    images.set(url, { image, at: Date.now() });
    while (images.size > options.max) {
      const oldest = images.keys().next().value;
      if (oldest === undefined) break;
      images.delete(oldest);
    }
  };

  return {
    async load(url) {
      const hit = images.get(url);
      if (hit && Date.now() - hit.at < options.ttlMs) {
        images.delete(url);
        images.set(url, hit);
        return hit.image;
      }
      const failedAt = failures.get(url);
      if (failedAt !== undefined && Date.now() - failedAt < options.failureTtlMs) return null;
      const pending = inflight.get(url);
      if (pending) return pending;
      const task = (async () => {
        try {
          let bytes = await fromDisk(url);
          if (!bytes) {
            const res = await fetch(url, { signal: AbortSignal.timeout(options.timeoutMs) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            bytes = Buffer.from(await res.arrayBuffer());
            if (bytes.length > options.maxBytes) throw new Error("image too large");
            const image = await loadImage(bytes);
            void toDisk(url, bytes);
            failures.delete(url);
            remember(url, image);
            return image;
          }
          const image = await loadImage(bytes);
          failures.delete(url);
          remember(url, image);
          return image;
        } catch {
          failures.set(url, Date.now());
          if (failures.size > options.max) {
            const oldest = failures.keys().next().value;
            if (oldest !== undefined) failures.delete(oldest);
          }
          return null;
        } finally {
          inflight.delete(url);
        }
      })();
      inflight.set(url, task);
      return task;
    },
    clear() {
      images.clear();
      failures.clear();
    },
  };
}

/**
 * Avatars (Discord CDN): LRU of 256 for an hour, 5 s per download, nothing above 4 MiB (an
 * avatar is a few tens of KiB), a failed URL is not asked again for a minute.
 */
const avatars = createRemoteImageCache({
  max: 256,
  ttlMs: 60 * 60_000,
  timeoutMs: 5_000,
  maxBytes: 4 * 1024 * 1024,
  failureTtlMs: 60_000,
});

/**
 * Frames of episodes (cards backdrops, ~25 KiB WebP each): a smaller LRU, since a decoded
 * frame is a megabyte, backed by a disk copy so the render workers and a restart do not
 * download them again. `SHENRON_FRAME_CACHE_DIR` moves the copy (default: system temp dir).
 */
const frames = createRemoteImageCache({
  max: 24,
  ttlMs: 6 * 60 * 60_000,
  timeoutMs: 8_000,
  maxBytes: 1024 * 1024,
  failureTtlMs: 60_000,
  diskDir: () => process.env.SHENRON_FRAME_CACHE_DIR || `${tmpdir()}/shenron-frames`,
});

/** Forgets every cached and failed remote image (tests, `/reload`). */
export function clearRemoteImageCache(): void {
  avatars.clear();
  frames.clear();
}

/**
 * Image distante (avatar Discord) décodée, partagée par toutes les cartes. Les demandes
 * simultanées d'une même URL partagent un seul téléchargement, et un CDN lent ne bloque pas
 * un rendu plus de 5 s (`null` : l'appelant dessine son repli).
 */
export const loadRemoteImage = avatars.load;

/** Frame d'épisode distante (fond de carte), décodée, avec copie sur disque. */
export const loadFrameImage = frames.load;

/** `http(s)://...`: a picture to download rather than a file of the bot. */
export const isRemoteRef = (ref: string): boolean =>
  ref.startsWith("https://") || ref.startsWith("http://");
