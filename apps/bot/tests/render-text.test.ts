import "./setup"; // must be first
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, test } from "bun:test";
import { encodePngRgba } from "~/render/png";
import {
  ellipsize,
  formatCompact,
  formatInt,
  graphemes,
  initialOf,
  titleStack,
  ui,
  wrapLines,
} from "~/render/text";
import { canvasNativeOk, decode } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

d("text helpers", () => {
  const ctx = createCanvas(10, 10).getContext("2d");
  ctx.font = ui(500, 16);

  test("wrapLines breaks between words, never inside one", () => {
    const text = "Colore ton pseudo et ta barre d’expérience";
    const lines = wrapLines(ctx, text, 150, 4);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(text);
    for (const line of lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(151);
  });

  test("wrapLines ends the last line with an ellipsis when the text does not fit", () => {
    const lines = wrapLines(ctx, "one two three four five six seven eight nine ten", 90, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });

  test("wrapLines wraps scripts without spaces between characters", () => {
    const lines = wrapLines(ctx, "超サイヤ人".repeat(8), 100, 3);
    expect(lines.length).toBeGreaterThan(1);
  });

  test("ellipsize keeps emoji sequences whole and fits the width", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    expect(graphemes(`${family}${family}`)).toHaveLength(2);
    const short = ellipsize(ctx, "W".repeat(60), 80);
    expect(ctx.measureText(short).width).toBeLessThanOrEqual(81);
    expect(short.endsWith("…")).toBe(true);
    expect(ellipsize(ctx, "ok", 80)).toBe("ok");
  });

  test("initialOf takes the first grapheme", () => {
    expect(initialOf("  goku")).toBe("G");
    expect(initialOf("孫悟空")).toBe("孫");
    expect(initialOf("")).toBe("");
  });

  test("titles use Saiyan Sans for plain Latin only", () => {
    expect(titleStack("Super Saiyan")).toContain("Saiyan Sans");
    expect(titleStack("Niveau 12")).not.toContain("Saiyan Sans");
    expect(titleStack("レベル")).not.toContain("Saiyan Sans");
  });

  test("numbers follow the locale", () => {
    expect(formatInt(1234567, "en")).toBe("1,234,567");
    expect(formatInt(Number.NaN)).toBe("0");
    expect(formatCompact(1500, "en")).toBe("1.5K");
    expect(formatCompact(54_321, "ja")).toContain("万");
    expect(formatInt(12, "not-a-locale")).toBe("12");
  });
});

d("PNG encoder", () => {
  test("decodes to identical pixels, with alpha", async () => {
    const canvas = createCanvas(64, 40);
    const c = canvas.getContext("2d");
    c.fillStyle = "#e78220";
    c.fillRect(0, 0, 40, 40);
    c.fillStyle = "rgba(0, 229, 255, 0.5)";
    c.fillRect(20, 10, 40, 20);
    const raw = c.getImageData(0, 0, 64, 40).data;
    const png = encodePngRgba(raw, 64, 40);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const back = await decode(png);
    expect([back.width, back.height]).toEqual([64, 40]);
    expect(Array.from(back.data)).toEqual(Array.from(raw));
  });

  test("a buffer smaller than the image is refused", () => {
    expect(() => encodePngRgba(new Uint8ClampedArray(10), 64, 40)).toThrow();
  });

  test("the zlib level trades size for time", () => {
    const raw = new Uint8ClampedArray(256 * 256 * 4).map((_, i) => (i * 7) % 251);
    const fast = encodePngRgba(raw, 256, 256, { level: 1 });
    const small = encodePngRgba(raw, 256, 256, { level: 9 });
    expect(small.length).toBeLessThanOrEqual(fast.length);
  });
});
