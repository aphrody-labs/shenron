/**
 * Qualification of one episode frame: the numbers the card backdrops are chosen from.
 *
 * Pure and deterministic (fixed loop order, no randomness, rounded output): the same pixels
 * give the same analysis on any machine and in any worker, so the catalog built on all
 * cores is byte-identical to a sequential build. Decoding goes through `Bun.Image`.
 *
 * What is measured on a 256 px wide copy of the frame:
 *   luma, contrast, range   exposure and dynamics
 *   sharpness               variance of the Laplacian (blurred transitions score low)
 *   saturation, colourfulness, dominant hue and colour
 *   flags                   black, white, transition (fade, flat, flash), text (title cards,
 *                           credits, burned-in subtitles), credits (text on a dark ground)
 *   focus                   centre of a simple saliency map (colour surprise + edges)
 *   crop21, crop11          the 2:1 and 1:1 windows holding most of the saliency
 */

/** Width of the analysis copy; frames are 640 px wide, a quarter of the pixels is enough. */
export const ANALYSIS_WIDTH = 256;

/** Saliency grid (cells). */
const GRID_X = 32;
const GRID_Y = 24;

export interface RawFrame {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array | Uint8ClampedArray;
}

export type FrameFlag = "black" | "white" | "transition" | "text" | "credits";

/** A window of the frame, as fractions of its width and height. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Share of the saliency inside the window, 0 to 1. */
  held: number;
}

export interface FrameAnalysis {
  /** Mean luma, 0 to 1. */
  luma: number;
  /** Standard deviation of the luma, 0 to 1. */
  contrast: number;
  /** Luma of the 98th percentile minus the 2nd, 0 to 1. */
  range: number;
  /** Variance of the Laplacian of the luma (0..255 scale). */
  sharpness: number;
  /** Mean HSV saturation of the lit pixels, 0 to 1. */
  saturation: number;
  /** Hasler-Suesstrunk colourfulness, about 0 to 150. */
  colorfulness: number;
  /** Dominant hue in degrees, -1 when the frame is achromatic. */
  hue: number;
  /** Mean colour of the dominant hue (the whole frame when achromatic), `#rrggbb`. */
  dominant: string;
  /** Share of the frame in each 30 degree hue sector from red (0 to 30), saturated pixels only. */
  hueShares: number[];
  /** Text-likeness, 0 to 1. */
  text: number;
  /** Share of dark pixels (luma below 45/255), 0 to 1. */
  dark: number;
  flags: FrameFlag[];
  /** Centre of interest, fractions of the frame. */
  focus: [number, number];
  crop21: Crop;
  crop11: Crop;
  /** Quality of the frame as a card background, 0 to 1 (flags already weigh in). */
  score: number;
}

