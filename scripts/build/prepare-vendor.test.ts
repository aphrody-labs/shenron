// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HLS_URL, prepareVendor, type GitRunner } from "./prepare-vendor";

const commit = "a".repeat(40);
function fixture(
  options: { url?: string; tree?: string; dirty?: string; head?: string; top?: string } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "shenron-hls-"));
  const vendor = join(root, "vendor/hls.js");
  mkdirSync(join(vendor, "dist"), { recursive: true });
  writeFileSync(
    join(vendor, "package.json"),
    JSON.stringify({
      name: "@aphrody/hls.js",
      license: "Apache-2.0",
      exports: { ".": "./dist/hls.mjs", "./dist/*": "./dist/*" },
      types: "./dist/hls.d.ts",
    }),
  );
  for (const name of ["LICENSE", "dist/hls.mjs", "dist/hls.d.ts", "dist/hls.worker.js"])
    writeFileSync(join(vendor, name), "fixture");
  const commands: string[][] = [];
  const git: GitRunner = (args) => {
    commands.push(args);
    if (args.includes("--get-regexp")) return "submodule.vendor/hls.js.path vendor/hls.js";
    if (args.includes("--get")) return options.url ?? HLS_URL;
    if (args[0] === "ls-tree") return options.tree ?? `160000 commit ${commit}\tvendor/hls.js`;
    if (args.includes("status")) return options.dirty ?? "";
    if (args.includes("--show-toplevel")) return options.top ?? vendor;
    if (args.includes("rev-parse")) return options.head ?? commit;
    return "";
  };
  return {
    root,
    vendor,
    commands,
    git,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("initialization targets only the pinned owned submodule and checks actual export files", () => {
  const f = fixture();
  try {
    expect(prepareVendor(f.root, true, f.git).commit).toBe(commit);
    expect(f.commands.filter((args) => args[0] === "submodule")).toEqual([
      ["submodule", "sync", "--", "vendor/hls.js"],
      ["submodule", "update", "--init", "--checkout", "--", "vendor/hls.js"],
    ]);
    rmSync(join(f.vendor, "dist/hls.d.ts"));
    expect(() => prepareVendor(f.root, false, f.git)).toThrow();
  } finally {
    f.close();
  }
});

for (const url of [
  "https://github.com/video-dev/hls.js.git",
  "https://token@github.com/aphrody-labs/hls.js.git",
  `${HLS_URL}?token=private`,
]) {
  test("untrusted URL is rejected before initialization", () => {
    const f = fixture({ url });
    try {
      expect(() => prepareVendor(f.root, true, f.git)).toThrow("untrusted");
      expect(f.commands.some((args) => args[0] === "submodule")).toBe(false);
    } finally {
      f.close();
    }
  });
}
for (const options of [
  { tree: "" },
  { dirty: " M vendor/hls.js" },
  { head: "b".repeat(40) },
  { top: tmpdir() },
]) {
  test("missing gitlink, dirty vendor, wrong commit or parent repository is rejected", () => {
    const f = fixture(options);
    try {
      expect(() => prepareVendor(f.root, false, f.git)).toThrow();
    } finally {
      f.close();
    }
  });
}

test("real Git reads the committed gitlink and rejects a dirty nested checkout", () => {
  const f = fixture();
  const git = (cwd: string, args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid",
        GIT_COMMITTER_NAME: "fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) throw new Error("fixture Git failed");
    return result.stdout.toString().trim();
  };
  try {
    git(f.vendor, ["init", "-q"]);
    git(f.vendor, ["add", "--", "package.json", "LICENSE", "dist"]);
    git(f.vendor, ["commit", "-qm", "fixture distribution"]);
    git(f.root, ["init", "-q"]);
    writeFileSync(
      join(f.root, ".gitmodules"),
      `[submodule "vendor/hls.js"]\npath = vendor/hls.js\nurl = ${HLS_URL}\n`,
    );
    git(f.root, ["add", "--", ".gitmodules", "vendor/hls.js"]);
    git(f.root, ["commit", "-qm", "fixture gitlink"]);
    expect(prepareVendor(f.root).commit).toBe(git(f.vendor, ["rev-parse", "HEAD"]));
    writeFileSync(join(f.vendor, "dist/hls.mjs"), "modified distribution");
    expect(() => prepareVendor(f.root)).toThrow("not clean");
  } finally {
    f.close();
  }
});
