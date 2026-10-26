// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  findWikiImage,
  listWikiImages,
  wikiImageRoots,
  writeWikiImage,
} from "../src/api/wiki-image-storage";

const scratch = await mkdtemp(join(tmpdir(), "shenron-wiki-upload-"));
afterAll(async () => {
  const target = resolve(scratch);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("shenron-wiki-upload-"))
    throw new Error("Unsafe fixture cleanup path");
  await rm(target, { recursive: true, force: true });
});

test("sealed deployments put uploads beside the writable database, outside packaged static assets", () => {
  const roots = wikiImageRoots("/app/data/bot.db", "/app");
  expect(roots[0]?.replaceAll("\\", "/")).toEndWith("/app/data/wiki-uploads");
  expect(roots[1]?.replaceAll("\\", "/")).toEndWith("/site/public/wiki");
});

test("an uploaded image is stored, read back and listed without touching historical assets", async () => {
  const roots = [
    join(scratch, "data/wiki-uploads"),
    join(scratch, "site/public/wiki"),
    join(scratch, "assets/wiki"),
  ];
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const path = await writeWikiImage(bytes, "techniques", ".png", roots);
  expect(path).toMatch(/^\.\/assets\/wiki\/techniques\/[a-f0-9-]{36}\.png$/);
  const relative = path.slice("./assets/wiki/".length);
  const file = await findWikiImage(relative, roots);
  expect(file).not.toBeNull();
  expect(new Uint8Array(await file!.arrayBuffer())).toEqual(bytes);
  const files = await listWikiImages(roots);
  expect(files.some((entry) => `./${entry.path}` === path)).toBe(true);
  expect(await Bun.file(join(roots[1]!, relative)).exists()).toBe(false);
});

test("legacy images remain visible and listings deduplicate identical relative names", async () => {
  const roots = [
    join(scratch, "priority/current"),
    join(scratch, "priority/legacy"),
    join(scratch, "priority/assets"),
  ];
  await Bun.write(join(roots[1]!, "characters/goku.png"), "legacy", { createPath: true });
  await Bun.write(join(roots[2]!, "characters/goku.png"), "old mirror", { createPath: true });
  expect(await (await findWikiImage("characters/goku.png", roots))!.text()).toBe("legacy");
  await Bun.write(join(roots[0]!, "characters/goku.png"), "current", { createPath: true });
  expect(await (await findWikiImage("characters/goku.png", roots))!.text()).toBe("current");
  expect((await listWikiImages(roots)).map((file) => file.path)).toEqual([
    "assets/wiki/characters/goku.png",
  ]);
});

test("upload destinations and public reads reject traversal and active file extensions", async () => {
  const roots = [join(scratch, "guard")];
  await expect(writeWikiImage(new Uint8Array([1]), "../private", ".png", roots)).rejects.toThrow();
  await expect(writeWikiImage(new Uint8Array([1]), "techniques", ".html", roots)).rejects.toThrow();
  for (const path of [
    "../secret.png",
    "/absolute.png",
    "..\\secret.png",
    "C:\\secret.png",
    "image\0.png",
  ])
    expect(await findWikiImage(path, roots)).toBeNull();
});