export interface AnalysisContext {
  /** The frame sits in the last minutes of its episode (credits, next-episode teaser). */
  nearEnd?: boolean;
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const round = (value: number, digits = 3): number => {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
};
const hex2 = (value: number): string => Math.round(value).toString(16).padStart(2, "0");

/** Window of aspect `ratio` (width : height) holding the most saliency, on the saliency grid. */
function bestWindow(
  integral: Float64Array,
  total: number,
  frameAspect: number,
  ratio: number,
): Crop {
  // window as fractions of the frame
  let ww = 1;
  let wh = 1;
  if (frameAspect / ratio >= 1) ww = ratio / frameAspect;
  else wh = frameAspect / ratio;
  const cw = Math.max(1, Math.min(GRID_X, Math.round(ww * GRID_X)));
  const ch = Math.max(1, Math.min(GRID_Y, Math.round(wh * GRID_Y)));
  const stride = GRID_X + 1;
  let best = -1;
  let bestX = 0;
  let bestY = 0;
  const centerX = (GRID_X - cw) / 2;
  const centerY = (GRID_Y - ch) / 2;
  let bestDistance = Infinity;
  for (let oy = 0; oy <= GRID_Y - ch; oy++) {
    for (let ox = 0; ox <= GRID_X - cw; ox++) {
      const sum =
        integral[(oy + ch) * stride + ox + cw]! -
        integral[oy * stride + ox + cw]! -
        integral[(oy + ch) * stride + ox]! +
        integral[oy * stride + ox]!;
      // ties go to the window nearest the centre of the frame
      const distance = (ox - centerX) ** 2 + (oy - centerY) ** 2;
      if (sum > best + 1e-9 || (Math.abs(sum - best) <= 1e-9 && distance < bestDistance)) {
        best = sum;
        bestX = ox;
        bestY = oy;
        bestDistance = distance;
      }
    }
  }
  // the window as printed must still fit in the frame: shift from the rounded size
  const width = round(ww);
  const height = round(wh);
  return {
    x: round(Math.min(bestX / GRID_X, 1 - width)),
    y: round(Math.min(bestY / GRID_Y, 1 - height)),
    w: width,
    h: height,
    held: total > 0 ? round(best / total) : round(ww * wh),
  };
}

/** Luma above which a pixel may belong to white lettering. */
const LETTER_LUMA = 214;

/**
 * Text-likeness: white lettering is a row of small, similar, bright components. Components of
 * the bright mask are collected (flood fill), kept when they are letter-sized, and a window of
 * a few pixels high holding at least five of them over a quarter of the width, with similar
 * heights, is a line of text. Highlights of eyes and hair, clouds and glints do not line up.
 * Returns 0 to 1 (1: a clear line of ten letters or more).
 */
function letterLines(luma: Float32Array, w: number, h: number): number {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const cx: number[] = [];
  const cy: number[] = [];
  const ch: number[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || luma[start]! < LETTER_LUMA) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    while (top > 0) {
      const i = stack[--top]!;
      area++;
      const x = i % w;
      const y = (i - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && !seen[i - 1] && luma[i - 1]! >= LETTER_LUMA) {
        seen[i - 1] = 1;
        stack[top++] = i - 1;
      }
      if (x < w - 1 && !seen[i + 1] && luma[i + 1]! >= LETTER_LUMA) {
        seen[i + 1] = 1;
        stack[top++] = i + 1;
      }
      if (y > 0 && !seen[i - w] && luma[i - w]! >= LETTER_LUMA) {
        seen[i - w] = 1;
        stack[top++] = i - w;
      }
      if (y < h - 1 && !seen[i + w] && luma[i + w]! >= LETTER_LUMA) {
        seen[i + w] = 1;
        stack[top++] = i + w;
      }
    }
    if (area > 500) continue; // too large for a letter
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const fill = area / (bw * bh);
    if (area < 5 || bw < 2 || bw > 36 || bh < 5 || bh > 36 || fill < 0.18) continue;
    cx.push((minX + maxX) / 2);
    cy.push((minY + maxY) / 2);
    ch.push(bh);
  }
  if (cx.length < 5) return 0;
  // sliding windows, 6 px high, every 2 px
  let best = 0;
  const order = cy.map((_, i) => i).toSorted((a, b) => cy[a]! - cy[b]!);
  for (let top = 0; top <= h - 6; top += 2) {
    const inside: number[] = [];
    for (const i of order) {
      if (cy[i]! >= top && cy[i]! < top + 6) inside.push(i);
      else if (cy[i]! >= top + 6) break;
    }
    if (inside.length < 5) continue;
    const heights = inside.map((i) => ch[i]!).toSorted((a, b) => a - b);
    const median = heights[heights.length >> 1]!;
    const similar = inside.filter((i) => ch[i]! >= median * 0.6 && ch[i]! <= median * 1.6);
    if (similar.length < 5) continue;
    let minX = w;
    let maxX = 0;
    for (const i of similar) {
      if (cx[i]! < minX) minX = cx[i]!;
      if (cx[i]! > maxX) maxX = cx[i]!;
    }
    const span = (maxX - minX) / w;
    if (span < 0.22) continue;
    const score = clamp01((similar.length - 3) / 7) * clamp01(span / 0.4);
    if (score > best) best = score;
  }
  return best;
}

