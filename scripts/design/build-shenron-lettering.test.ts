// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { buildLettering, LETTERING_COVERAGE, LETTERING_GLYPHS } from "./build-shenron-lettering";
import metadata from "../../apps/site/public/fonts/shenron-lettering/metadata.json";

test("lettering coverage is deliberately bounded to the real source outlines", () => {
  expect(Object.keys(LETTERING_GLYPHS).toSorted().join("")).toBe(
    [...LETTERING_COVERAGE].toSorted().join(""),
  );
  expect(metadata.coverage).toBe("ABCDEFGLNR");
  expect(metadata.coverage).not.toContain("O");
  expect(metadata.unitsPerEm).toBe(1000);
  expect(metadata.capHeight).toBe(800);
  expect(metadata.glyphs.D.contours).toBe(2);
  expect(metadata.glyphs.R.contours).toBe(2);
  expect(metadata.glyphs.A.contours).toBe(2);
  expect(metadata.glyphs.B.contours).toBe(3);
  for (const glyph of Object.values(metadata.glyphs)) {
    expect(glyph.advance).toBeGreaterThan(glyph.bounds[2]!);
    expect(glyph.bounds[0]!).toBeGreaterThanOrEqual(39);
    expect(glyph.bounds[1]!).toBeGreaterThanOrEqual(-1);
    expect(glyph.bounds[3]!).toBeLessThanOrEqual(801);
  }
});
test("Bun UV/fontTools rebuilds byte-identical bounded lettering faces", async () => {
  const directory = `${Bun.env.TEMP ?? `${import.meta.dir}/../../var/reports`}/shenron-lettering-test-${crypto.randomUUID()}`;
  try {
    const result = await buildLettering(directory);
    expect(result).toEqual(metadata);
    for (const extension of ["ttf", "woff2"]) {
      const generated = Buffer.from(
        await Bun.file(`${directory}/ShenronLettering-Bold.${extension}`).arrayBuffer(),
      );
      const committed = Buffer.from(
        await Bun.file(
          `${import.meta.dir}/../../apps/site/public/fonts/shenron-lettering/ShenronLettering-Bold.${extension}`,
        ).arrayBuffer(),
      );
      expect(generated.equals(committed)).toBe(true);
      if (extension === "woff2") {
        expect(generated.toString("ascii", 0, 4)).toBe("wOF2");
        expect(generated.readUInt32BE(8)).toBe(generated.length);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 35000);
