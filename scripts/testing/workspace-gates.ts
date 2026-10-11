// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Gate = "typecheck" | "test";
export interface GateCommand {
  cwd: string;
  packageName: string;
  args: string[];
}

export function splitGateScript(script: string): string[][] {
  return script.split(/\s+&&\s+/).map((command) => {
    const tokens: string[] = [];
    let token = "";
    let quote: string | null = null;
    for (const character of command) {
      if (quote) {
        if (character === quote) quote = null;
        else token += character;
      } else if (character === "'" || character === '"') quote = character;
      else if (/\s/.test(character)) {
        if (token) tokens.push(token);
        token = "";
      } else token += character;
    }
    if (quote) throw new Error(`Unclosed quote in workspace gate command: ${command}`);
    if (token) tokens.push(token);
    if (!tokens.length || !["bun", "tsc"].includes(tokens[0]!) || /[;|<>`$]/.test(command)) {
      throw new Error(`Unsupported workspace gate command: ${command}`);
    }
    return tokens;
  });
}

export function workspaceCommands(root: string, gate: Gate): GateCommand[] {
  const result: GateCommand[] = [];
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const pattern of manifest.workspaces.packages as string[]) {
    if (!pattern.endsWith("/*")) throw new Error(`Unsupported workspace pattern: ${pattern}`);
    const base = join(root, pattern.slice(0, -2));
    for (const entry of readdirSync(base, { withFileTypes: true })
      .filter((candidate) => candidate.isDirectory())
      .toSorted((a, b) => a.name.localeCompare(b.name))) {
      const cwd = join(base, entry.name);
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      const script = pkg.scripts?.[gate];
      if (!script) continue;
      for (const args of splitGateScript(script)) result.push({ cwd, packageName: pkg.name, args });
    }
  }
  if (gate === "typecheck")
    result.push({ cwd: root, packageName: "scripts", args: ["tsc", "--noEmit", "-p", "scripts"] });
  return result;
}

async function nativeTypeScript(root: string): Promise<string> {
  const pkg = Bun.resolveSync("typescript/package.json", root);
  const module = await import(pathToFileURL(join(dirname(pkg), "lib/getExePath.js")).href);
  return module.default();
}

export async function runWorkspaceGate(root: string, gate: Gate): Promise<number> {
  let result = 0;
  for (const command of workspaceCommands(root, gate)) {
    console.log(`[${command.packageName}] ${command.args.join(" ")}`);
    const [executable, ...args] = command.args;
    const cmd =
      executable === "bun" ? [process.execPath, ...args] : [await nativeTypeScript(root), ...args];
    try {
      const child = Bun.spawn(cmd, {
        cwd: command.cwd,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      const code = await child.exited;
      if (code !== 0) result = code || 1;
    } catch (error) {
      console.error(
        `[${command.packageName}] ${error instanceof Error ? error.message : String(error)}`,
      );
      result = 1;
    }
  }
  return result;
}

if (import.meta.main) {
  const gate = process.argv[2];
  if (gate !== "typecheck" && gate !== "test")
    throw new Error("Usage: workspace-gates.ts typecheck|test");
  process.exit(await runWorkspaceGate(resolve(import.meta.dir, "../.."), gate));
}
