// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flattenStandaloneExternals } from "./standalone-externals";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const createRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-standalone-"));
  roots.push(root);
  return root;
};

test("keeps a real Turbopack external alias loadable after the isolated store is removed", async () => {
  const root = createRoot();
  const packagePath = join(root, "node_modules/.bun/image-engine@1.0.0/node_modules/image-engine");
  await Bun.write(
    join(packagePath, "package.json"),
    JSON.stringify({ name: "image-engine", version: "1.0.0", main: "index.cjs" }),
  );
  await Bun.write(join(packagePath, "index.cjs"), "module.exports = { decoded: true };\n");
  const importer = join(root, "apps/site/.next-standalone");
  const alias = join(importer, "node_modules/image-engine-82ee47560f7d93a4");
  await Bun.write(join(importer, "node_modules/.keep"), "");
  symlinkSync(packagePath, alias, "junction");

  const result = flattenStandaloneExternals(root);
  expect(result.externalAliases).toEqual([
    "apps/site/.next-standalone/node_modules/image-engine-82ee47560f7d93a4".replaceAll(
      "/",
      process.platform === "win32" ? "\\" : "/",
    ),
  ]);
  expect(existsSync(join(root, "node_modules/.bun"))).toBe(false);
  expect(
    (await import(Bun.resolveSync("image-engine-82ee47560f7d93a4", importer))).default,
  ).toEqual({ decoded: true });
});

test("refuses an alias pointing outside the standalone tree before flattening", async () => {
  const root = createRoot();
  const outside = createRoot();
  await Bun.write(
    join(outside, "package.json"),
    JSON.stringify({ name: "image-engine", version: "1.0.0" }),
  );
  const modules = join(root, "apps/site/.next-standalone/node_modules");
  await Bun.write(join(modules, ".keep"), "");
  symlinkSync(outside, join(modules, "image-engine-82ee47560f7d93a4"), "junction");
  expect(() => flattenStandaloneExternals(root)).toThrow("escapes standalone");
});
