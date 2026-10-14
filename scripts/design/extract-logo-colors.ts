// SPDX-License-Identifier: Apache-2.0
/** Inspect a bounded local brand reference without publishing its pixels. */
export async function extractLogoColors(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size > 8_000_000) throw new Error("Invalid bounded reference");
  const image = new Bun.Image(path, { maxPixels: 1_000_000 }) as Bun.Image & {
    rgba?: () => Promise<{ width: number; height: number; channels: number; data: Uint8Array }>;
  };
  if (typeof image.rgba !== "function") throw new Error("Qualified native Bun.Image.rgba required");
  const pixels = await image.rgba();
  if (
    pixels.channels !== 4 ||
    pixels.width * pixels.height > 1_000_000 ||
    pixels.data.length !== pixels.width * pixels.height * 4
  )
    throw new Error("Invalid bounded native RGBA frame");
  const families = {
    yellow: (r: number, g: number, b: number) => r > 220 && g > 200 && b < 60,
    red: (r: number, g: number, b: number) => r > 140 && g < 45 && b < 65,
  };
  const colors = Object.fromEntries(
    Object.entries(families).map(([name, matches]) => {
      const histogram = new Map<string, number>();
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        const r = pixels.data[offset]!,
          g = pixels.data[offset + 1]!,
          b = pixels.data[offset + 2]!;
        if (pixels.data[offset + 3]! < 200 || !matches(r, g, b)) continue;
        const hex = "#" + [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("");
        histogram.set(hex, (histogram.get(hex) ?? 0) + 1);
      }
      const mode = [...histogram].toSorted((a, b) => b[1] - a[1])[0];
      if (!mode) throw new Error(`No measured ${name} pixels`);
      return [name, { hex: mode[0], pixels: mode[1] }];
    }),
  );
  return {
    width: pixels.width,
    height: pixels.height,
    sha256: new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex"),
    colors,
  };
}
if (import.meta.main) {
  const path = Bun.argv[2];
  if (!path) throw new Error("Usage: bun extract-logo-colors.ts <local-reference>");
  console.log(JSON.stringify(await extractLogoColors(path), null, 2));
}
