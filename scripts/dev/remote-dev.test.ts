// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  KEEP_IN_MAIN,
  regenerablePaths,
  remoteScript,
  shellQuote,
  vitalTarArgs,
} from "./remote-dev.ts";

function tree(paths: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "remote-dev-"));
  for (const path of paths) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "f"), "x");
  }
  return root;
}

describe("regenerablePaths", () => {
  test("finds fixed roots and nested build directories, never descending into them", () => {
    const root = tree([
      "target/debug",
      "node_modules/a/node_modules/b",
      "apps/site/.next-dev/cache",
      "apps/site/src",
      "packages/ui/node_modules/x",
      "data/home/memory",
      "vendor/codex/node_modules",
    ]);
    expect(regenerablePaths(root).map((p) => p.slice(root.length + 1))).toEqual([
      "apps/site/.next-dev",
      "node_modules",
      "packages/ui/node_modules",
      "target",
    ]);
  });

  test("keeps the main checkout's node_modules", () => {
    const root = tree(["node_modules/a", "apps/bot/node_modules/b", "dist/x"]);
    expect(regenerablePaths(root, KEEP_IN_MAIN).map((p) => p.slice(root.length + 1))).toEqual([
      "dist",
    ]);
  });
});

describe("vitalTarArgs", () => {
  test("archives existing vital paths relative to / and excludes models", () => {
    const root = tree(["data/home/memory", "data/home/models/embed", "apps/bot/data"]);
    const home = tree([".aphrody/private/shenron/home"]);
    const args = vitalTarArgs(root, home);
    const members = args.slice(args.indexOf("-C") + 2);
    expect(members).toContain(join(root, "data/home").slice(1));
    expect(members).toContain(join(root, "apps/bot/data").slice(1));
    expect(members).toContain(join(home, ".aphrody/private/shenron").slice(1));
    expect(members.some((m) => m.includes("source-acquisition"))).toBe(false);
    expect(args).toContain(`--exclude=${join(root, "data/home/models").slice(1)}`);
    expect(args).toContain(`--exclude=${join(home, ".aphrody/private/shenron/home").slice(1)}`);
  });
});

describe("remoteScript", () => {
  test("runs inside the checkout with the toolchains and the serialized Cargo wrapper", () => {
    const script = remoteScript(DEFAULT_CONFIG, "bun run lint && echo 'ok'");
    expect(script).toContain(`cd "$HOME/${DEFAULT_CONFIG.workspace}"`);
    expect(script).toContain(`APHRODY_CARGO_SERIAL=${DEFAULT_CONFIG.cargoSerial}`);
    expect(script).toContain(`nice -n 10 bash -c 'bun run lint && echo '\\''ok'\\'''`);
  });

  test("shellQuote leaves safe words bare", () => {
    expect(shellQuote("a/b-c.d")).toBe("a/b-c.d");
    expect(shellQuote("a b")).toBe("'a b'");
  });
});
