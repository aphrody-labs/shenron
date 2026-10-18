#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Private-data guard of the local Docker build (Dockerfile.build, scripts/build/local.ts).
 * Fails when a private or DBXV2 file can enter the build context or leave in an artifact.
 *
 *   bun scripts/build/local-guard.ts --static             # Dockerfile.build.dockerignore is a strict allow-list
 *   bun scripts/build/local-guard.ts --context            # list the real BuildKit context, refuse private paths
 *   bun scripts/build/local-guard.ts --artifacts <dir>…   # release trees: private files, DBXV2 marker
 *
 * DBXV2 (Bandai Namco / Dimps) stays private: no game data in the context, no @dbxv2-private module
 * or generated declaration in any artifact (same marker scan as the public server build).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { findDbxv2Leaks } from "../../packages/dbxv2/src/guard.ts";
import { privateFiles } from "./server-data.ts";

const ROOT = resolve(import.meta.dir, "../..");
export const IGNORE_FILE = join(ROOT, "Dockerfile.build.dockerignore");

/** Paths that must never be part of a build context (matched on `/`-separated relative paths). */
const CONTEXT_FORBIDDEN: readonly [RegExp, string][] = [
  [/(^|\/)\.env(\.|$)|\.env$/, "environment file"],
  [
    /(^|\/)(var|\.coord|\.claude|\.codex|\.agents|\.git|target|node_modules)\//,
    "local state or cache",
  ],
  [/^data\/(?!lexique-db-canonique\.json$)/, "private data directory"],
  [
    /\.(sqlite3?|db|db-wal|db-shm|pem|key|p12|pfx|gguf|safetensors|cpk|afs)$/i,
    "database, key, model or game archive",
  ],
  [/(^|\/)id_(rsa|ed25519|ecdsa)/, "ssh key"],
  [/(^|\/)dbxv2\.d\.ts$|(^|\/)\.dbxv2/, "generated DBXV2 declarations"],
  [/(^|\/)dbxv2-data\//, "DBXV2 game data"],
  [/(^|\/)dist\//, "previous build output"],
];

export function contextProblems(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const path = name.replace(/^\.\//, "").replaceAll("\\", "/");
    for (const [re, why] of CONTEXT_FORBIDDEN) if (re.test(path)) out.push(`${path}: ${why}`);
  }
  return out;
}

/** The .dockerignore must be an allow-list that denies first and never re-includes private paths. */
export function ignoreFileProblems(text: string): string[] {
  const rules = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const problems: string[] = [];
  if (rules[0] !== "**") problems.push("the first rule must be `**` (deny everything, then allow)");
  const required = [
    "**/node_modules",
    "**/target",
    "**/.env",
    "**/.env.*",
    "**/*.sqlite",
    "**/*.db",
    "**/*.pem",
    "**/*.key",
    "**/*.cpk",
    "**/.coord",
    "/var",
    "/data/home",
    "**/dbxv2.d.ts",
  ];
  for (const rule of required)
    if (!rules.includes(rule)) problems.push(`missing deny rule ${rule}`);
  const forbiddenAllow =
    /^!\/?(var|\.coord|\.git|\.env|node_modules|target|data\/home|dist)(\/|$)|^!\*\*/;
  for (const rule of rules)
    if (rule.startsWith("!") && forbiddenAllow.test(rule))
      problems.push(`forbidden allow rule ${rule}`);
  // Each deny rule must come after the allow-list it protects.
  const lastAllow = rules.reduce((n, r, i) => (r.startsWith("!") ? i : n), -1);
  for (const rule of ["**/.env", "**/*.sqlite", "**/node_modules"])
    if (rules.indexOf(rule) < lastAllow) problems.push(`${rule} must follow the last allow rule`);
  return problems;
}

/** Private files and DBXV2 modules under a release tree (paths relative to it). */
export function artifactProblems(dir: string): string[] {
  const problems: string[] = [];
  // The public VFS is the only database a server payload may carry.
  for (const file of privateFiles(dir))
    if (!/(^|\/)vfs\/shenron-vfs\.public\.sqlite$/.test(file.replaceAll("\\", "/")))
      problems.push(`${file}: private file`);
  for (const leak of findDbxv2Leaks(dir)) problems.push(`${leak}: DBXV2 marker or declarations`);
  return problems;
}

async function contextNames(): Promise<string[]> {
  const tar = join(ROOT, "dist/local/.context.tar");
  const code = await Bun.spawn(
    [
      "docker",
      "buildx",
      "bake",
      "-f",
      join(ROOT, "docker-bake.hcl"),
      "context-dump",
      "--set",
      `*.output=type=tar,dest=${tar}`,
    ],
    { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"], env: process.env },
  ).exited;
  if (code !== 0) throw new Error("docker buildx bake context-dump failed");
  const list = Bun.spawnSync(["tar", "-tf", ".context.tar"], { cwd: join(ROOT, "dist/local") });
  if (list.exitCode !== 0) throw new Error("tar -tf failed");
  return list.stdout
    .toString()
    .split(/\r?\n/)
    .filter((n) => n && !n.endsWith("/"));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const problems: string[] = [];
  if (args.includes("--static"))
    problems.push(...ignoreFileProblems(readFileSync(IGNORE_FILE, "utf8")));
  if (args.includes("--context")) {
    const names = await contextNames();
    console.log(`context: ${names.length} files`);
    problems.push(...contextProblems(names));
  }
  const at = args.indexOf("--artifacts");
  if (at >= 0)
    for (const dir of args.slice(at + 1).filter((a) => !a.startsWith("--"))) {
      if (!existsSync(dir) || !statSync(dir).isDirectory())
        problems.push(`${dir}: not a directory`);
      else
        problems.push(...artifactProblems(dir).map((p) => `${relative(ROOT, resolve(dir))}/${p}`));
    }
  if (problems.length) {
    console.error(
      `private-data guard FAILED (${problems.length}):\n${problems.slice(0, 40).join("\n")}`,
    );
    process.exit(1);
  }
  console.log("private-data guard: ok");
}
