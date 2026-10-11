// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { workspaceCommands } from "./workspace-gates";

export function nativeRuntime(configured: string | undefined): string {
  if (!configured) return process.execPath;
  if (!isAbsolute(configured) || !existsSync(configured))
    throw new Error("SHENRON_BUN_EXECUTABLE must name an existing absolute runtime path");
  return configured;
}

export function nativeCheckArgs(args: string[]): string[] {
  if (args[0] === "tsc") return ["check", ...args.slice(1).filter((arg) => arg !== "--noEmit")];
  if (args[0] === "bun") return args.slice(1);
  throw new Error(`Unsupported native check command: ${args[0]}`);
}

async function run(): Promise<number> {
  const mode = process.argv[2];
  if (!["check", "lint", "fmt"].includes(mode ?? ""))
    throw new Error("Usage: native-quality.ts check|lint|fmt [paths or flags]");
  const root = resolve(import.meta.dir, "../..");
  const runtime = nativeRuntime(process.env.SHENRON_BUN_EXECUTABLE);
  const supplied = process.argv.slice(3);
  const commands =
    mode === "check" && supplied.length === 0
      ? workspaceCommands(root, "typecheck").map((command) => ({
          cwd: command.cwd,
          args: nativeCheckArgs(command.args),
        }))
      : [
          {
            cwd: root,
            args: [
              mode!,
              ...(mode === "lint" ? ["--no-n2b", "-c", ".oxlintrc.json"] : []),
              ...(mode === "fmt" ? ["--check", "-c", ".oxfmtrc.json"] : []),
              ...(supplied.length ? supplied : ["apps", "packages", "scripts"]),
            ],
          },
        ];
  console.log(`Native quality runtime: ${runtime}`);
  let result = 0;
  for (const command of commands) {
    const child = Bun.spawn([runtime, ...command.args], {
      cwd: command.cwd,
      // The fork resolves a same-named package script unless this lifecycle identifies
      // the command itself. This prevents the root lint script shadowing native lint.
      env: {
        ...process.env,
        PATH: [dirname(runtime), process.env.PATH].filter(Boolean).join(delimiter),
        npm_lifecycle_event: mode,
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    if (code !== 0) result = code || 1;
  }
  return result;
}

if (import.meta.main) process.exit(await run());
