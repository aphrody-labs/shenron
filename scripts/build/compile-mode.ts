// SPDX-License-Identifier: Apache-2.0
/**
 * How `bun build --compile` turns the bot and the server into executables (Bun 1.4.4).
 *
 * - `aot`: `--aot` compiles the JavaScript to machine code. It cannot cross-compile (the
 *   compiler only targets the platform it runs on) and the executable carries no Bun command
 *   line, so `BUN_BE_BUN=1` cannot run a script from disk with it: the server, which starts
 *   the Next standalone `server.js`, ships a real Bun at runtime/bun beside its AOT executable.
 *   Not every Bun 1.4.4 canary build links big module graphs: 11c367163 panics in LinkAndEmit on
 *   Linux for the bot and the server (5b598476c does not), hence the fallback to `bytecode`.
 * - `bytecode`: the bundle plus a JavaScriptCore bytecode cache (`--bytecode --format=esm`),
 *   which skips parsing at start-up. The cache is only valid for the JavaScriptCore of the Bun
 *   that writes it, so it is left out when another runtime (`SHENRON_COMPILE_BUN`) is embedded.
 * - `bundle`: the plain bundle, as before.
 */
import { realpathSync } from "node:fs";

export type CompileMode = "aot" | "bytecode" | "bundle";
export type CompileTarget = "linux-x64" | "linux-x64-musl" | "windows-x64";

/** The `--target` this Bun compiles for natively; musl hosts are not detected (never AOT). */
export function hostTarget(platform = process.platform, arch = process.arch): CompileTarget | null {
  if (arch !== "x64") return null;
  if (platform === "win32") return "windows-x64";
  if (platform === "linux") return "linux-x64";
  return null;
}

/** Whether `compileBun` (SHENRON_COMPILE_BUN) is another runtime than the Bun running the build. */
export function foreignRuntime(compileBun: string | undefined, execPath = process.execPath) {
  if (!compileBun?.trim()) return false;
  const real = (path: string) => {
    try {
      return realpathSync(path);
    } catch {
      return path;
    }
  };
  const normalize = (path: string) =>
    process.platform === "win32" ? real(path).toLowerCase() : real(path);
  return normalize(compileBun) !== normalize(execPath);
}

export interface ModeRequest {
  target: CompileTarget;
  /** `false` with `--no-aot` or `SHENRON_AOT=0`. */
  aot: boolean;
  /** SHENRON_COMPILE_BUN. */
  compileBun?: string;
  host?: CompileTarget | null;
  execPath?: string;
}

/** The best mode the request allows, with the reason when AOT is not used. */
export function chooseCompileMode(request: ModeRequest): { mode: CompileMode; reason?: string } {
  const host = request.host === undefined ? hostTarget() : request.host;
  const foreign = foreignRuntime(request.compileBun, request.execPath);
  if (request.aot && !foreign && host === request.target) return { mode: "aot" };
  const reason = !request.aot
    ? "aot disabled"
    : foreign
      ? "SHENRON_COMPILE_BUN embeds another runtime"
      : `--aot cannot cross-compile to ${request.target}`;
  return foreign ? { mode: "bundle", reason } : { mode: "bytecode", reason };
}

/** Flags of `bun build --compile` for a mode. */
export function compileModeFlags(mode: CompileMode, options: { codeFromDisk?: boolean } = {}) {
  if (mode === "aot")
    return ["--aot", ...(options.codeFromDisk ? ["--aot-allow-code-from-disk"] : [])];
  if (mode === "bytecode") return ["--bytecode", "--format=esm"];
  return [];
}

/** `--no-aot` on the command line or `SHENRON_AOT=0` in the environment turns AOT off. */
export function aotRequested(
  args: string[],
  env: Record<string, string | undefined> = process.env,
) {
  return !args.includes("--no-aot") && env.SHENRON_AOT !== "0";
}
