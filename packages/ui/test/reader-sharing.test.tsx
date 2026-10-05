// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { CollectionReader, MangaReader } from "@aphrody/m3-reader/source";
import * as shenron from "../src/reader";
import { DatabookReader } from "../src/reader/DatabookReader";
const read = (name: string) => readFile(new URL("../src/" + name, import.meta.url), "utf8");
describe("readers: generic ones shared with M3, the databook reader owned by Shenron", () => {
  test("manga and collection readers stay the canonical M3 implementation", () => {
    expect(shenron.CollectionReader).toBe(CollectionReader);
    expect(shenron.MangaReader).toBe(MangaReader);
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
});
