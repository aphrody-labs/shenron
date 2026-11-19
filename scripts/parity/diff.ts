/**
 * Pixel parity between the web gallery and the GPUI gallery, two masks.
 *   geometry: everything outside text line boxes (boxes, borders, shadows, fills): the gate target is 0 pixels.
 *   text:     inside the text line boxes (padded by TEXT_PAD px): rasteriser differences are expected, the
 *             threshold comes from measurements (see docs/plans/gpui-parite-pixel-120fps.md).
 * Usage: bun diff.ts [--web out/web] [--gpui out/gpui] [--out out/diff] [--theme dark]...
 *                    [--thresholds thresholds.json] [--strict] [--id <id>]...
 * Writes <out>/<theme>/<id>.png (red = differing pixels, text boxes outlined), <out>/<theme>/report.json and
 * prints the report. Exit code 1 when a state is over its threshold or missing; --strict applies the plan's
 * target (geometry 0 pixels, text 0) instead of the measured baseline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const here = import.meta.dir;
const TEXT_PAD = 2;
const PIXELMATCH_THRESHOLD = 0.1;

const { values } = parseArgs({
  options: {
    web: { type: "string", default: join(here, "out/web") },
    gpui: { type: "string", default: join(here, "out/gpui") },
    out: { type: "string", default: join(here, "out/diff") },
    theme: { type: "string", multiple: true },
    id: { type: "string", multiple: true },
    thresholds: { type: "string", default: join(here, "thresholds.json") },
    strict: { type: "boolean", default: false },
  },
});

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Thresholds {
  geometry_ratio: number;
  text_ratio: number;
  states?: Record<string, { geometry_ratio?: number; text_ratio?: number }>;
}

const contract = (await Bun.file(join(here, "states.json")).json()) as {
  states: { id: string }[];
};
const thresholds: Thresholds = existsSync(values.thresholds ?? "")
  ? JSON.parse(readFileSync(values.thresholds ?? "", "utf8"))
  : { geometry_ratio: 0, text_ratio: 0 };
const wanted = values.id?.length ? new Set(values.id) : undefined;
const themes = values.theme?.length ? values.theme : ["dark"];

function read(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

/** Boolean mask of the padded text rectangles. */
function textMask(width: number, height: number, rects: Rect[]): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const rect of rects) {
    const x0 = Math.max(0, Math.floor(rect.x) - TEXT_PAD);
    const y0 = Math.max(0, Math.floor(rect.y) - TEXT_PAD);
    const x1 = Math.min(width, Math.ceil(rect.x + rect.w) + TEXT_PAD);
    const y1 = Math.min(height, Math.ceil(rect.y + rect.h) + TEXT_PAD);
    for (let y = y0; y < y1; y += 1) mask.fill(1, y * width + x0, y * width + x1);
  }
  return mask;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

const report: Record<string, unknown[]> = {};
let failed = false;

