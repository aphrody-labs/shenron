// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createShenronSvg } from "./shenron";

test("Shenron source regenerates passive full-body vector geometry byte exactly", async () => {
  const svg = createShenronSvg();
  expect(svg).toBe(
    await Bun.file(
      new URL("../../../packages/ui/assets/wiki-mascots/shenron-full.svg", import.meta.url),
    ).text(),
  );
  expect(svg).not.toMatch(
    /<(?:image|script|foreignObject)\b|(?:href|src)\s*=|data:|url\(|on[a-z]+\s*=/i,
  );
  expect(svg.match(/<path\b/g)!.length).toBeGreaterThan(300);
  expect(svg).toContain('viewBox="0 0 800 560"');
  for (const id of ["hind-leg-right", "hind-leg-left", "foreleg-right", "foreleg-left"])
    expect(svg).toContain(`id="${id}"`);
  expect(svg.match(/id="coil-\d+"/g)!.length).toBe(9);
  expect(svg).toContain("Création originale");
  expect(svg).toContain("distincte d’une image officielle");
  const provenance = await Bun.file(new URL("./shenron.md", import.meta.url)).text();
  expect(provenance).toContain("8af30dcc9884191b7ce51d28ca3cea9741f29472bfba50ed86ffe89dce56861b");
  expect(provenance).toContain("https://www.xenofrance.fr/shenron");
  expect(provenance).toContain("Le PNG du portail reste actif");
});
