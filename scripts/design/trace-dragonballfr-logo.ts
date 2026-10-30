// SPDX-License-Identifier: Apache-2.0
/**
 * Traces the owner's DRAGONBALL.FR logo reference (transparent raster) into a layered SVG:
 * black outline silhouette, yellow « DRAGON », red « BALL » and « FR », orange spheres, red stars.
 * Each layer is one even-odd path built from the binary pixel boundary of its colour class,
 * simplified (Douglas-Peucker) and joined with quadratic curves so stair steps disappear while
 * long angular corners stay sharp. The lossless PNGs are rendered from the traced SVG.
 *
 * Usage: bun scripts/design/trace-dragonballfr-logo.ts <reference.webp|png> [--write]
 * Writes packages/ui/assets/brand/dragonballfr-logo.svg, its PNG renders and the site module
 * apps/site/src/lib/dragonballfr-logo.generated.ts (OpenGraph image) with --write.
 */
import { resolve } from "node:path";

type Point = readonly [number, number];
type Layer = "outline" | "yellow" | "red" | "orange" | "star";

export const LOGO_COLORS: Record<Layer, string> = {
  outline: "#000000",
  yellow: "#fede1a",
  red: "#cc0a22",
  orange: "#e89a24",
  star: "#d4141f",
};

function distance(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplify(points: Point[], epsilon: number): Point[] {
  let maximum = 0;
  let pivot = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const error = distance(points[i]!, points[0]!, points.at(-1)!);
    if (error > maximum) {
      maximum = error;
      pivot = i;
    }
  }
  if (maximum <= epsilon) return [points[0]!, points.at(-1)!];
  return [
    ...simplify(points.slice(0, pivot + 1), epsilon).slice(0, -1),
    ...simplify(points.slice(pivot), epsilon),
  ];
}

function smoothPath(input: Point[], dx: number, dy: number): string {
  const points = input.slice(0, -1);
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const pair = (p: Point) => `${Number((p[0] - dx).toFixed(1))} ${Number((p[1] - dy).toFixed(1))}`;
  let d = `M${pair(mid(points.at(-1)!, points[0]!))}`;
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i - 1 + points.length) % points.length]!;
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const corner = distance(current, mid(previous, current), mid(current, next)) > 1.6;
    d += corner
      ? `L${pair(current)}L${pair(mid(current, next))}`
      : `Q${pair(current)} ${pair(mid(current, next))}`;
  }
  return `${d}Z`;
}

/** Closed pixel-edge loops of a binary mask (outer contours and holes). */
function boundary(mask: Uint8Array, width: number, height: number, minPoints: number): Point[][] {
  const edges = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (width + 1) + x;
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const list = edges.get(k) ?? [];
    list.push(key(bx, by));
    edges.set(k, list);
  };
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (on(x, y)) {
        if (!on(x, y - 1)) add(x, y, x + 1, y);
        if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
        if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
        if (!on(x - 1, y)) add(x, y + 1, x, y);
      }
  const loops: Point[][] = [];
  const point = (k: number): Point => [k % (width + 1), Math.floor(k / (width + 1))];
  while (edges.size) {
    const first = edges.keys().next().value!;
    let current = first;
    const points: Point[] = [point(first)];
    do {
      const outgoing = edges.get(current)!;
      const next = outgoing.pop()!;
      if (!outgoing.length) edges.delete(current);
      current = next;
      points.push(point(next));
    } while (current !== first && edges.has(current));
    if (points.length > minPoints) loops.push(points);
  }
  return loops;
}

/** Splits a mask into connected components (4-neighbour), returning per-pixel labels and areas. */
function components(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(width * height);
  const areas: number[] = [0];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const label = areas.length;
    let area = 0;
    labels[start] = label;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % width;
      for (const n of [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1])
        if (n >= 0 && n < mask.length && mask[n] && !labels[n]) {
          labels[n] = label;
          stack.push(n);
        }
    }
    areas.push(area);
  }
  return { labels, areas };
}

async function rgba(path: string) {
  const image = new Bun.Image(path) as Bun.Image & {
    rgba?: () => Promise<{ width: number; height: number; data: Uint8Array }>;
  };
  if (typeof image.rgba === "function") return image.rgba();
  // Runtimes without Bun.Image.rgba: decode through ImageMagick.
  const size = Bun.spawnSync(["magick", path, "-format", "%w %h", "info:"]).stdout.toString();
  const [width, height] = size.trim().split(" ").map(Number) as [number, number];
  const data = Bun.spawnSync(["magick", path, "-depth", "8", "rgba:-"], {
    stdout: "pipe",
  }).stdout;
  if (data.length !== width * height * 4) throw new Error("RGBA decode failed");
  return { width, height, data: new Uint8Array(data) };
}

