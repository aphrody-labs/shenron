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
import { GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { botFile } from "~/lib/asset-files";
import { CANVAS_FONT_FILES } from "~/lib/canvas-fonts";
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

export function drawStar(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  r: number,
  points = 5,
  color = "#ffffff",
): void {
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
    sx = (img.width - sw) / 2;
  } else {
    // source plus haute → crop haut/bas
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
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

// ─── Images distantes (avatars) ────────────────────────────────────────────

const REMOTE_IMAGE_MAX = 256;
const REMOTE_IMAGE_TTL_MS = 60 * 60_000;
const REMOTE_IMAGE_TIMEOUT_MS = 5_000;
/** An avatar is a few tens of KiB: anything above this is not one, and is not decoded. */
const REMOTE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
/** How long a failed URL is not asked again (a CDN outage must not cost 5 s per card). */
const REMOTE_FAILURE_TTL_MS = 60_000;
const remoteImages = new Map<string, { image: Image; at: number }>();
const remoteFailures = new Map<string, number>();
const remoteInflight = new Map<string, Promise<Image | null>>();

/** Forgets every cached and failed remote image (tests, `/reload`). */
export function clearRemoteImageCache(): void {
  remoteImages.clear();
  remoteFailures.clear();
}

/**
 * Image distante (avatar Discord) décodée, partagée par toutes les cartes.
 *
 * Chaque service gardait sa propre `Map` d'avatars, jamais vidée : une
 * pagination de /top sur tout le serveur y laissait des centaines d'images
 * décodées. Ici le cache est borné (LRU de 256 entrées, 1 h), les demandes
 * simultanées d'une même URL partagent un seul téléchargement, et un CDN lent
 * ne bloque pas un rendu plus de 5 s (`null` : l'appelant dessine son repli).
 * Une URL en échec n'est pas redemandée pendant une minute, et une réponse de
 * plus de 4 Mio n'est pas décodée.
 */
export async function loadRemoteImage(url: string): Promise<Image | null> {
  const hit = remoteImages.get(url);
  if (hit && Date.now() - hit.at < REMOTE_IMAGE_TTL_MS) {
    remoteImages.delete(url);
    remoteImages.set(url, hit);
    return hit.image;
  }
  const failedAt = remoteFailures.get(url);
  if (failedAt !== undefined && Date.now() - failedAt < REMOTE_FAILURE_TTL_MS) return null;
  const pending = remoteInflight.get(url);
  if (pending) return pending;
  const task = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > REMOTE_IMAGE_MAX_BYTES) throw new Error("image too large");
      const image = await loadImage(bytes);
      remoteFailures.delete(url);
      remoteImages.set(url, { image, at: Date.now() });
      while (remoteImages.size > REMOTE_IMAGE_MAX) {
        const oldest = remoteImages.keys().next().value;
        if (oldest === undefined) break;
        remoteImages.delete(oldest);
      }
      return image;
    } catch {
      remoteFailures.set(url, Date.now());
      if (remoteFailures.size > REMOTE_IMAGE_MAX) {
        const oldest = remoteFailures.keys().next().value;
        if (oldest !== undefined) remoteFailures.delete(oldest);
      }
      return null;
    } finally {
      remoteInflight.delete(url);
    }
  })();
  remoteInflight.set(url, task);
  return task;
}
