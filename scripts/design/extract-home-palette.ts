// SPDX-License-Identifier: Apache-2.0
/** Measure the owner's unchanged illustration; derive bounded, readable surface tones. */
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
export function themeRoles(seed: string, dark: boolean) {
  const tone = (amount: number) => mix(seed, dark ? "#000000" : "#ffffff", amount);
  const ink = mix(seed, dark ? "#ffffff" : "#000000", dark ? 0.9 : 0.88);
  return {
    background: tone(dark ? 0.88 : 0.94),
    surface: tone(dark ? 0.88 : 0.94),
    "on-background": ink,
    "on-surface": ink,
    "surface-container-low": tone(dark ? 0.8 : 0.98),
    "surface-container": tone(dark ? 0.74 : 0.87),
    "surface-container-high": tone(dark ? 0.68 : 0.8),
    "surface-container-highest": tone(dark ? 0.6 : 0.72),
    "on-surface-variant": mix(seed, dark ? "#ffffff" : "#000000", dark ? 0.62 : 0.65),
    outline: mix(seed, dark ? "#ffffff" : "#000000", dark ? 0.35 : 0.5),
    "outline-variant": tone(dark ? 0.48 : 0.42),
    primary: dark ? mix(seed, "#ffffff", 0.25) : mix(seed, "#000000", 0.6),
    "on-primary": dark ? "#211526" : "#ffffff",
    "primary-container": mix(seed, "#000000", dark ? 0.63 : 0),
    "on-primary-container": dark ? "#f7eafb" : "#10232e",
    secondary: dark ? "#98d3f3" : "#405a72",
    "on-secondary": dark ? "#10232e" : "#ffffff",
    "secondary-container": tone(dark ? 0.73 : 0.78),
    "on-secondary-container": ink,
    tertiary: dark ? "#ffd978" : "#6b4210",
    "on-tertiary": dark ? "#362700" : "#ffffff",
    "tertiary-container": dark ? "#49351b" : "#ffedbc",
    "on-tertiary-container": dark ? "#fff0c9" : "#362700",
  };
}
export async function extractHomePalette(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size > 8_000_000)
    throw new Error("Invalid bounded illustration");
  const image = new Bun.Image(path, { maxPixels: 2_000_000 }) as Bun.Image & {
    rgba?: () => Promise<{ width: number; height: number; channels: number; data: Uint8Array }>;
  };
  if (typeof image.rgba !== "function") throw new Error("Qualified native Bun.Image.rgba required");
  const p = await image.rgba();
  if (p.channels !== 4 || p.data.length !== p.width * p.height * 4)
    throw new Error("Invalid RGBA frame");
  const seeds = Object.fromEntries(
    [
      ["beerus", 0, 0.25, 1],
      ["goku", 0.6, 1, 0.58],
    ].map(([name, start, end, bottom]) => {
      const histogram = new Map<string, number>();
      for (let y = 0; y < p.height * Number(bottom); y++)
        for (
          let x = Math.floor(p.width * Number(start));
          x < Math.floor(p.width * Number(end));
          x++
        ) {
          const n = (y * p.width + x) * 4;
          const r = p.data[n]!,
            g = p.data[n + 1]!,
            b = p.data[n + 2]!;
          const matches =
            name === "beerus"
              ? r > 160 && b > 80 && r > b && r - b < 80 && g < r * 0.6 && b > g * 1.4
              : b > 130 && g > 80 && b - r > 60 && g - r > 35;
          if (p.data[n + 3]! < 200 || !matches) continue;
          const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
          histogram.set(hex, (histogram.get(hex) ?? 0) + 1);
        }
      const mode = [...histogram].toSorted((a, b) => b[1] - a[1])[0];
      if (!mode) throw new Error(`Missing measured ${name} pixels`);
      return [
        String(name),
        {
          hex: mode[0],
          pixels: mode[1],
          region: [Number(start), 0, Number(end), Number(bottom)],
          subject: name === "beerus" ? "bright-magenta-aura" : "blue-energy-space",
        },
      ];
    }),
  );
  return {
    schema: "shenron-home-palette/v1",
    source: {
      asset: "brand/home-beerus-goku.png",
      width: p.width,
      height: p.height,
      sha256: new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex"),
    },
    seeds,
    themes: {
      beerus: themeRoles(seeds.beerus!.hex, true),
      goku: themeRoles(seeds.goku!.hex, false),
    },
  };
}
if (import.meta.main) {
  const path = Bun.argv[2];
  if (!path) throw new Error("Usage: bun extract-home-palette.ts <illustration> [--write]");
  const palette = await extractHomePalette(path);
  if (Bun.argv.includes("--write"))
    await Bun.write(
      `${import.meta.dir}/../../packages/ui/assets/brand/home-palette.json`,
      JSON.stringify(palette, null, 2) + "\n",
    );
  else console.log(JSON.stringify(palette, null, 2));
}
