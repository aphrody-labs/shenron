// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { DragonPixelArena } from "../src/components/games/DragonPixelArena";
import { GamesHub } from "../src/components/games/GamesHub";
import { checkWebGpu } from "../src/lib/dragon-pixel-loader";
import { ARENA_IDS, FIGHTER_IDS, MODE_IDS } from "../src/lib/dragon-pixel-options";
import fr from "../messages/dragon-pixel-arena/fr.json";
import en from "../messages/dragon-pixel-arena/en.json";
import ja from "../messages/dragon-pixel-arena/ja.json";

const SRC = join(import.meta.dir, "..", "src");

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  expect(typeof value).toBe("object");
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      Object.entries(leaves(child, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}

test("French, English and Japanese catalogues have the same keys and no empty value", () => {
  const reference = Object.keys(leaves(fr)).toSorted();
  for (const dictionary of [fr, en, ja]) {
    const entries = leaves(dictionary);
    expect(Object.keys(entries).toSorted()).toEqual(reference);
    for (const value of Object.values(entries)) expect(value.trim().length).toBeGreaterThan(0);
  }
});

test("every fighter, arena and mode of the engine has a label in each language", () => {
  for (const dictionary of [fr, en, ja]) {
    for (const id of FIGHTER_IDS) expect(dictionary.fighters[id]).toBeTruthy();
    for (const id of ARENA_IDS) expect(dictionary.arenas[id]).toBeTruthy();
    for (const id of MODE_IDS) expect(dictionary.modes[id]).toBeTruthy();
  }
});

test("the arena renders a fixed-ratio box, a launch button and no engine before the click", () => {
  const html = renderToStaticMarkup(<DragonPixelArena />);
  expect(html).toContain("aspect-ratio:16 / 9");
  expect(html).toContain(fr.launch);
  expect(html).toContain('data-renderer="none"');
  expect(html).not.toContain("<canvas");
});

test("the WebGPU check reports a missing API and a missing adapter", async () => {
  expect(await checkWebGpu({})).toEqual({ available: false, reason: "no-api" });
  expect(await checkWebGpu({ gpu: { requestAdapter: async () => null } })).toEqual({
    available: false,
    reason: "no-adapter",
  });
  expect(await checkWebGpu({ gpu: { requestAdapter: async () => ({}) } })).toEqual({
    available: true,
  });
  expect(
    await checkWebGpu({
      gpu: {
        requestAdapter: async () => {
          throw new Error("denied");
        },
      },
    }),
  ).toEqual({ available: false, reason: "no-adapter" });
});

test("the hub links the arena and carries no claim of an engine the page does not run", () => {
  const html = renderToStaticMarkup(<GamesHub />);
  expect(html).toContain('href="/games/dragon-pixel/arena"');
  for (const claim of ["GAMESCOPE", "60 FPS", "Émulation WASM", "1080p"])
    expect(html).not.toContain(claim);
});

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(full);
    else if (/\.(?:tsx?|json)$/.test(entry.name) && !entry.name.endsWith(".generated.ts"))
      yield full;
  }
}

test("only the Dragon Pixel arena and its engine files name Bevy", () => {
  const allowed = new Set([
    "components/games/DragonPixelArena.tsx",
    "lib/dragon-pixel-loader.ts",
    "lib/dragon-pixel-options.ts",
    "lib/dragon-pixel-canvas.ts",
    "app/games/dragon-pixel/arena/page.tsx",
  ]);
  const offenders = [...sources(SRC)]
    .map((file) => relative(SRC, file).replaceAll("\\", "/"))
    .filter((rel) => /bevy/i.test(readFileSync(join(SRC, rel), "utf8")) && !allowed.has(rel));
  expect(offenders).toEqual([]);
});
