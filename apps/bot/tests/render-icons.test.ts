import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import { GEOMETRIES, type GeometrieIcone } from "@aphrody/shenron-ui/icones/geometries";
import {
  ICON_PARTS,
  ICON_SOURCES,
  isUpToDate,
  projectIcons,
  renderIconsModule,
} from "~/render/generate-icons";
import { ICONS, ICON_BOX, drawIcon, iconSizeForRadius, type IconName } from "~/render/icons";
import { drawBall, drawCoin, drawSparkle } from "~/render/draw";
import { resolvePalette } from "~/render/theme";
import { canvasNativeOk } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

describe("icons generated from packages/ui", () => {
  test("icons.generated.ts is the projection of the site geometries", async () => {
    expect(await isUpToDate()).toBe(true);
  });

  test("every pictogram maps to a geometry that still exists, with its measured paths", () => {
    for (const [name, source] of Object.entries(ICON_SOURCES)) {
      const geometry: GeometrieIcone = GEOMETRIES[source];
      expect(geometry, `${name} -> ${source}`).toBeDefined();
      const icon = ICONS[name as IconName];
      expect(icon.source).toBe(source);
      const strokes: readonly string[] = geometry.traits ?? [];
      const fills: readonly string[] = geometry.aplats ?? [];
      expect([...icon.strokes] as string[]).toEqual([...strokes]);
      expect([...icon.fills] as string[]).toEqual([...fills]);
    }
  });

  test("a derived part is a subset of the paths of its geometry, nothing invented", () => {
    for (const [name, part] of Object.entries(ICON_PARTS)) {
      const geometry: GeometrieIcone = GEOMETRIES[part.source];
      const icon = ICONS[name as IconName];
      const strokes: string[] = [...(geometry.traits ?? [])];
      const fills: string[] = [...(geometry.aplats ?? [])];
      for (const path of icon.strokes) expect(strokes).toContain(path);
      for (const path of icon.fills) expect(fills).toContain(path);
      expect(icon.strokes.length + icon.fills.length).toBeGreaterThan(0);
    }
  });

  test("a changed geometry is detected as drift", () => {
    const icons = projectIcons();
    const mutated = {
      ...icons,
      crown: { ...icons.crown!, fills: ["M 0 0 L 24 0 L 24 24 Z"] },
    };
    expect(renderIconsModule(mutated)).not.toBe(renderIconsModule());
    expect(renderIconsModule(mutated)).toContain("M 0 0 L 24 0 L 24 24 Z");
  });
});

/** Opaque bounding box of what a function draws on a transparent canvas. */
function boundsOf(
  size: number,
  draw: (ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>) => void,
): { x0: number; y0: number; x1: number; y1: number; pixels: number } {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  draw(ctx);
  const data = ctx.getImageData(0, 0, size, size).data;
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  let pixels = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3]! > 24) {
        pixels++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, pixels };
}