for (const theme of themes) {
  const bounds: Record<string, { parts: Record<string, Rect>; text: Rect[] }> = JSON.parse(
    readFileSync(join(values.web ?? "", theme, "bounds.json"), "utf8"),
  );
  const gpuiBoundsPath = join(values.gpui ?? "", theme, "bounds.json");
  const gpuiBounds: Record<string, { parts: Record<string, Rect> }> | undefined = existsSync(gpuiBoundsPath)
    ? JSON.parse(readFileSync(gpuiBoundsPath, "utf8"))
    : undefined;
  const outDir = join(values.out ?? "", theme);
  mkdirSync(outDir, { recursive: true });
  const rows: unknown[] = [];
  for (const { id } of contract.states) {
    if (wanted && !wanted.has(id)) continue;
    const name = `${id.replaceAll("/", "__")}.png`;
    const webPath = join(values.web ?? "", theme, name);
    const gpuiPath = join(values.gpui ?? "", theme, name);
    if (!existsSync(webPath) || !existsSync(gpuiPath)) {
      rows.push({ id, theme, status: "missing", web: existsSync(webPath), gpui: existsSync(gpuiPath), pass: false });
      failed = true;
      continue;
    }
    const web = read(webPath);
    const gpui = read(gpuiPath);
    if (web.width !== gpui.width || web.height !== gpui.height) {
      rows.push({ id, theme, status: "size-mismatch", web: [web.width, web.height], gpui: [gpui.width, gpui.height], pass: false });
      failed = true;
      continue;
    }
    const { width, height } = web;
    const mask = textMask(width, height, bounds[id]?.text ?? []);
    // Geometry: text boxes are made equal in both images so only the rest can differ.
    const webGeometry = PNG.sync.read(PNG.sync.write(web));
    const gpuiGeometry = PNG.sync.read(PNG.sync.write(gpui));
    // Text: everything outside the boxes is made equal so only the text can differ.
    const webText = PNG.sync.read(PNG.sync.write(web));
    const gpuiText = PNG.sync.read(PNG.sync.write(gpui));
    let textArea = 0;
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      if (mask[index]) {
        textArea += 1;
        for (let k = 0; k < 4; k += 1) gpuiGeometry.data[offset + k] = webGeometry.data[offset + k];
      } else {
        for (let k = 0; k < 4; k += 1) gpuiText.data[offset + k] = webText.data[offset + k];
      }
    }
    const geometryOut = new PNG({ width, height });
    const textOut = new PNG({ width, height });
    const options = { threshold: PIXELMATCH_THRESHOLD, includeAA: false };
    const geometryDiff = pixelmatch(webGeometry.data, gpuiGeometry.data, geometryOut.data, width, height, options);
    const textDiff = pixelmatch(webText.data, gpuiText.data, textOut.data, width, height, options);
    // Combined image: geometry differences in red, text differences in blue, shared pixels dimmed.
    const combined = new PNG({ width, height });
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      const geometryRed = geometryOut.data[offset] === 255 && geometryOut.data[offset + 1] === 0 && !mask[index];
      const textRed = textOut.data[offset] === 255 && textOut.data[offset + 1] === 0 && mask[index];
      combined.data[offset] = geometryRed ? 255 : textRed ? 40 : web.data[offset] >> 2;
      combined.data[offset + 1] = geometryRed ? 0 : textRed ? 120 : web.data[offset + 1] >> 2;
      combined.data[offset + 2] = geometryRed ? 0 : textRed ? 255 : web.data[offset + 2] >> 2;
      combined.data[offset + 3] = 255;
    }
    writeFileSync(join(outDir, name), PNG.sync.write(combined));

    const geometryArea = width * height - textArea;
    const geometryRatio = geometryDiff / geometryArea;
    const textRatio = textArea > 0 ? textDiff / textArea : 0;
    const limit = thresholds.states?.[id];
    const geometryLimit = values.strict ? 0 : (limit?.geometry_ratio ?? thresholds.geometry_ratio);
    const textLimit = values.strict ? 0 : (limit?.text_ratio ?? thresholds.text_ratio);
    const pass = geometryRatio <= geometryLimit && textRatio <= textLimit;
    if (!pass) failed = true;

    const boundsDelta: Record<string, { dx: number; dy: number; dw: number; dh: number }> = {};
    for (const [part, rect] of Object.entries(bounds[id]?.parts ?? {})) {
      const other = gpuiBounds?.[id]?.parts?.[part];
      if (other) boundsDelta[part] = { dx: round(other.x - rect.x), dy: round(other.y - rect.y), dw: round(other.w - rect.w), dh: round(other.h - rect.h) };
    }
    rows.push({
      id,
      theme,
      pixels_diff: geometryDiff + textDiff,
      ratio: round((geometryDiff + textDiff) / (width * height)),
      geometry: { pixels_diff: geometryDiff, ratio: round(geometryRatio), area: geometryArea, limit: geometryLimit },
      text: { pixels_diff: textDiff, ratio: round(textRatio), area: textArea, limit: textLimit },
      bounds_delta: gpuiBounds ? boundsDelta : null,
      pass,
    });
  }
  report[theme] = rows;
  writeFileSync(join(outDir, "report.json"), `${JSON.stringify(rows, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