/** Qualifies one decoded frame. */
export function analyzePixels(frame: RawFrame, context: AnalysisContext = {}): FrameAnalysis {
  const { width: w, height: h, data } = frame;
  const n = w * h;
  const luma = new Float32Array(n);
  const histogram = new Uint32Array(256);
  let sumY = 0;
  let sumY2 = 0;
  let sumS = 0;
  let countS = 0;
  let sumRg = 0;
  let sumRg2 = 0;
  let sumYb = 0;
  let sumYb2 = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const hueWeight = new Float64Array(36);
  const hueR = new Float64Array(36);
  const hueG = new Float64Array(36);
  const hueB = new Float64Array(36);

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p]!;
    const g = data[p + 1]!;
    const b = data[p + 2]!;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = y;
    histogram[y | 0]!++;
    sumY += y;
    sumY2 += y * y;
    sumR += r;
    sumG += g;
    sumB += b;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumRg += rg;
    sumRg2 += rg * rg;
    sumYb += yb;
    sumYb2 += yb * yb;
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (max >= 40) {
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;
      const s = (max - min) / max;
      sumS += s;
      countS++;
      if (s > 0.25) {
        let hue: number;
        const d = max - min;
        if (max === r) hue = ((g - b) / d + 6) % 6;
        else if (max === g) hue = (b - r) / d + 2;
        else hue = (r - g) / d + 4;
        const bin = Math.min(35, Math.floor(hue * 6));
        const weight = s * (max / 255);
        hueWeight[bin]! += weight;
        hueR[bin]! += r * weight;
        hueG[bin]! += g * weight;
        hueB[bin]! += b * weight;
      }
    }
  }

  const meanY = sumY / n;
  const stdY = Math.sqrt(Math.max(0, sumY2 / n - meanY * meanY));
  const percentile = (share: number): number => {
    const target = share * n;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += histogram[v]!;
      if (acc >= target) return v;
    }
    return 255;
  };
  const p02 = percentile(0.02);
  const p98 = percentile(0.98);
  let darkCount = 0;
  for (let v = 0; v < 45; v++) darkCount += histogram[v]!;
  const dark = darkCount / n;
  const saturation = countS > 0 ? sumS / countS : 0;
  const meanRg = sumRg / n;
  const meanYb = sumYb / n;
  const colorfulness =
    Math.sqrt(
      Math.max(0, sumRg2 / n - meanRg * meanRg) + Math.max(0, sumYb2 / n - meanYb * meanYb),
    ) +
    0.3 * Math.sqrt(meanRg * meanRg + meanYb * meanYb);

  // dominant hue
  let hueBin = -1;
  let hueTotal = 0;
  let hueBest = 0;
  for (let bin = 0; bin < 36; bin++) {
    hueTotal += hueWeight[bin]!;
    if (hueWeight[bin]! > hueBest) {
      hueBest = hueWeight[bin]!;
      hueBin = bin;
    }
  }
  const chromatic = hueBin >= 0 && hueTotal > n * 0.01;
  const dominant = chromatic
    ? `#${hex2(hueR[hueBin]! / hueBest)}${hex2(hueG[hueBin]! / hueBest)}${hex2(hueB[hueBin]! / hueBest)}`
    : `#${hex2(sumR / n)}${hex2(sumG / n)}${hex2(sumB / n)}`;

  // sharpness: variance of the 4-neighbour Laplacian
  let lapSum = 0;
  let lapSum2 = 0;
  let lapCount = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const lap = luma[i - 1]! + luma[i + 1]! + luma[i - w]! + luma[i + w]! - 4 * luma[i]!;
      lapSum += lap;
      lapSum2 += lap * lap;
      lapCount++;
    }
  }
  const lapMean = lapSum / Math.max(1, lapCount);
  const sharpness = Math.max(0, lapSum2 / Math.max(1, lapCount) - lapMean * lapMean);

  // text: bright letters aligned on a line (title cards, credits, burned-in subtitles)
  const text = letterLines(luma, w, h);

  // saliency on a coarse grid: colour surprise against the frame average, plus edge energy
  const cells = GRID_X * GRID_Y;
  const cellY = new Float64Array(cells);
  const cellRg = new Float64Array(cells);
  const cellYb = new Float64Array(cells);
  const cellEdge = new Float64Array(cells);
  const cellCount = new Float64Array(cells);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(GRID_Y - 1, Math.floor((y * GRID_Y) / h));
    for (let x = 0; x < w; x++) {
      const gx = Math.min(GRID_X - 1, Math.floor((x * GRID_X) / w));
      const cell = gy * GRID_X + gx;
      const i = y * w + x;
      const p = i * 4;
      const r = data[p]!;
      const g = data[p + 1]!;
      const b = data[p + 2]!;
      cellY[cell]! += luma[i]!;
      cellRg[cell]! += r - g;
      cellYb[cell]! += 0.5 * (r + g) - b;
      cellCount[cell]! += 1;
      if (x < w - 1 && y < h - 1) {
        cellEdge[cell]! += Math.abs(luma[i + 1]! - luma[i]!) + Math.abs(luma[i + w]! - luma[i]!);
      }
    }
  }
  const surprise = new Float64Array(cells);
  let surpriseMax = 0;
  let edgeMax = 0;
  for (let cell = 0; cell < cells; cell++) {
    const count = cellCount[cell]! || 1;
    const dy = cellY[cell]! / count - meanY;
    const drg = cellRg[cell]! / count - meanRg;
    const dyb = cellYb[cell]! / count - meanYb;
    const value = Math.sqrt(dy * dy + drg * drg + dyb * dyb);
    surprise[cell] = value;
    cellEdge[cell] = cellEdge[cell]! / count;
    if (value > surpriseMax) surpriseMax = value;
    if (cellEdge[cell]! > edgeMax) edgeMax = cellEdge[cell]!;
  }
  const saliency = new Float64Array(cells);
  const stride = GRID_X + 1;
  const integral = new Float64Array(stride * (GRID_Y + 1));
  let total = 0;
  let focusX = 0;
  let focusY = 0;
  let focusWeight = 0;
  for (let gy = 0; gy < GRID_Y; gy++) {
    let rowSum = 0;
    for (let gx = 0; gx < GRID_X; gx++) {
      const cell = gy * GRID_X + gx;
      const nx = (gx + 0.5) / GRID_X - 0.5;
      const ny = (gy + 0.5) / GRID_Y - 0.5;
      const centerPrior = 1 - 0.6 * (nx * nx + ny * ny);
      const value =
        (0.65 * (surpriseMax > 0 ? surprise[cell]! / surpriseMax : 0) +
          0.35 * (edgeMax > 0 ? cellEdge[cell]! / edgeMax : 0)) *
        centerPrior;
      saliency[cell] = value;
      rowSum += value;
      integral[(gy + 1) * stride + gx + 1] = integral[gy * stride + gx + 1]! + rowSum;
      total += value;
      const weight = value * value;
      focusX += (gx + 0.5) * weight;
      focusY += (gy + 0.5) * weight;
      focusWeight += weight;
    }
  }
  const focus: [number, number] =
    focusWeight > 0
      ? [round(focusX / focusWeight / GRID_X), round(focusY / focusWeight / GRID_Y)]
      : [0.5, 0.5];
  const aspect = w / h;
  const crop21 = bestWindow(integral, total, aspect, 2);
  const crop11 = bestWindow(integral, total, aspect, 1);

  // flags
  const lumaUnit = meanY / 255;
  const flags: FrameFlag[] = [];
  if (lumaUnit < 0.07 && p98 < 46) flags.push("black");
  else if (lumaUnit > 0.93 && p02 > 210) flags.push("white");
  else if ((p98 - p02 < 70 && sharpness < 40) || (stdY < 14 && sharpness < 60)) {
    flags.push("transition");
  }
  if (text >= 0.5) flags.push("text");
  if (text >= 0.5 && (dark > 0.5 || context.nearEnd)) flags.push("credits");

  // composite score: contrast, dynamics, detail, colour, readable exposure, composition
  const contrastScore = clamp01(stdY / 70);
  const rangeScore = clamp01((p98 - p02) / 200);
  const sharpScore = clamp01(Math.log10(1 + sharpness) / 2.7);
  const satScore = clamp01(saturation / 0.6);
  const colorScore = clamp01(colorfulness / 80);
  const lumaScore = 1 - clamp01(Math.abs(lumaUnit - 0.42) / 0.42);
  const windowGain = crop21.held / Math.max(0.05, crop21.w * crop21.h);
  const compositionScore = clamp01((windowGain - 1) / 1.2);
  let score =
    0.22 * contrastScore +
    0.16 * rangeScore +
    0.2 * sharpScore +
    0.16 * satScore +
    0.08 * colorScore +
    0.08 * lumaScore +
    0.1 * compositionScore;
  if (flags.includes("black") || flags.includes("white") || flags.includes("transition")) {
    score *= 0.05;
  }
  if (flags.includes("text")) score *= 0.4;
  if (flags.includes("credits")) score *= 0.5;

  return {
    luma: round(lumaUnit),
    contrast: round(stdY / 255),
    range: round((p98 - p02) / 255),
    sharpness: round(sharpness, 1),
    saturation: round(saturation),
    colorfulness: round(colorfulness, 1),
    hue: chromatic ? hueBin * 10 + 5 : -1,
    dominant,
    hueShares: Array.from({ length: 12 }, (_, sector) =>
      round((hueWeight[sector * 3]! + hueWeight[sector * 3 + 1]! + hueWeight[sector * 3 + 2]!) / n),
    ),
    text: round(text),
    dark: round(dark),
    flags,
    focus,
    crop21,
    crop11,
    score: round(score),
  };
}

