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
 *
 * Tuning flags (`compileTuning`) ride on any mode and are each added only when the Bun that runs
 * the build lists the flag in `bun build --help`, since an older Bun ignores an unknown flag
 * silently: `--trim` and `--trim-locales` (canary; opt-in with `SHENRON_TRIM=1`, locales read
 * from the site and bot i18n sources) and `--bytecode-order` (stable 1.4.5; only with a file that
 * exists, named by `SHENRON_BOT_BYTECODE_ORDER` or `SHENRON_SERVER_BYTECODE_ORDER`). Record such
 * a file by running the built executable once through its real start-up with
 * `BUN_BYTECODE_ORDER_OUT=<file>`; no order file is committed.
 */
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { SUPPORTED_LOCALES } from "../../apps/site/src/lib/i18n/types";

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

/**
 * The Bun that runs `bun build --compile --aot`, and that the executable embeds. Bun 1.4.4
 * canaries differ in whether the AOT linker handles the bot and server module graphs (see the
 * header), so a release can name a known good one with `SHENRON_AOT_BUN`; otherwise the Bun
 * running the build is used.
 */
export function aotBun(
  mode: CompileMode,
  env: Record<string, string | undefined> = process.env,
  execPath = process.execPath,
) {
  return mode === "aot" && env.SHENRON_AOT_BUN?.trim() ? env.SHENRON_AOT_BUN.trim() : execPath;
}

export interface BuildFlagSupport {
  aot: boolean;
  trim: boolean;
  trimLocales: boolean;
  bytecodeOrder: boolean;
}

const SUPPORT_CACHE = new Map<string, BuildFlagSupport>();

/**
 * The build flags `bun` knows. A Bun without one (the Shenron 1.4.3 runtime of the container
 * images has no `--aot`) ignores it silently and writes a plain bundle, so each flag must be
 * decided from the help text, not from the exit code.
 */
export function buildFlagSupport(bun: string): BuildFlagSupport {
  const cached = SUPPORT_CACHE.get(bun);
  if (cached) return cached;
  const help = Bun.spawnSync([bun, "build", "--help"], { stdout: "pipe", stderr: "pipe" });
  const text = help.exitCode === 0 ? help.stdout.toString() : "";
  const support = {
    aot: helpMentionsAot(text),
    trim: helpMentionsFlag(text, "trim"),
    trimLocales: helpMentionsFlag(text, "trim-locales"),
    bytecodeOrder: helpMentionsFlag(text, "bytecode-order"),
  };
  SUPPORT_CACHE.set(bun, support);
  return support;
}

/** Whether `bun` knows `--aot`. */
export function supportsAot(bun: string): boolean {
  return buildFlagSupport(bun).aot;
}

/** Whether the help lists `--<flag>` as an option of its own (`--trim` is not `--trim-locales`). */
export function helpMentionsFlag(help: string, flag: string): boolean {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*--${escaped}(?:=<[^>]*>)?\\s`, "m").test(help);
}

export function helpMentionsAot(help: string): boolean {
  return helpMentionsFlag(help, "aot");
}

export type CompileProduct = "bot" | "server";

const ROOT = resolve(import.meta.dir, "../..");

/**
 * The locales an executable ships: the bot reads `apps/bot/src/locales/<lang>.json`, the server
 * embeds the site (`SUPPORTED_LOCALES`) and the bot dictionaries it shares.
 */
export function shippedLocales(product: CompileProduct, root = ROOT): string[] {
  const bot = readdirSync(resolve(root, "apps/bot/src/locales"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length));
  const all = product === "bot" ? bot : [...SUPPORTED_LOCALES, ...bot];
  return [...new Set(all)].sort();
}

/** `SHENRON_TRIM=1` (or the former `SHENRON_AOT_TRIM=1`) opts into `--trim`. */
export function trimRequested(env: Record<string, string | undefined> = process.env) {
  return env.SHENRON_TRIM === "1" || env.SHENRON_AOT_TRIM === "1";
}

/**
 * The order files named by `SHENRON_<PRODUCT>_BYTECODE_ORDER` (comma-separated, relative to
 * `root`): the ones that exist, and the ones that do not.
 */
export function bytecodeOrderFiles(
  product: CompileProduct,
  env: Record<string, string | undefined> = process.env,
  root = ROOT,
) {
  const named = (env[`SHENRON_${product.toUpperCase()}_BYTECODE_ORDER`] ?? "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => resolve(root, path));
  return {
    found: named.filter((path) => existsSync(path)),
    missing: named.filter((path) => !existsSync(path)),
  };
}

export interface TuningRequest {
  product: CompileProduct;
  mode: CompileMode;
  /** The Bun that runs the build. */
  bun: string;
  /** SHENRON_COMPILE_BUN: another runtime reads neither the trimmed layout nor the bytecode order. */
  compileBun?: string;
  env?: Record<string, string | undefined>;
  root?: string;
  support?: BuildFlagSupport;
  locales?: readonly string[];
}

/** `--trim`, `--trim-locales` and `--bytecode-order` for a compile, with what was left out and why. */
export function compileTuning(request: TuningRequest): { flags: string[]; notes: string[] } {
  const env = request.env ?? process.env;
  const support = request.support ?? buildFlagSupport(request.bun);
  const foreign = foreignRuntime(request.compileBun);
  const flags: string[] = [];
  const notes: string[] = [];
  if (trimRequested(env)) {
    if (foreign) notes.push("trim skipped: SHENRON_COMPILE_BUN embeds another runtime");
    else if (!support.trim) notes.push("trim skipped: bun has no --trim");
    else {
      flags.push("--trim");
      const locales = request.locales ?? shippedLocales(request.product, request.root);
      if (support.trimLocales && locales.length) flags.push(`--trim-locales=${locales.join(",")}`);
    }
  }
  const order = bytecodeOrderFiles(request.product, env, request.root);
  for (const path of order.missing) notes.push(`bytecode order skipped: ${path} does not exist`);
  if (order.found.length && request.mode === "bytecode") {
    if (foreign) notes.push("bytecode order skipped: SHENRON_COMPILE_BUN embeds another runtime");
    else if (!support.bytecodeOrder)
      notes.push("bytecode order skipped: bun has no --bytecode-order");
    else flags.push(`--bytecode-order=${order.found.join(",")}`);
  }
  return { flags, notes };
}
