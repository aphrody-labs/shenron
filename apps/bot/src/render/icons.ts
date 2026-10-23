/**
 * Pictograms of the cards: the glyph geometries measured on the manga (constant ink line,
 * mitred corners, flat fills), drawn through `Path2D`. `icons.generated.ts` is their
 * projection from `packages/ui`; nothing is drawn by hand here.
 */
import { Path2D, type SKRSContext2D } from "@napi-rs/canvas";
import { ICONS, ICON_BOX, ICON_MITER, ICON_STROKE, type IconName } from "./icons.generated";

export type { IconName } from "./icons.generated";
export { ICONS, ICON_BOX, ICON_STROKE } from "./icons.generated";

export interface IconOptions {
  /** Fill colour of the flat parts; default: `color`. */
  fill?: string;
  /** Colour painted inside the closed outlines first (the disc of a ball), none by default. */
  backing?: string;
  /** Ink halo around the glyph, so it reads on a busy picture: colour and width in box units. */
  outline?: { color: string; width?: number };
  /** Hard drop shadow: colour and offset in box units. */
  shadow?: { color: string; dx?: number; dy?: number };
  /** Line width in box units (default: the measured 2). */
  strokeWidth?: number;
  /** Rotation around the centre, in radians. */
  rotate?: number;
  alpha?: number;
}

interface Compiled {
  strokes: Path2D[];
  fills: Path2D[];
}

const compiled = new Map<IconName, Compiled>();

function paths(name: IconName): Compiled {
  let found = compiled.get(name);
  if (!found) {
    const icon = ICONS[name];
    found = {
      strokes: icon.strokes.map((d) => new Path2D(d)),
      fills: icon.fills.map((d) => new Path2D(d)),
    };
    compiled.set(name, found);
  }
  return found;
}

/**
 * Size, in canvas pixels, of the drawing box that makes a glyph measure `extent` pixels from
 * its anchor to its edge (a ball of radius 20 px, a sparkle of 14 px).
 */
export function iconSizeForRadius(name: IconName, radius: number): number {
  return (radius * ICON_BOX) / ICONS[name].radius;
}

/**
 * Draws a pictogram centred on `(cx, cy)`. `size` is the side of the drawing box in canvas
 * pixels (the glyph fills about 90 % of it); whole geometries are centred on their box, the
 * derived parts on their own anchor. Closed outlines are stroked with the measured ink line,
 * flat parts are filled, nothing is gradient.
 */
export function drawIcon(
  ctx: SKRSContext2D,
  name: IconName,
  cx: number,
  cy: number,
  size: number,
  color: string,
  options: IconOptions = {},
): void {
  const icon = ICONS[name];
  const { strokes, fills } = paths(name);
  const unit = size / ICON_BOX;
  const line = options.strokeWidth ?? ICON_STROKE;
  ctx.save();
  if (options.alpha !== undefined) ctx.globalAlpha *= options.alpha;
  ctx.translate(cx, cy);
  if (options.rotate) ctx.rotate(options.rotate);
  ctx.scale(unit, unit);
  ctx.translate(-icon.anchor[0], -icon.anchor[1]);
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.miterLimit = ICON_MITER;

  const paint = (tone: { line: string; flat: string }, halo: number) => {
    for (const path of fills) {
      ctx.fillStyle = tone.flat;
      ctx.fill(path);
      if (halo > 0) {
        ctx.lineWidth = halo;
        ctx.strokeStyle = tone.flat;
        ctx.stroke(path);
      }
    }
    for (const path of strokes) {
      ctx.lineWidth = line + halo;
      ctx.strokeStyle = tone.line;
      ctx.stroke(path);
    }
  };

  const outline = options.outline;
  const halo = outline ? 2 * (outline.width ?? 1.2) : 0;
  const shadow = options.shadow;
  if (shadow) {
    ctx.save();
    ctx.translate(shadow.dx ?? 0.9, shadow.dy ?? 1.1);
    paint({ line: shadow.color, flat: shadow.color }, halo);
    ctx.restore();
  }
  if (outline) paint({ line: outline.color, flat: outline.color }, halo);
  if (options.backing) {
    ctx.fillStyle = options.backing;
    for (const path of strokes) ctx.fill(path);
  }
  paint({ line: color, flat: options.fill ?? color }, 0);
  ctx.restore();
}