export interface DecodedFrame extends RawFrame {
  sourceWidth: number;
  sourceHeight: number;
}

/** `Bun.Image#rgba()` (raw pixels), which the bundled type definitions do not declare yet. */
interface WithRgba {
  rgba(): Promise<{ width: number; height: number; data: Uint8Array }>;
}

/** Decodes encoded image bytes to an analysis-sized RGBA copy through `Bun.Image`. */
export async function decodeFrame(
  bytes: Uint8Array,
  width: number = ANALYSIS_WIDTH,
): Promise<DecodedFrame> {
  const image = new Bun.Image(bytes);
  const meta = await image.metadata();
  const height = Math.max(1, Math.round((width * meta.height) / meta.width));
  const resized = image.resize(width, height);
  if (typeof (resized as any).rgba === "function") {
    const out = await (resized as unknown as WithRgba).rgba();
    return {
      width: out.width,
      height: out.height,
      data: out.data,
      sourceWidth: meta.width,
      sourceHeight: meta.height,
    };
  }
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(bytes, { failOn: "none", limitInputPixels: false })
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    sourceWidth: meta.width,
    sourceHeight: meta.height,
  };
}

/** Decodes and qualifies encoded image bytes. */
export async function analyzeBytes(
  bytes: Uint8Array,
  context?: AnalysisContext,
): Promise<FrameAnalysis & { sourceWidth: number; sourceHeight: number }> {
  const frame = await decodeFrame(bytes);
  return {
    ...analyzePixels(frame, context),
    sourceWidth: frame.sourceWidth,
    sourceHeight: frame.sourceHeight,
  };
}
