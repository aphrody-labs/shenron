#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Aligns the manifests of `crates/*` on the workspace (idempotent):
 *
 * - every crate inherits `version`, `edition`, `rust-version` and `[lints]` from the root
 *   Cargo.toml (`version.workspace = true`, `[lints] workspace = true`);
 * - Shenron crates (`shenron-*`) also inherit `license`, `authors`, `homepage` and `repository`;
 * - upstream Koharu crates (`koharu-*`) keep their own `MIT OR Apache-2.0` licence, the
 *   attribution of their upstream authors and their upstream links.
 *
 *   bun scripts/build/rust/align-crates.ts --check [crate…]   # exit 1 on drift (default mode)
 *   bun scripts/build/rust/align-crates.ts --write [crate…]   # rewrite the drifting manifests
 *
 * Positional names restrict the run to those crates (directory or package name). When --write
 * moves a crate to the workspace version, the generated `[workspace.dependencies]` block and the
 * member versions of Cargo.lock are refreshed (workspace-deps.ts, `cargo update --workspace`).
 * The edit is textual: comments, order and formatting of the manifests are kept.
 */
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const UPSTREAM_LICENSE = "MIT OR Apache-2.0";
/** Package keys inherited by every crate, in manifest order. */
const COMMON = ["version", "edition", "rust-version"] as const;
/** Package keys only Shenron crates inherit; upstream Koharu crates keep their own. */
const OWNED = ["license", "authors", "homepage", "repository"] as const;
/** Canonical order used to place an inserted key after its predecessor. */
const ORDER = ["name", ...COMMON, "description", ...OWNED];

export interface Alignment {
  name: string;
  text: string;
  changes: string[];
  problems: string[];
  /** The crate moved from its own version to the workspace version. */
  versionChanged: boolean;
}

type Table = Record<string, unknown>;
const inherited = (value: unknown) =>
  typeof value === "object" && value !== null && (value as Table).workspace === true;

/** Index of the line ending the TOML value that starts on `lines[start]` (multi-line arrays). */
function valueEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let i = start; i < lines.length; i += 1) {
    const line = i === start ? lines[i]!.slice(lines[i]!.indexOf("=") + 1) : lines[i]!;
    for (const char of line.replace(/"(?:[^"\\]|\\.)*"/g, "").replace(/#.*$/, "")) {
      if (char === "[" || char === "{") depth += 1;
      if (char === "]" || char === "}") depth -= 1;
    }
    if (depth <= 0) return i;
  }
  return lines.length - 1;
}

/** Aligns one manifest; `text` is returned unchanged when nothing drifts. */
export function alignManifest(text: string, workspaceVersion: string): Alignment {
  const manifest = Bun.TOML.parse(text) as { package?: Table; lints?: Table };
  const pkg = manifest.package;
  if (!pkg || typeof pkg.name !== "string") throw new Error("manifest without [package] name");
  const name = pkg.name;
  const upstream = name.startsWith("koharu-");
  const changes: string[] = [];
  const problems: string[] = [];
  let versionChanged = false;

  if (upstream) {
    if (pkg.license !== UPSTREAM_LICENSE) {
      problems.push(
        `license ${JSON.stringify(pkg.license)}: upstream Koharu crates keep "${UPSTREAM_LICENSE}"`,
      );
    }
    if (!Array.isArray(pkg.authors) || pkg.authors.length === 0) {
      problems.push("authors: upstream Koharu crates keep the attribution of their authors");
    }
  }

  const lines = text.split("\n");
  const header = lines.findIndex((line) => /^\s*\[package\]\s*(#.*)?$/.test(line));
  const sectionEnd = () => {
    const next = lines.findIndex((line, i) => i > header && /^\s*\[/.test(line));
    return next < 0 ? lines.length : next;
  };
  const keyLine = (key: string) => {
    const end = sectionEnd();
    const pattern = new RegExp(`^\\s*${key.replace("-", "\\-")}\\s*(=|\\.)`);
    for (let i = header + 1; i < end; i += 1) if (pattern.test(lines[i]!)) return i;
    return -1;
  };

  for (const key of upstream ? COMMON : [...COMMON, ...OWNED]) {
    if (inherited(pkg[key])) continue;
    const line = keyLine(key);
    if (line >= 0) {
      const last = valueEnd(lines, line);
      lines.splice(line, last - line + 1, `${key}.workspace = true`);
      changes.push(`${key} ${JSON.stringify(pkg[key])} -> workspace`);
      if (key === "version" && pkg.version !== workspaceVersion) versionChanged = true;
      continue;
    }
    // Missing key: place it after the closest predecessor of the canonical order.
    let after = header;
    for (const previous of ORDER.slice(0, ORDER.indexOf(key)).reverse()) {
      const found = keyLine(previous);
      if (found >= 0) {
        after = valueEnd(lines, found);
        break;
      }
    }
    lines.splice(after + 1, 0, `${key}.workspace = true`);
    changes.push(`${key} -> workspace`);
    if (key === "version") versionChanged = true;
  }

  const lints = manifest.lints;
  if (lints === undefined) {
    let end = sectionEnd();
    while (end > header + 1 && lines[end - 1]!.trim() === "") end -= 1;
    lines.splice(end, 0, "", "[lints]", "workspace = true");
    if (end + 3 < lines.length && lines[end + 3]!.trim() !== "") lines.splice(end + 3, 0, "");
    changes.push("[lints] -> workspace");
  } else if (lints.workspace !== true) {
    problems.push("[lints] has its own levels: move them to [workspace.lints] of Cargo.toml");
  }

  const next = lines.join("\n");
  const check = Bun.TOML.parse(next) as { package: Table; lints?: Table };
  for (const key of upstream ? COMMON : [...COMMON, ...OWNED]) {
    if (!inherited(check.package[key]))
      throw new Error(`${name}: ${key} not inherited after alignment`);
  }
  return { name, text: next, changes, problems, versionChanged };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const only = new Set(args.filter((arg) => !arg.startsWith("--")));
  const root = Bun.TOML.parse(await Bun.file(join(ROOT, "Cargo.toml")).text()) as {
    workspace: { package: { version: string } };
  };
  const version = root.workspace.package.version;
  let drift = false;
  let failed = false;
  let versionChanged = false;
  const files = [...new Bun.Glob("crates/*/Cargo.toml").scanSync(ROOT)].sort();
  const seen = new Set<string>();
  for (const file of files) {
    const path = join(ROOT, file);
    const text = await Bun.file(path).text();
    const result = alignManifest(text, version);
    const dir = file.split("/")[1]!;
    if (only.size && !only.has(dir) && !only.has(result.name)) continue;
    seen.add(dir).add(result.name);
    for (const problem of result.problems) {
      failed = true;
      console.error(`${result.name}: ${problem}`);
    }
    if (!result.changes.length) continue;
    drift = true;
    console.log(`${result.name}: ${result.changes.join(", ")}`);
    if (write) {
      await Bun.write(path, result.text);
      versionChanged ||= result.versionChanged;
    }
  }
  const unknown = [...only].filter((name) => !seen.has(name));
  if (unknown.length) throw new Error(`unknown crates: ${unknown.join(", ")}`);
  if (!write) {
    if (drift) console.error("crate manifests drift from the workspace: align-crates.ts --write");
    process.exit(drift || failed ? 1 : 0);
  }
  if (versionChanged) {
    for (const command of [
      ["bun", join(import.meta.dir, "workspace-deps.ts")],
      ["cargo", "update", "--workspace"],
    ]) {
      console.log(`$ ${command.join(" ")}`);
      const run = Bun.spawnSync(command, { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });
      if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.main) await main();
