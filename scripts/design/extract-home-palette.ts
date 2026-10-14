// SPDX-License-Identifier: Apache-2.0
/** Bounded pixel modes from the official key visual, with readable M3 tones. */
export function mix(hex: string, target: string, amount: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(hex.slice(offset, offset + 2), 16) * (1 - amount) +
            parseInt(target.slice(offset, offset + 2), 16) * amount,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export const REGIONS = {
  kamehameha: [0.45, 0.5, 0.72, 0.68],
  sun: [0.45, 0.23, 0.7, 0.36],
  freezer: [0.52, 0.13, 0.76, 0.29],
  space: [0.05, 0.55, 0.4, 0.95],
  goku: [0.7, 0.42, 0.99, 0.8],
} as const;
export type Seeds = Record<
  keyof typeof REGIONS,
  { hex: string; pixels: number; matchedPixels: number; region: readonly number[] }
>;
export function themeRoles(seeds: Seeds, dark: boolean) {
  const space = seeds.space.hex,
    cyan = seeds.kamehameha.hex,
    blue = seeds.goku.hex,
    orange = seeds.sun.hex,
    gold = seeds.freezer.hex;
  const ink = dark ? mix(cyan, "#ffffff", 0.92) : mix(space, "#000000", 0.25);
  const background = dark ? mix(space, "#000000", 0.3) : mix(cyan, "#ffffff", 0.94);
  const tone = (amount: number) => (dark ? mix(space, blue, amount) : mix(blue, "#ffffff", amount));
  return {
    background,
    surface: background,
    "on-background": ink,
    "on-surface": ink,
    "surface-container-low": tone(dark ? 0.035 : 0.98),
    "surface-container": tone(dark ? 0.075 : 0.86),
    "surface-container-high": tone(dark ? 0.12 : 0.77),
    "surface-container-highest": tone(dark ? 0.18 : 0.68),
    "on-surface-variant": dark ? mix(cyan, "#ffffff", 0.45) : mix(space, "#000000", 0.08),
    outline: dark ? mix(blue, "#ffffff", 0.47) : mix(blue, "#000000", 0.48),
    "outline-variant": dark ? mix(blue, "#ffffff", 0.32) : mix(blue, "#000000", 0.36),
    primary: dark ? orange : mix(blue, "#000000", 0.52),
    "on-primary": dark ? inkDark(space) : "#ffffff",
    "primary-container": dark ? mix(orange, "#000000", 0.72) : mix(orange, "#ffffff", 0.77),
    "on-primary-container": dark ? mix(orange, "#ffffff", 0.8) : ink,
    secondary: dark ? mix(blue, "#ffffff", 0.45) : mix(blue, "#000000", 0.55),
    "on-secondary": dark ? inkDark(space) : "#ffffff",
    "secondary-container": tone(dark ? 0.22 : 0.68),
    "on-secondary-container": ink,
    tertiary: dark ? gold : mix(gold, "#000000", 0.68),
    "on-tertiary": dark ? inkDark(space) : "#ffffff",
    "tertiary-container": dark ? mix(gold, "#000000", 0.72) : mix(gold, "#ffffff", 0.76),
    "on-tertiary-container": dark ? mix(gold, "#ffffff", 0.8) : ink,
    "inverse-surface": dark ? mix(cyan, "#ffffff", 0.94) : inkDark(space),
    "inverse-on-surface": dark ? inkDark(space) : "#ffffff",
    "inverse-primary": dark ? mix(blue, "#000000", 0.55) : orange,
    scrim: inkDark(space),
  };
}
function inkDark(space: string) {
  return mix(space, "#000000", 0.7);
}
export async function extractHomePalette(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size > 16_000_000)
    throw new Error("Invalid bounded key visual");
  const image = new Bun.Image(path, { maxPixels: 16_000_000 }) as Bun.Image & {
    rgba?: () => Promise<{ width: number; height: number; channels: number; data: Uint8Array }>;
  };
  if (typeof image.rgba !== "function") throw new Error("Qualified native Bun.Image.rgba required");
  const p = await image.rgba();
  if (
    p.channels !== 4 ||
    p.width * p.height > 16_000_000 ||
    p.data.length !== p.width * p.height * 4
  )
    throw new Error("Invalid bounded RGBA image");
  const seeds = Object.fromEntries(
    Object.entries(REGIONS).map(([name, region]) => {
      const histogram = new Map<string, number>();
      let matchedPixels = 0;
      for (let y = Math.floor(p.height * region[1]); y < Math.floor(p.height * region[3]); y++) {
        for (let x = Math.floor(p.width * region[0]); x < Math.floor(p.width * region[2]); x++) {
          const n = (y * p.width + x) * 4;
          const r = p.data[n]!,
            g = p.data[n + 1]!,
            b = p.data[n + 2]!;
          const match =
            name === "kamehameha"
              ? r > 150 && g > 220 && b > 230 && b > r + 8
              : name === "sun"
                ? r > 210 && g > 85 && g < 195 && b < 110
                : name === "freezer"
                  ? r > 155 && g > 120 && g < r && b < g * 0.72
                  : name === "space"
                    ? b > r + 3 && b > g + 3 && b < 45 && r < 30 && g < 30
                    : b > 180 && g > 85 && g < 185 && r < 80;
          if (p.data[n + 3]! < 200 || !match) continue;
          const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
          histogram.set(hex, (histogram.get(hex) ?? 0) + 1);
          matchedPixels++;
        }
      }
      const mode = [...histogram].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      if (!mode || matchedPixels < 100) throw new Error(`Missing measured ${name} pixels`);
      return [name, { hex: mode[0], pixels: mode[1], matchedPixels, region }];
    }),
  ) as unknown as Seeds;
  return {
    schema: "shenron-home-palette/v2",
    source: {
      url: "https://dragonball-super.com/img/kv-2.webp",
      width: p.width,
      height: p.height,
      sha256: new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex"),
    },
    seeds,
    media: {
      surface: inkDark(seeds.space.hex),
      "on-surface": mix(seeds.kamehameha.hex, "#ffffff", 0.85),
    },
    brand: {
      yellow: "#fef102",
      red: "#e50113",
      blue: seeds.goku.hex,
      orange: seeds.sun.hex,
      gold: seeds.freezer.hex,
      ink: inkDark(seeds.space.hex),
      "media-ink": "#ffffff",
      "media-muted": mix(seeds.kamehameha.hex, "#ffffff", 0.85),
    },
    themes: { beerus: themeRoles(seeds, true), goku: themeRoles(seeds, false) },
  };
}
if (import.meta.main) {
  const path = Bun.argv[2];
  if (!path) throw new Error("Usage: bun extract-home-palette.ts <key-visual> [--write]");
  const palette = await extractHomePalette(path);
  if (Bun.argv.includes("--write"))
    await Bun.write(
      `${import.meta.dir}/../../packages/ui/assets/brand/home-palette.json`,
      JSON.stringify(palette, null, 2) + "\n",
    );
  else console.log(JSON.stringify(palette, null, 2));
}
