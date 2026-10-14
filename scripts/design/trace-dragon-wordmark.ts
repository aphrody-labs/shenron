import { resolve } from "node:path";

type Point = readonly [number, number];
type Outline = { fill: "yellow" | "red"; d: string; points: number; error: number };

function distance(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(point[0] - start[0] - projection * dx, point[1] - start[1] - projection * dy);
}

function simplify(points: Point[], epsilon: number): Point[] {
  let maximum = 0;
  let pivot = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const error = distance(points[index]!, points[0]!, points.at(-1)!);
    if (error > maximum) {
      maximum = error;
      pivot = index;
    }
  }
  if (maximum <= epsilon) return [points[0]!, points.at(-1)!];
  return [
    ...simplify(points.slice(0, pivot + 1), epsilon).slice(0, -1),
    ...simplify(points.slice(pivot), epsilon),
  ];
}

/** Quadratic joins remove binary stair steps while preserving long angular corners. */
function smoothPath(input: Point[]): string {
  const points = input.slice(0, -1);
  const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const pair = (point: Point) => point.map((value) => Number(value.toFixed(2))).join(" ");
  let d = `M${pair(midpoint(points.at(-1)!, points[0]!))}`;
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    // The maximum displacement of a quadratic from its two linear legs is
    // half the control-point distance to their joining chord.
    const preserveCorner =
      distance(current, midpoint(previous, current), midpoint(current, next)) > 0.85;
    d += preserveCorner
      ? `L${pair(current)}L${pair(midpoint(current, next))}`
      : `Q${pair(current)} ${pair(midpoint(current, next))}`;
  }
  return `${d}Z`;
}

function boundary(mask: Uint8Array, width: number, height: number): Point[][] {
  const edges = new Map<string, Point[]>();
  const add = (a: Point, b: Point) => {
    const key = a.join(",");
    const outgoing = edges.get(key) ?? [];
    outgoing.push(b);
    edges.set(key, outgoing);
  };
  const occupied = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (occupied(x, y)) {
        if (!occupied(x, y - 1)) add([x, y], [x + 1, y]);
        if (!occupied(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
        if (!occupied(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
        if (!occupied(x - 1, y)) add([x, y + 1], [x, y]);
      }
  const loops: Point[][] = [];
  while (edges.size) {
    const first = edges.keys().next().value!;
    let current = first;
    const points: Point[] = [first.split(",").map(Number) as unknown as Point];
    do {
      const outgoing = edges.get(current)!;
      const next = outgoing.pop()!;
      if (!outgoing.length) edges.delete(current);
      current = next.join(",");
      points.push(next);
    } while (current !== first && edges.has(current));
    if (points.length > 30) loops.push(points);
  }
  return loops;
}

async function main() {
  const input = Bun.argv[2];
  if (!input) throw new Error("Usage: trace-dragon-wordmark.ts reference.webp [--write]");
  const reference = Bun.file(resolve(input));
  if (!(await reference.exists()) || reference.size > 8_000_000)
    throw new Error("Invalid bounded reference");
  const image = new Bun.Image(resolve(input), { maxPixels: 1_000_000 }) as Bun.Image & {
    rgba?: () => Promise<{ width: number; height: number; channels: number; data: Uint8Array }>;
  };
  if (typeof image.rgba !== "function") throw new Error("Qualified native Bun.Image.rgba required");
  const source = await image.rgba();
  if (
    source.width !== 1233 ||
    source.height !== 563 ||
    source.channels !== 4 ||
    source.data.length !== source.width * source.height * 4
  )
    throw new Error("Official HD reference dimensions or RGBA frame invalid");
  const pixels = new Uint8Array(source.data);
  const width = source.width;
  const height = source.height;
  const outlines: Outline[] = [];
  const gradients: Record<string, { y: number; color: string }[]> = {};
  for (const fill of ["yellow", "red"] as const) {
    const mask = new Uint8Array(width * height);
    for (let y = 100; y < 382; y++)
      for (let x = 35; x < 920; x++) {
        const offset = (y * width + x) * 4;
        const [r, g, b, a] = pixels.subarray(offset, offset + 4);
        const sphere = ((x - 479) / 70) ** 2 + ((y - 289) / 70) ** 2 < 1.05;
        const matches =
          fill === "yellow"
            ? x < 627 && !sphere && r! > 130 && g! > 110 && b! < 90
            : x >= 625 && r! > 80 && g! < 70 && b! < 90 && r! > g! * 2;
        if (a! > 200 && matches) mask[y * width + x] = 1;
      }
    const loops = boundary(mask, width, height);
    for (const points of loops) {
      const simplified = simplify(points, 0.65);
      const error = Math.max(
        ...points.map((point) =>
          Math.min(
            ...simplified.slice(1).map((end, index) => distance(point, simplified[index]!, end)),
          ),
        ),
      );
      const d = smoothPath(simplified);
      outlines.push({ fill, d, points: simplified.length, error });
    }
    gradients[fill] = [125, 205, 270, 320, 360]
      .map((y) => {
        const channels: number[][] = [[], [], []];
        for (let x = 35; x < 920; x++)
          if (mask[y * width + x])
            for (let channel = 0; channel < 3; channel++)
              channels[channel]!.push(pixels[(y * width + x) * 4 + channel]!);
        const rgb = channels.map(
          (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0,
        );
        return { y, color: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}` };
      })
      .filter(({ color }) => color !== "#000000");
  }
  const report = {
    sha256: new Bun.CryptoHasher("sha256").update(await reference.arrayBuffer()).digest("hex"),
    width,
    height,
    thresholdError: "binary pixel boundary, antialias excluded",
    epsilon: 0.65,
    quadraticJoinDisplacementBound: 0.425,
    outlines,
    gradients,
  };
  await Bun.write(
    "var/reports/dragon-ball-design-20261014/hd-outlines.json",
    JSON.stringify(report, null, 2),
  );
  if (Bun.argv.includes("--write")) {
    const file = Bun.file("packages/ui/src/toriyama-svg/wordmark.ts");
    const current = await file.text();
    const block = `export const WORDMARK_LETTERS = ${JSON.stringify(
      outlines.map(({ fill, d }, index) => ({ name: `${fill}-${index}`, fill, d })),
      null,
      2,
    )} as const;\n\nexport const WORDMARK_GRADIENTS = ${JSON.stringify(gradients, null, 2)} as const;\n\n`;
    await Bun.write(
      file,
      current.slice(0, current.indexOf("export const WORDMARK_LETTERS")) +
        block +
        current.slice(current.indexOf("/** Original France")),
    );
  }
  console.log(
    JSON.stringify({
      width,
      height,
      sha256: report.sha256,
      loops: outlines.length,
      points: outlines.reduce((sum, outline) => sum + outline.points, 0),
      maxError: Math.max(...outlines.map((outline) => outline.error)),
      gradients,
    }),
  );
}

await main();
