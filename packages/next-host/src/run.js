"use strict";
// `next-bun dev|build|start ...`: the app's Next.js on Bun with no Node.js on
// the machine. `bun --bun next` runs Next itself on Bun, but Turbopack spawns
// `node` from PATH for its PostCSS and webpack-loader workers. This runner puts
// a `node` that is this Bun first on PATH, so the workers run on Bun too.
// Needed on every platform: with an absolute path to `next` and no `node` on
// PATH, Next 16.1.6 to 16.5 fails with "spawning node pooled process" on Linux
// and Windows. `bun --bun node_modules/next/dist/bin/next` (bare relative path)
// only works because Bun then runs it as a package bin and adds its own shim.

const {
  copyFileSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { delimiter, dirname, join } = require("node:path");

/**
 * The Bun to run. A compiled executable hosting the runner is not `bun`
 * itself, so the `bun` on PATH stands in for it.
 */
function bunExecutable() {
  const main = typeof Bun === "undefined" ? "" : Bun.main;
  const compiled = main.startsWith("/$bunfs/") || main.startsWith("B:/~BUN/");
  return compiled ? (Bun.which("bun") ?? process.execPath) : process.execPath;
}

function defaultShimDir() {
  return join(tmpdir(), `next-bun-node-${process.getuid?.() ?? 0}`);
}

function sameFile(a, b) {
  try {
    const x = statSync(a);
    const y = statSync(b);
    return x.size === y.size && x.mtimeMs === y.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Returns a directory holding a `node` that is `bun`, creating it on first use
 * and repairing it when it points at another executable (a Bun upgrade).
 * Windows gets a hard link (or a copy) named `node.exe`; elsewhere a symlink.
 */
function bunNodeShim(dir = defaultShimDir(), bun = bunExecutable()) {
  mkdirSync(dir, { recursive: true });
  if (process.platform === "win32") {
    const exe = join(dir, "node.exe");
    if (sameFile(exe, bun)) return dir;
    try {
      unlinkSync(exe);
    } catch {}
    try {
      linkSync(bun, exe);
    } catch {
      copyFileSync(bun, exe);
      const { atime, mtime } = statSync(bun);
      utimesSync(exe, atime, mtime);
    }
    return dir;
  }
  const link = join(dir, "node");
  try {
    if (lstatSync(link).isSymbolicLink() && readlinkSync(link) === bun) return dir;
    unlinkSync(link);
  } catch {}
  symlinkSync(bun, link);
  return dir;
}

/** The `next` CLI installed for the app in `cwd`. Throws when the app has no `next`. */
function nextBin(cwd = process.cwd()) {
  const manifest = require.resolve("next/package.json", { paths: [cwd] });
  return join(dirname(manifest), "dist", "bin", "next");
}

/** The process `next-bun <args>` spawns: Bun running the app's `next`, the Bun `node` first on PATH. */
function nextCommand(args, cwd = process.cwd(), shim = bunNodeShim()) {
  const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === "PATH") ?? "PATH";
  const env = { ...process.env };
  delete env[pathKey];
  return {
    cmd: [bunExecutable(), "--bun", nextBin(cwd), ...args],
    env: {
      ...env,
      PATH: `${shim}${delimiter}${process.env[pathKey] ?? ""}`,
      NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1",
    },
  };
}

/** Runs the app's `next <argv>` in `cwd` and resolves to its exit code. */
async function runNext(argv, cwd = process.cwd()) {
  const { cmd, env } = nextCommand(argv, cwd);
  const child = Bun.spawn(cmd, { cwd, env, stdio: ["inherit", "inherit", "inherit"] });
  return await child.exited;
}

module.exports = { bunExecutable, bunNodeShim, nextBin, nextCommand, runNext };
