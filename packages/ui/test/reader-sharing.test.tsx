// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { CollectionReader, MangaReader as M3MangaReader } from "@aphrody/m3-reader/source";
import * as shenron from "../src/reader";
import { DatabookReader } from "../src/reader/DatabookReader";
const read = (name: string) => readFile(new URL("../src/" + name, import.meta.url), "utf8");
describe("readers: generic ones shared with M3, the databook reader owned by Shenron", () => {
  test("collection reader stays the canonical M3 implementation", () => {
    expect(shenron.CollectionReader).toBe(CollectionReader);
  });
  test("manga reader is the canonical M3 one, only wrapped for the Tauri window", async () => {
    expect(shenron.CanonicalMangaReader).toBe(M3MangaReader);
    expect(shenron.MangaReader).not.toBe(M3MangaReader);
    const source = await read("reader/MangaReader.tsx");
    expect(source).toContain('from "@aphrody/m3-reader/source"');
    expect(source).toContain("useTauriFullscreen");
    // Une enveloppe, pas une copie : aucun Swiper ni virtualiseur importé ou recopié
    // (le commentaire de tête peut nommer Swiper, il décrit le lecteur enveloppé).
    expect(source).not.toMatch(/from ["'](?:swiper|@tanstack\/react-virtual)|useVirtualizer\(/);
  });
  test("the databook reader is Shenron's own and carries its focus trap", async () => {
    expect(shenron.DatabookReader).toBe(DatabookReader);
    const source = await read("reader/DatabookReader.tsx");
    expect(source).toContain('from "./use-focus-trap"');
    expect(source).not.toMatch(/from ["']@aphrody\/m3-reader/);
  });
  test("generic reader styles come from M3, the Dragon Ball skin lives here", async () => {
    expect(await read("reader-styles.css")).toContain('@import "@aphrody/m3-reader/styles.css"');
    const skin = await read("reader-dragon-ball.css");
    expect(skin).not.toContain("@import");
    expect(skin).toContain(".m3-reader--dragon-ball");
    expect(skin).toContain("var(--dbz-orange");
  });
  test("the skin follows the Planche couleur direction: ink lines, kinto focus, no glow", async () => {
    const skin = await read("reader-dragon-ball.css");
    expect(skin).toContain("var(--dbz-kinto-lumiere, #fcf03a)");
    expect(skin).toContain("outline: 2px solid var(--reader-focus)");
    expect(skin).toMatch(/border: 1px solid var\(--reader-outline\)/);
    expect(skin).not.toMatch(/box-shadow:(?!\s*none\b)/);
    expect(skin).not.toMatch(/text-transform:\s*uppercase/);
    expect(skin).toContain("@media (pointer: coarse)");
    const databook = await read("reader/DatabookReader.tsx");
    for (const banned of ["uppercase", "tracking-", "font-mono", "shadow-[", "drop-shadow"])
      expect(databook).not.toContain(banned);
  });
});
