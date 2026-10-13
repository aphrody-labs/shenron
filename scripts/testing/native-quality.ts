// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { workspaceCommands } from "./workspace-gates";
import { nativeEnvironment, nativeRuntime } from "./native-runtime";
export { nativeRuntime } from "./native-runtime";

export function nativeCheckArgs(args: string[]): string[] {
  if (args[0] === "bun" && args[1] === "check")
    return args.slice(1).filter((arg) => arg !== "--noEmit");
  throw new Error(`Unsupported native check command: ${args[0]}`);
}

export function hasStylePaths(args: string[]): boolean {
  const valueFlags = new Set(["-c", "--config", "--ignore-pattern", "--format"]);
  for (let index = 0; index < args.length; index++) {
    if (valueFlags.has(args[index]!)) index++;
    else if (!args[index]!.startsWith("-")) return true;
  }
  return false;
}

async function run(): Promise<number> {
  const mode = process.argv[2];
  if (!["check", "lint", "fmt"].includes(mode ?? ""))
    throw new Error("Usage: native-quality.ts check|lint|fmt [paths or flags]");
  const root = resolve(import.meta.dir, "../..");
  const runtime = nativeRuntime(process.env.SHENRON_BUN_EXECUTABLE);
  const supplied = process.argv.slice(3);
  const formatterIgnores: string[] =
    mode === "fmt"
      ? ((await Bun.file(resolve(root, ".oxfmtrc.json")).json()).ignorePatterns ?? [])
      : [];
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
              ...(mode === "fmt" ? ["-c", ".oxfmtrc.json"] : []),
              ...formatterIgnores.flatMap((pattern) => ["--ignore-pattern", pattern]),
              ...supplied,
              ...(mode !== "check" && !hasStylePaths(supplied)
                ? ["apps", "packages", "scripts"]
                : []),
            ],
          },
        ];
  console.log(`Native quality runtime: ${runtime}`);
  let result = 0;
  for (const command of commands) {
    const child = Bun.spawn([runtime, ...command.args], {
      cwd: command.cwd,
      env: nativeEnvironment(runtime, mode!),
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
