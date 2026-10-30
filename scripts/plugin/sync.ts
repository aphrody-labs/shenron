#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from "node:path";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";

export async function portableManifests(root: string): Promise<Record<string, string>> {
  const source = await Bun.file(join(root, "plugin/.claude-plugin/plugin.json")).json();
  if (typeof source.version !== "string" || !source.version.trim())
    throw new Error("The canonical plugin version is required");
  const openai = await Bun.file(join(root, "plugin/openai/plugin.json")).json();
  const mcp = await Bun.file(join(root, "plugin/openai/mcp.json")).json();
  const registry = await Bun.file(join(root, "plugin/source-of-truth.json")).json();
  if (!mcp.mcpServers?.shenron) throw new Error("The public Shenron MCP entry is required");
  openai.version = source.version;
  mcp.mcpServers.shenron.url = `${DEFAULT_PUBLIC_ORIGINS.site}/mcp`;
  registry.knowledge = (
    await Array.fromAsync(
      new Bun.Glob("**/*.md").scan({
        cwd: join(root, "plugin"),
        dot: true,
      }),
    )
  )
    .map((path) => path.replaceAll("\\", "/"))
    .toSorted();
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  return {
    "plugin/openai/plugin.json": json(openai),
    "plugin/openai/mcp.json": json(mcp),
    "plugin/source-of-truth.json": json(registry),
  };
}

export async function syncPortable(root: string, check: boolean): Promise<string[]> {
  const changed: string[] = [];
  for (const [path, text] of Object.entries(await portableManifests(root))) {
    const file = Bun.file(join(root, path));
    if (await file.exists()) {
      try {
        if (JSON.stringify(await file.json()) === JSON.stringify(JSON.parse(text))) continue;
      } catch {
        // Invalid JSON is drift and is repaired only in write mode.
      }
    }
    changed.push(path);
    if (!check) await Bun.write(file, text);
  }
  return changed;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const check = args.includes("--check");
  const revisionIndex = args.indexOf("--sources-depuis");
  if (
    args.some(
      (arg, index) =>
        arg !== "--check" &&
        arg !== "--sources-depuis" &&
        !(revisionIndex >= 0 && index === revisionIndex + 1),
    )
  )
    throw new Error("Usage: sync.ts [--check] [--sources-depuis REV]");
  if (revisionIndex >= 0 && !args[revisionIndex + 1])
    throw new Error("A source revision is required");
  const root = resolve(import.meta.dir, "../..");
  for (const script of ["agy-manifest.ts", "build-references.ts"]) {
    const command = [process.execPath, join(root, "scripts/plugin", script)];
    if (check) command.push("--check");
    if (script === "build-references.ts" && revisionIndex >= 0)
      command.push("--sources-depuis", args[revisionIndex + 1]!);
    const child = Bun.spawn(command, { cwd: root, stdout: "inherit", stderr: "inherit" });
    const exitCode = await child.exited;
    if (exitCode !== 0) process.exit(exitCode);
  }
  const changed = await syncPortable(root, check);
  console.log(JSON.stringify({ check, changed }));
  if (check && changed.length) process.exit(1);
}
