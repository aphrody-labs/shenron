#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const HLS_VENDOR = "vendor/hls.js";
export const HLS_URL = "https://github.com/aphrody-labs/hls.js.git";
export type GitRunner = (args: string[]) => string;

export function requireVendorFile(root: string, name: string): string {
  if (lstatSync(root).isSymbolicLink()) throw new Error("vendor symlink is forbidden");
  const path = resolve(root, name);
  const rel = relative(root, path);
  if (isAbsolute(name) || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("vendor file escapes its root");
  let parent = root;
  for (const segment of rel.split(/[\\/]/)) {
    parent = join(parent, segment);
    if (lstatSync(parent).isSymbolicLink()) throw new Error("vendor symlink is forbidden");
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || !stat.size) throw new Error(`missing vendor distribution file: ${name}`);
  return path;
}

export function prepareVendor(root: string, init = false, runner?: GitRunner) {
  const git: GitRunner =
    runner ??
    ((args) => {
      const child = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
      if (child.exitCode !== 0) throw new Error("vendor Git operation failed");
      return child.stdout.toString().trim();
    });
  const entries = git([
    "config",
    "--file",
    ".gitmodules",
    "--get-regexp",
    "^submodule\\..*\\.path$",
  ]);
  const keys = entries.split(/\r?\n/).flatMap((line) => {
    const match = /^(submodule\..*\.path)\s+vendor\/hls\.js$/.exec(line);
    return match ? [match[1]!] : [];
  });
  if (keys.length !== 1) throw new Error("expected one HLS submodule declaration");
  const url = git([
    "config",
    "--file",
    ".gitmodules",
    "--get",
    keys[0]!.replace(/\.path$/, ".url"),
  ]);
  if (url !== HLS_URL && url !== HLS_URL.replace(/\.git$/, ""))
    throw new Error("untrusted HLS submodule URL");
  const tree = git(["ls-tree", "HEAD", "--", HLS_VENDOR]);
  const match = /^160000 commit ([a-f0-9]{40})\tvendor\/hls\.js$/.exec(tree);
  if (!match) throw new Error("HLS must be a committed gitlink");
  // Parent status includes dirty and untracked submodule content, but not an uninitialized link.
  const before = git(["status", "--porcelain", "--untracked-files=normal", "--", HLS_VENDOR]);
  if (before) throw new Error("HLS vendor is not clean");
  if (init) {
    git(["submodule", "sync", "--", HLS_VENDOR]);
    git(["submodule", "update", "--init", "--checkout", "--", HLS_VENDOR]);
  }
  const vendor = resolve(root, HLS_VENDOR);
  const top = git(["-C", HLS_VENDOR, "rev-parse", "--show-toplevel"]);
  if (resolve(top) !== vendor) throw new Error("HLS submodule is not initialized");
  if (git(["-C", HLS_VENDOR, "rev-parse", "HEAD"]) !== match[1])
    throw new Error("HLS vendor commit differs from its gitlink");
  if (git(["-C", HLS_VENDOR, "status", "--porcelain", "--untracked-files=normal"]))
    throw new Error("HLS vendor is not clean");
  const pkg = JSON.parse(readFileSync(requireVendorFile(vendor, "package.json"), "utf8"));
  if (pkg.name !== "@aphrody/hls.js" || pkg.license !== "Apache-2.0")
    throw new Error("unexpected HLS package");
  const targets = new Set<string>(["dist/hls.worker.js", "LICENSE"]);
  const visit = (value: unknown) => {
    if (typeof value === "string" && !value.includes("*")) targets.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  [pkg.main, pkg.module, pkg.types, pkg.typings, pkg.exports].forEach(visit);
  for (const target of targets) requireVendorFile(vendor, target);
  return { path: vendor, url, commit: match[1]!, files: [...targets] };
}

if (import.meta.main) {
  if (process.argv.slice(2).some((arg) => arg !== "--init"))
    throw new Error("expected only --init");
  console.log(
    JSON.stringify(
      prepareVendor(resolve(import.meta.dir, "../.."), process.argv.includes("--init")),
    ),
  );
}
