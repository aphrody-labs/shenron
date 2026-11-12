// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encoderPng, decoderPng } from "../../../plugin/skills/toriyama-svg/scripts/png";
import { run, sha256, validateManifest } from "./index";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "shenron-scene-assets-"));
  roots.push(root);
  const pixels = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
  ]);
  const bytes = encoderPng({ largeur: 2, hauteur: 2, pixels });
  await Bun.write(join(root, "source.png"), bytes);
  const manifest = {
    schema: "shenron-wiki-scene-assets/v1",
    sources: [
      {
        id: "source",
        path: "source.png",
        sha256: sha256(bytes),
        width: 2,
        height: 2,
        provenance: {
          kind: "authored-decoration",
          referenceUrl: "https://google.com/source",
          note: "Pixel fixture for coordinate validation only; no playback qualification.",
        },
      },
    ],
    crops: [
      {
        id: "right",
        sourceId: "source",
        rect: { left: 1, top: 0, width: 1, height: 2 },
        usage: ["sprite"],
      },
    ],
    sheets: [{ id: "atlas", items: ["right"], columns: 1, padding: 2 }],
  };
  const path = join(root, "manifest.json");
  const save = () => Bun.write(path, JSON.stringify(manifest));
  await save();
  return { root, path, out: join(root, "out"), manifest, save };
}
test("native crop coordinates, transparent Pixi atlas, deterministic reuse and check", async () => {
  const f = await setup();
  const first = await run(f.path, f.out);
  expect(first.status).toBe("written");
  const crop = decoderPng(await Bun.file(join(f.out, "right.png")).bytes());
  expect([...crop.pixels]).toEqual([0, 255, 0, 255, 255, 255, 255, 255]);
  const atlas = await Bun.file(join(f.out, "atlas.json")).json();
  expect(atlas.frames.right).toEqual({
    frame: { x: 2, y: 2, w: 1, h: 2 },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: 1, h: 2 },
    sourceSize: { w: 1, h: 2 },
  });
  expect(atlas.meta).toEqual({
    image: "atlas.png",
    format: "RGBA8888",
    size: { w: 5, h: 6 },
    scale: "1",
  });
  const sheet = decoderPng(await Bun.file(join(f.out, "atlas.png")).bytes());
  expect(Array.from(sheet.pixels.slice(0, 4))).toEqual([0, 0, 0, 0]);
  expect(Array.from(sheet.pixels.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4))).toEqual([
    0, 255, 0, 255,
  ]);
  expect((await run(f.path, f.out)).status).toBe("reused");
  const checked = await run(f.path, f.out, true);
  expect(checked.status).toBe("checked");
  expect(checked.receiptSha256).toBe(first.receiptSha256);
  await Bun.write(join(f.out, "right.png"), "corrupt");
  await expect(run(f.path, f.out, true)).rejects.toThrow("SHA mismatch");
  expect((await run(f.path, f.out)).receiptSha256).toBe(first.receiptSha256);
});
test("bad source SHA and out-of-bounds recipes fail before output creation", async () => {
  const f = await setup();
  f.manifest.sources[0]!.sha256 = "0".repeat(64);
  await f.save();
  await expect(run(f.path, f.out)).rejects.toThrow("Source SHA mismatch");
  expect(await Bun.file(join(f.out, "receipt.json")).exists()).toBe(false);
  f.manifest.crops[0]!.rect.width = 2;
  expect(() => validateManifest(f.manifest)).toThrow("Crop outside source");
});
test("aggregate output budget rejects memory-heavy atlases before native decoding", async () => {
  const f = await setup();
  f.manifest.sources[0]!.width = 4000;
  f.manifest.sources[0]!.height = 4000;
  f.manifest.crops[0]!.rect = { left: 0, top: 0, width: 4000, height: 4000 };
  f.manifest.sheets[0]!.padding = 0;
  f.manifest.sheets.push({ id: "second", items: ["right"], columns: 1, padding: 0 });
  expect(() => validateManifest(f.manifest)).toThrow("Prepared output aggregate pixel limit");
});
test("pending recipe resumes interrupted first export, refusing foreign files and locks", async () => {
  const f = await setup();
  await mkdir(f.out);
  const pending = {
    schema: "shenron-wiki-scene-pending/v1",
    manifestSha256: sha256(await Bun.file(f.path).bytes()),
    runtime: { version: Bun.version, revision: Bun.revision },
    expected: ["right.png", "atlas.png", "atlas.json"],
  };
  await Bun.write(join(f.out, ".pending.json"), JSON.stringify(pending, null, 2) + "\n");
  await Bun.write(join(f.out, "right.png"), "interrupted");
  expect((await run(f.path, f.out)).status).toBe("written");
  expect(await Bun.file(join(f.out, ".pending.json")).exists()).toBe(false);
  await Bun.write(join(f.out, "foreign.txt"), "preserve");
  await expect(run(f.path, f.out)).rejects.toThrow("Foreign file");
  expect(await Bun.file(join(f.out, "foreign.txt")).text()).toBe("preserve");
  await rm(join(f.out, "foreign.txt"));
  await Bun.write(join(f.out, ".export.lock"), "another process");
  await expect(run(f.path, f.out)).rejects.toThrow("locked");
  await expect(run(f.path, f.out, true)).rejects.toThrow("locked");
});
test("mismatched pending recipe and unknown schema never overwrite existing outputs", async () => {
  const f = await setup();
  await mkdir(f.out);
  await Bun.write(join(f.out, ".pending.json"), "{}");
  await expect(run(f.path, f.out)).rejects.toThrow("Pending identity differs");
  expect(await Bun.file(join(f.out, ".pending.json")).text()).toBe("{}");
  expect(() => validateManifest({ ...f.manifest, schema: "unknown" })).toThrow(
    "Invalid manifest schema",
  );
  f.manifest.sheets[0]!.id = "receipt";
  expect(() => validateManifest(f.manifest)).toThrow("Reserved sheet id");
});
