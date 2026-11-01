// SPDX-License-Identifier: Apache-2.0
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { nativeEnvironment, nativeRuntime } from "./native-runtime";

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
    if (!tokens.length || tokens[0] !== "bun" || /[;|<>`$]/.test(command)) {
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
    result.push({ cwd: root, packageName: "scripts", args: ["bun", "check", "-p", "scripts"] });
  return result;
}

export async function runWorkspaceGate(root: string, gate: Gate): Promise<number> {
  let result = 0;
  const runtime = nativeRuntime(process.env.SHENRON_BUN_EXECUTABLE);
  const commands = workspaceCommands(root, gate);
  const defaultConcurrency = gate === "typecheck" ? 6 : 1;
  const concurrency = Math.max(
    1,
    Number(process.env.SHENRON_GATE_CONCURRENCY ?? defaultConcurrency) || defaultConcurrency,
  );
  if (concurrency === 1) {
    for (const command of commands) {
      console.log(`[${command.packageName}] ${command.args.join(" ")}`);
      const [, ...args] = command.args;
      const cmd = [runtime, ...args];
      try {
        const child = Bun.spawn(cmd, {
          cwd: command.cwd,
          env: nativeEnvironment(runtime, args[0]!),
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

  const outputs = Array.from<
    { header: string; stdout: string; stderr: string; code: number } | undefined
  >({
    length: commands.length,
  });
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, commands.length) }, async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= commands.length) break;
      const command = commands[index]!;
      const header = `[${command.packageName}] ${command.args.join(" ")}`;
      const [, ...args] = command.args;
      const cmd = [runtime, ...args];
      try {
        const child = Bun.spawn(cmd, {
          cwd: command.cwd,
          env: nativeEnvironment(runtime, args[0]!),
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        });
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        outputs[index] = { header, stdout, stderr, code };
      } catch (error) {
        outputs[index] = {
          header,
          stdout: "",
          stderr: `${error instanceof Error ? error.message : String(error)}\n`,
          code: 1,
        };
      }
    }
  });
  await Promise.all(workers);
  for (const out of outputs) {
    if (!out) continue;
    console.log(out.header);
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.stderr) process.stderr.write(out.stderr);
    if (out.code !== 0) result = out.code || 1;
  }
  return result;
}

if (import.meta.main) {
  const gate = process.argv[2];
  if (gate !== "typecheck" && gate !== "test")
    throw new Error("Usage: workspace-gates.ts typecheck|test");
  process.exit(await runWorkspaceGate(resolve(import.meta.dir, "../.."), gate));
}