export async function traceLogo(path: string) {
  const { width, height, data } = await rgba(path);
  const classOf = (i: number): Layer | null => {
    const [r, g, b, a] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!];
    if (a < 128) return null;
    if (r > 200 && g > 185 && b < 130) return "yellow";
    if (r > 185 && g >= 100 && g <= 185 && b < 120) return "orange";
    if (r > 110 && g < 90 && b < 110 && r > g * 2) return "red";
    return "outline";
  };
  const masks = Object.fromEntries(
    (["outline", "yellow", "red", "orange", "star"] as const).map((l) => [
      l,
      new Uint8Array(width * height),
    ]),
  ) as Record<Layer, Uint8Array>;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < width * height; i++) {
    const layer = classOf(i);
    if (!layer) continue;
    masks.outline[i] = 1; // silhouette under every colour
    if (layer !== "outline") masks[layer][i] = 1;
    const x = i % width;
    const y = Math.floor(i / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  // Stars: small red components sitting inside the spheres; letters stay in the red layer.
  const { labels, areas } = components(masks.red, width, height);
  for (let i = 0; i < labels.length; i++)
    if (labels[i] && areas[labels[i]!]! < 8_000) {
      masks.red[i] = 0;
      masks.star[i] = 1;
    }
  // Spheres include the star area so the star sits on orange, not on the black silhouette.
  for (let i = 0; i < labels.length; i++) if (masks.star[i]) masks.orange[i] = 1;

  const pad = 4;
  const dx = minX - pad;
  const dy = minY - pad;
  const viewWidth = maxX - minX + 1 + pad * 2;
  const viewHeight = maxY - minY + 1 + pad * 2;
  const layers = (["outline", "yellow", "red", "orange", "star"] as const).map((layer) => {
    const loops = boundary(masks[layer], width, height, layer === "star" ? 12 : 24);
    const d = loops.map((loop) => smoothPath(simplify(loop, 0.9), dx, dy)).join("");
    return { layer, loops: loops.length, d };
  });
  return { width, height, viewWidth, viewHeight, layers };
}

export function renderLogoSvg(
  trace: Awaited<ReturnType<typeof traceLogo>>,
  title = "DragonBall.fr",
) {
  const paths = trace.layers
    .map(({ layer, d }) => `<path fill="${LOGO_COLORS[layer]}" fill-rule="evenodd" d="${d}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${trace.viewWidth} ${trace.viewHeight}" role="img" aria-labelledby="dbfr-logo-title"><title id="dbfr-logo-title">${title}</title>${paths}</svg>\n`;
}

if (import.meta.main) {
  const input = Bun.argv[2];
  if (!input) throw new Error("Usage: trace-dragonballfr-logo.ts <reference> [--write]");
  const trace = await traceLogo(resolve(input));
  const svg = renderLogoSvg(trace);
  const out = resolve(import.meta.dir, "../../packages/ui/assets/brand");
  console.log(
    JSON.stringify({
      viewBox: [trace.viewWidth, trace.viewHeight],
      layers: trace.layers.map(({ layer, loops, d }) => ({ layer, loops, bytes: d.length })),
      svgBytes: svg.length,
    }),
  );
  if (Bun.argv.includes("--write")) {
    await Bun.write(`${out}/dragonballfr-logo.svg`, svg);
    await Bun.write(
      resolve(import.meta.dir, "../../apps/site/src/lib/dragonballfr-logo.generated.ts"),
      `// Generated by scripts/design/trace-dragonballfr-logo.ts; do not edit.
export const DRAGONBALLFR_LOGO_SIZE = { width: ${trace.viewWidth}, height: ${trace.viewHeight} } as const;
export const DRAGONBALLFR_LOGO_SVG = ${JSON.stringify(svg.trim())};
`,
    );
    for (const w of [2048, 1024, 512])
      Bun.spawnSync([
        "magick",
        "-background",
        "none",
        "-density",
        String(Math.ceil((96 * w) / trace.viewWidth)),
        `${out}/dragonballfr-logo.svg`,
        "-resize",
        `${w}x`,
        "-define",
        "png:compression-level=9",
        `PNG32:${out}/dragonballfr-logo-${w}.png`,
      ]);
  }
}