d("drawIcon", () => {
  test("a pictogram stays inside its drawing box and is centred on the point", () => {
    for (const name of ["crown", "coin", "star", "trophy", "dragonBall", "kame"] as const) {
      const box = boundsOf(240, (ctx) => drawIcon(ctx, name, 120, 120, 120, "#ffffff"));
      expect(box.pixels, name).toBeGreaterThan(200);
      // 120 px box centred on (120, 120): nothing outside [60, 180]
      expect(box.x0, name).toBeGreaterThanOrEqual(58);
      expect(box.y0, name).toBeGreaterThanOrEqual(58);
      expect(box.x1, name).toBeLessThanOrEqual(182);
      expect(box.y1, name).toBeLessThanOrEqual(182);
      // roughly centred on the box
      expect(Math.abs((box.x0 + box.x1) / 2 - 120), name).toBeLessThan(14);
    }
  });

  test("a derived part is centred on its anchor with the half extent it declares", () => {
    for (const name of ["sparkle", "ball"] as const) {
      const radius = 40;
      const box = boundsOf(240, (ctx) =>
        drawIcon(ctx, name, 120, 120, iconSizeForRadius(name, radius), "#ffffff", {
          backing: "#ffffff",
        }),
      );
      expect((box.x1 - box.x0) / 2, name).toBeGreaterThan(radius * 0.9);
      expect((box.x1 - box.x0) / 2, name).toBeLessThan(radius * 1.2);
      expect(Math.abs((box.x0 + box.x1) / 2 - 120), name).toBeLessThan(4);
      expect(Math.abs((box.y0 + box.y1) / 2 - 120), name).toBeLessThan(4);
    }
    const star = boundsOf(240, (ctx) =>
      drawIcon(ctx, "ballStar", 120, 120, iconSizeForRadius("ballStar", 20), "#ffffff"),
    );
    expect(Math.abs((star.x0 + star.x1) / 2 - 120)).toBeLessThan(3);
    expect(Math.abs((star.y0 + star.y1) / 2 - 120)).toBeLessThan(4);
  });

  test("the colour, the outline and the backing are applied", () => {
    const canvas = createCanvas(120, 120);
    const ctx = canvas.getContext("2d");
    drawIcon(ctx, "ball", 60, 60, iconSizeForRadius("ball", 40), "#112233", {
      backing: "#ff8800",
      outline: { color: "#00ff00", width: 1 },
    });
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
    expect(at(60, 60)).toEqual([255, 136, 0, 255]); // backing inside the closed outline
    // the ring is ink-coloured, its halo outside is the outline colour
    const ring = at(60, 60 - 40);
    expect(ring.slice(0, 3)).toEqual([0x11, 0x22, 0x33]);
    const halo = at(60, 60 - 40 - 6);
    expect(halo[1]).toBeGreaterThan(200);
    expect(at(2, 2)[3]).toBe(0);
  });

  test("the line is the measured 2 units, constant whatever the size", () => {
    // a vertical stroke of the `plus` glyph: its width scales with the box, 2/24 of it
    for (const size of [48, 96, 192]) {
      const canvas = createCanvas(size + 8, size + 8);
      const ctx = canvas.getContext("2d");
      drawIcon(ctx, "plus", (size + 8) / 2, (size + 8) / 2, size, "#ffffff");
      const y = 4 + Math.round((size * 8) / ICON_BOX); // 8 units down: only the vertical bar
      const row = ctx.getImageData(0, y, size + 8, 1).data;
      let width = 0;
      for (let x = 0; x < size + 8; x++) if (row[x * 4 + 3]! > 128) width++;
      const expected = (2 / ICON_BOX) * size;
      expect(Math.abs(width - expected), `size ${size}`).toBeLessThanOrEqual(2);
    }
  });

  test("the card primitives draw the measured glyphs (ball, coin, sparkle)", () => {
    const palette = resolvePalette();
    const canvas = createCanvas(300, 120);
    const ctx = canvas.getContext("2d");
    drawBall(ctx, palette, 50, 60, 30, 3);
    drawCoin(ctx, palette, 150, 60, 24);
    drawSparkle(ctx, 250, 60, 26, "#ffffff");
    const data = ctx.getImageData(0, 0, 300, 120).data;
    const opaque = (x0: number, x1: number) => {
      let n = 0;
      for (let y = 0; y < 120; y++) {
        for (let x = x0; x < x1; x++) if (data[(y * 300 + x) * 4 + 3]! > 128) n++;
      }
      return n;
    };
    expect(opaque(0, 100)).toBeGreaterThan(1500); // the ball is a filled disc
    expect(opaque(100, 200)).toBeGreaterThan(600);
    expect(opaque(200, 300)).toBeGreaterThan(200);
    // the ball is orange paper, the stars are red: three red patches in the disc
    let red = 0;
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 100; x++) {
        const i = (y * 300 + x) * 4;
        if (data[i]! > 150 && data[i + 1]! < 60 && data[i + 2]! < 80) red++;
      }
    }
    expect(red).toBeGreaterThan(20);
  });
});
