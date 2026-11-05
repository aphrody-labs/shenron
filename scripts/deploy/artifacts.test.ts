// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { get, has, prune, put } from "./artifacts.ts";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const made: string[] = [];
const temp = () => {
  const directory = mkdtempSync(join(tmpdir(), "artifacts-"));
  made.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function tree() {
  const root = temp();
  mkdirSync(join(root, "out/sub"), { recursive: true });
  writeFileSync(join(root, "out/a.txt"), "same");
  writeFileSync(join(root, "out/sub/b.bin"), "different");
  return root;
}

test("put then get restores identical files and dedupes objects", async () => {
  const store = temp();
  const source = tree();
  await put(store, source, "site", KEY_A, ["out"]);
  writeFileSync(join(source, "out/sub/b.bin"), "changed");
  await put(store, source, "site", KEY_B, ["out"]);
  expect(has(store, "site", KEY_A)).toBe(true);
  // "same" is stored once for both keys: three objects in total.
  const objects = readdirSync(join(store, "objects")).flatMap((prefix) => readdirSync(join(store, "objects", prefix)));
  expect(objects.length).toBe(3);
  const target = temp();
  await get(store, target, "site", KEY_A);
  expect(readFileSync(join(target, "out/sub/b.bin"), "utf8")).toBe("different");
  expect(readFileSync(join(target, "out/a.txt"), "utf8")).toBe("same");
});

test("get refuses a corrupt object and leaves the root untouched", async () => {
  const store = temp();
  const source = tree();
  const manifest = await put(store, source, "bot", KEY_A, ["out"]);
  const digest = manifest.files[0]!.sha256;
  writeFileSync(join(store, "objects", digest.slice(0, 2), digest), "tampered");
  const target = temp();
  await expect(get(store, target, "bot", KEY_A)).rejects.toThrow(/corrupt|missing/);
  expect(existsSync(join(target, "out"))).toBe(false);
});

test("ids are validated and paths cannot escape the root", async () => {
  const store = temp();
  expect(() => has(store, "../x", KEY_A)).toThrow(/lane name/);
  expect(() => has(store, "site", "nothex")).toThrow(/lane key/);
  const source = tree();
  await put(store, source, "site", KEY_A, ["out"]);
  const path = join(store, "manifests/site", `${KEY_A}.json`);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.files[0].path = "../escape.txt";
  writeFileSync(path, JSON.stringify(manifest));
  await expect(get(store, temp(), "site", KEY_A)).rejects.toThrow(/outside the root/);
});

test("prune keeps the newest manifests per lane and drops orphan objects", async () => {
  const store = temp();
  const source = tree();
  await put(store, source, "site", KEY_A, ["out"]);
  await Bun.sleep(5);
  writeFileSync(join(source, "out/sub/b.bin"), "newer");
  await put(store, source, "site", KEY_B, ["out"]);
  expect(prune(store, 1)).toEqual({ manifests: 1, objects: 1 });
  expect(has(store, "site", KEY_A)).toBe(false);
  expect(has(store, "site", KEY_B)).toBe(true);
});
