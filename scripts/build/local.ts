#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Local Docker build of the Shenron deliverables (Linux and Windows) into dist/local/.
 *
 *   bun scripts/build/local.ts <site|bot|server|cli|mcp|desktop|wasm|image|all>
 *       [--target linux-x64|windows-x64|all] [--flavor desktop|production] [--vfs <public.sqlite>]
 *       [--allow-no-vfs] [--desktop-args "<args>"] [--force] [--no-guard] [--dry-run]
 *
 * Runs `docker buildx bake` (docker-bake.hcl, Dockerfile.build), then for each artifact: guard
 * (no private/DBXV2 file), SHA-256, binary format check (PE/ELF), `--version` smoke where a runtime
 * exists, and writes dist/local/manifest.json + dist/local/SHA256SUMS. Without `--target`, the
 * component is built for linux-x64 and windows-x64 (desktop: windows-x64 only; image: linux-x64).
 * Runbook: docs/operations/build-local.md.
 */
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { artifactProblems, ignoreFileProblems, IGNORE_FILE } from "./local-guard.ts";

const ROOT = resolve(import.meta.dir, "../..");
const DIST = join(ROOT, "dist/local");
const COMPONENTS = [
  "site",
  "bot",
  "server",
  "cli",
  "mcp",
  "desktop",
  "wasm",
  "image",
  "all",
  "refresh",
] as const;
type Component = (typeof COMPONENTS)[number];
type Target = "linux-x64" | "windows-x64";

const args = process.argv.slice(2);
const component = args[0] as Component;
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined);
if (!COMPONENTS.includes(component)) {
  console.error(
    `usage: local.ts <${COMPONENTS.join("|")}> [--target linux-x64|windows-x64|all] [--flavor desktop|production] [--vfs file]`,
  );
  process.exit(2);
}
const targetArg = opt("--target") ?? "all";
if (!["linux-x64", "windows-x64", "all"].includes(targetArg))
  throw new Error("--target linux-x64|windows-x64|all");
const wanted = (targetArg === "all" ? ["linux-x64", "windows-x64"] : [targetArg]) as Target[];

/** Bake targets per component and target; the image is a Linux-only artifact. */
function bakeTargets(): {
  bake: string[];
  collect: Array<{ component: string; target: Target; from: string; files: string[] }>;
} {
  const bake: string[] = [];
  const collect: Array<{ component: string; target: Target; from: string; files: string[] }> = [];
  const exe = (t: Target, n: string) => (t === "windows-x64" ? `${n}.exe` : n);
  const add = (c: string, t: Target, bakeTarget: string, files: string[]) => {
    if (!bake.includes(bakeTarget)) bake.push(bakeTarget);
    collect.push({ component: c, target: t, from: bakeTarget, files });
  };
  const all = component === "all";
  for (const t of wanted) {
    if (all || component === "cli") add("cli", t, `rust-${t}`, [exe(t, "shenron")]);
    if (all || component === "mcp") add("mcp", t, `rust-${t}`, [exe(t, "shenron-mcp")]);
    if (all)
      add("ffi", t, `rust-${t}`, [t === "windows-x64" ? "shenron_ffi.dll" : "libshenron_ffi.so"]);
    if (all || component === "bot") add("bot", t, `bot-${t}`, ["*"]);
    if (all || component === "server" || component === "site")
      add(
        component === "site" ? "site" : "server",
        t,
        `server-${t}`,
        component === "site" ? ["cdn/**", "server/site/**"] : ["server/**"],
      );
    if (all) add("cdn", t, `server-${t}`, ["cdn/**"]);
  }
  if (all || component === "desktop") {
    if (wanted.includes("windows-x64")) add("desktop", "windows-x64", "desktop-windows-x64", ["*"]);
    else if (component === "desktop")
      throw new Error(
        "desktop is built for windows-x64 only in Docker (the Linux bundle needs webkit2gtk, use --target windows-x64)",
      );
  }
  if (all || component === "wasm") add("wasm", "linux-x64", "wasm", ["*"]);
  if ((all || component === "image") && wanted.includes("linux-x64")) bake.push("release-linux");
  return { bake, collect };
}

// ------------------------------------------------------------------------------------------ helpers
const run = (
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string>; quiet?: boolean } = {},
) =>
  Bun.spawnSync(cmd, {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
  });
const text = (r: ReturnType<typeof run>) => `${r.stdout.toString()}${r.stderr.toString()}`.trim();

function gitInfo() {
  const sha = text(run(["git", "rev-parse", "--short=12", "HEAD"]));
  const dirty = text(run(["git", "status", "--porcelain", "--untracked-files=no"])).length > 0;
  const version = (
    JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }
  ).version;
  return { sha, dirty, version };
}

async function sha256(path: string): Promise<string> {
  const h = new Bun.CryptoHasher("sha256");
  for await (const c of Bun.file(path).stream()) h.update(c);
  return h.digest("hex");
}

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name), base)
      : [relative(base, join(dir, e.name)).replaceAll("\\", "/")],
  );
}

/** Disk free (GiB) of the drive holding `path`, from PowerShell on Windows, `df` elsewhere. */
function freeGiB(path: string): number {
  if (process.platform === "win32") {
    const drive = resolve(path).slice(0, 1);
    const r = run(["pwsh", "-NoProfile", "-Command", `(Get-PSDrive ${drive}).Free`]);
    return Number(text(r)) / 2 ** 30;
  }
  return Number(
    text(run(["df", "--output=avail", "-B1G", path]))
      .split("\n")
      .pop(),
  );
}

const MIN_FREE_GIB: Record<Component, number> = {
  refresh: 0,
  cli: 12,
  mcp: 12,
  wasm: 8,
  bot: 8,
  server: 14,
  site: 14,
  image: 22,
  desktop: 30,
  all: 40,
};

async function ensureDocker(): Promise<void> {
  const ping = () => run(["docker", "info", "--format", "{{.ServerVersion}}"]).exitCode === 0;
  if (ping()) return;
  if (process.platform !== "win32") throw new Error("docker daemon unreachable");
  const exe = "C:/Program Files/Docker/Docker/Docker Desktop.exe";
  if (!existsSync(exe))
    throw new Error("docker daemon unreachable and Docker Desktop is not installed");
  console.error(
    "docker daemon down: starting Docker Desktop (no WSL distro other than docker-desktop is started)",
  );
  Bun.spawn([exe], { stdio: ["ignore", "ignore", "ignore"] }).unref();
  for (let i = 0; i < 60; i++) {
    await Bun.sleep(5000);
    if (ping()) return;
  }
  throw new Error("docker daemon still unreachable after 5 minutes");
}

/** Git token for the private aphrody-labs repositories, written to a 0600 file mounted as a BuildKit secret. */
function writeGitSecret(): string {
  const token =
    process.env.APHRODY_GIT_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    text(run(["gh", "auth", "token"]));
  if (!token || /\s/.test(token))
    throw new Error("no GitHub token (APHRODY_GIT_TOKEN, GH_TOKEN, or `gh auth login`)");
  const dir = join(DIST, ".secrets");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "gitconfig");
  writeFileSync(
    file,
    `[url "https://x-access-token:${token}@github.com/"]\n\tinsteadOf = https://github.com/\n`,
    { mode: 0o600 },
  );
  return file;
}

// ---------------------------------------------------------------------------------------- verification
const SMOKE: Record<string, string[]> = {
  shenron: ["--version"],
  "shenron-mcp": ["--version"],
  "shenron-server": ["version"],
  "shenron-bot": ["--smoke"],
};

/** PE (x86-64) or ELF (x86-64) header check. */
function binaryKind(path: string): string {
  const b = readFileSync(path).subarray(0, 4096);
  if (b[0] === 0x4d && b[1] === 0x5a) {
    const pe = b.readUInt32LE(0x3c);
    if (b.subarray(pe, pe + 4).toString("latin1") === "PE\0\0")
      return b.readUInt16LE(pe + 4) === 0x8664
        ? "PE32+ x86-64"
        : `PE machine 0x${b.readUInt16LE(pe + 4).toString(16)}`;
    return "MZ without PE";
  }
  if (b[0] === 0x7f && b.subarray(1, 4).toString() === "ELF")
    return b[4] === 2 && b.readUInt16LE(18) === 62 ? "ELF64 x86-64" : "ELF other";
  return "unknown";
}

function smoke(path: string, target: Target): { result: string; output?: string } {
  const name = path
    .split(/[\\/]/)
    .pop()!
    .replace(/\.exe$/, "");
  const args = SMOKE[name];
  if (!args) return { result: "not-applicable" };
  if (target === "windows-x64") {
    if (process.platform !== "win32")
      return { result: "not-run (no Windows runtime or Wine here)" };
    const r = Bun.spawnSync([path, ...args], { timeout: 30000 });
    return {
      result: r.exitCode === 0 ? "ok (native Windows)" : `failed (exit ${r.exitCode})`,
      output: text(r).slice(0, 200),
    };
  }
  const dir = dirname(path);
  const r = run([
    "docker",
    "run",
    "--rm",
    "-v",
    `${dir}:/a:ro`,
    "ubuntu:26.10",
    `/a/${path.split(/[\\/]/).pop()}`,
    ...args,
  ]);
  return {
    result: r.exitCode === 0 ? "ok (ubuntu:26.10 container)" : `failed (exit ${r.exitCode})`,
    output: text(r).slice(0, 200),
  };
}

// ------------------------------------------------------------------------------------------------ main
type Entry = {
  component: string;
  target: string;
  file: string;
  bytes: number;
  sha256: string;
  kind: string;
  smoke: string;
  smokeOutput?: string;
};
const manifestPath = join(DIST, "manifest.json");

/** Re-hash the files already in dist/local (after Authenticode signing, for instance). */
async function refresh() {
  const m = JSON.parse(readFileSync(manifestPath, "utf8")) as { entries: Entry[] };
  for (const e of m.entries) {
    const p = join(DIST, e.file);
    e.bytes = statSync(p).size;
    e.sha256 = await sha256(p);
  }
  writeFileSync(manifestPath, `${JSON.stringify(m, null, 2)}\n`);
  writeFileSync(
    join(DIST, "SHA256SUMS"),
    m.entries.map((e) => `${e.sha256}  ${e.file}`).join("\n") + "\n",
  );
  console.log(`manifest refreshed: ${m.entries.length} files`);
}

async function main() {
  if (component === "refresh") return refresh();
  const { bake, collect } = bakeTargets();
  const { sha, dirty, version } = gitInfo();
  const ignoreProblems = ignoreFileProblems(readFileSync(IGNORE_FILE, "utf8"));
  if (ignoreProblems.length)
    throw new Error(`Dockerfile.build.dockerignore: ${ignoreProblems.join("; ")}`);
  console.log(
    `local build: ${component} [${wanted.join(",")}] -> bake ${bake.join(" ")} (sha ${sha}${dirty ? ", working tree dirty" : ""})`,
  );
  if (flag("--dry-run")) return;

  const need = MIN_FREE_GIB[component];
  const free = freeGiB(ROOT);
  console.log(
    `free disk: ${free.toFixed(1)} GiB (needs ~${need} GiB for ${component}: docker image layers, caches, outputs)`,
  );
  if (free < need && !flag("--force")) {
    throw new Error(
      `not enough free disk (${free.toFixed(1)} < ${need} GiB). Free space or move Docker Desktop's disk image (docs/operations/build-local.md), or pass --force.`,
    );
  }
  await ensureDocker();
  mkdirSync(DIST, { recursive: true });
  const raw = join(DIST, "raw");
  rmSync(raw, { recursive: true, force: true });
  const emptyVfs = join(DIST, ".empty-vfs");
  mkdirSync(emptyVfs, { recursive: true });
  let vfsDir = emptyVfs;
  const vfs = opt("--vfs");
  if (vfs) {
    vfsDir = join(DIST, ".vfs");
    rmSync(vfsDir, { recursive: true, force: true });
    mkdirSync(vfsDir, { recursive: true });
    try {
      linkSync(resolve(vfs), join(vfsDir, "shenron-vfs.public.sqlite"));
    } catch {
      copyFileSync(resolve(vfs), join(vfsDir, "shenron-vfs.public.sqlite"));
    }
  }
  const flavor = opt("--flavor") ?? "desktop";
  const secret = writeGitSecret();
  const logDir = join(DIST, "logs");
  mkdirSync(logDir, { recursive: true });
  const log = join(logDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${component}.log`);
  try {
    const env: Record<string, string> = {
      OUT_DIR: relative(ROOT, raw).replaceAll("\\", "/"),
      SHENRON_REVISION: sha,
      FLAVOR: flavor,
      GITCONFIG_FILE: relative(ROOT, secret).replaceAll("\\", "/"),
      VFS_DIR: relative(ROOT, vfsDir).replaceAll("\\", "/"),
      ALLOW_NO_VFS: flag("--allow-no-vfs") || !vfs ? "1" : "",
      DESKTOP_ARGS: opt("--desktop-args") ?? "--skip-chat-model",
      BUILDKIT_PROGRESS: "plain",
      ...(process.env.TAURI_SIGNING_PRIVATE_KEY_FILE
        ? { TAURI_KEY_FILE: process.env.TAURI_SIGNING_PRIVATE_KEY_FILE }
        : {}),
    };
    if (!flag("--no-guard")) {
      const g = run([process.execPath, join(import.meta.dir, "local-guard.ts"), "--context"]);
      console.log(text(g).split("\n").slice(-3).join("\n"));
      if (g.exitCode !== 0) throw new Error("context guard failed");
    }
    const started = Date.now();
    const child = Bun.spawn(
      ["docker", "buildx", "bake", "-f", join(ROOT, "docker-bake.hcl"), ...bake],
      { cwd: ROOT, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" },
    );
    const pump = async (s: ReadableStream<Uint8Array>, out: NodeJS.WriteStream) => {
      for await (const chunk of s) {
        appendFileSync(log, chunk);
        out.write(chunk);
      }
    };
    await Promise.all([pump(child.stdout, process.stdout), pump(child.stderr, process.stderr)]);
    const code = await child.exited;
    console.log(
      `bake exit ${code} after ${Math.round((Date.now() - started) / 1000)} s (log: ${relative(ROOT, log)})`,
    );
    if (code !== 0) throw new Error(`docker buildx bake failed (exit ${code}); see ${log}`);
  } finally {
    rmSync(join(DIST, ".secrets"), { recursive: true, force: true });
  }

  // Collect, guard, hash, verify.
  const previous: { entries: Entry[] } = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : { entries: [] };
  const entries: Entry[] = previous.entries.filter(
    (e) => !collect.some((c) => c.component === e.component && c.target === e.target),
  );
  for (const c of collect) {
    const src = join(raw, c.from);
    if (!existsSync(src)) continue;
    const problems = artifactProblems(src);
    if (problems.length)
      throw new Error(`private-data guard failed on ${c.from}: ${problems.slice(0, 5).join(", ")}`);
    const dest = join(DIST, c.target, c.component);
    rmSync(dest, { recursive: true, force: true });
    const globs = c.files.map((f) => new Bun.Glob(f === "*" ? "**/*" : f));
    for (const file of walk(src)) {
      if (!globs.some((g) => g.match(file))) continue;
      const to = join(
        dest,
        c.component === "site" ? file.replace(/^server\//, "") : file.replace(/^server\//, ""),
      );
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(src, file), to);
      const kind =
        /\.(exe|dll)$/.test(file) ||
        /(^|\/)(shenron[\w-]*|libshenron_ffi\.so|koharu-sdk)$/.test(file)
          ? binaryKind(to)
          : "data";
      const s = kind !== "data" ? smoke(to, c.target) : { result: "not-applicable" };
      entries.push({
        component: c.component,
        target: c.target,
        file: relative(DIST, to).replaceAll("\\", "/"),
        bytes: statSync(to).size,
        sha256: await sha256(to),
        kind,
        smoke: s.result,
        smokeOutput: s.output,
      });
    }
  }
  if (bake.includes("release-linux")) {
    const tar = join(DIST, "linux-x64", "image", `shenron-${sha}.tar`);
    mkdirSync(dirname(tar), { recursive: true });
    const save = run(["docker", "save", "-o", tar, `localhost/shenron:${sha}`]);
    if (save.exitCode === 0) {
      const v = run(["docker", "run", "--rm", `localhost/shenron:${sha}`, "version"]);
      const bs = run([
        "docker",
        "run",
        "--rm",
        "--entrypoint",
        "/usr/local/bin/shenron-bot",
        `localhost/shenron:${sha}`,
        "--smoke",
      ]);
      entries.push({
        component: "image",
        target: "linux-x64",
        file: relative(DIST, tar).replaceAll("\\", "/"),
        bytes: statSync(tar).size,
        sha256: await sha256(tar),
        kind: "docker image tar",
        smoke:
          v.exitCode === 0 && bs.exitCode === 0
            ? "ok (version + bot --smoke)"
            : `failed (version ${v.exitCode}, bot ${bs.exitCode})`,
        smokeOutput: text(v).slice(0, 200),
      });
    }
  }
  entries.sort((a, b) => a.file.localeCompare(b.file));
  const manifest = {
    schema: "shenron-local-build/v1",
    version,
    sha,
    dirty,
    builtAt: new Date().toISOString(),
    docker: text(run(["docker", "version", "--format", "{{.Server.Version}}"])),
    flavor,
    entries,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(DIST, "SHA256SUMS"),
    entries.map((e) => `${e.sha256}  ${e.file}`).join("\n") + "\n",
  );
  rmSync(raw, { recursive: true, force: true });
  for (const e of entries.filter((x) =>
    collect.some((c) => c.component === x.component && c.target === x.target),
  ))
    console.log(
      `${e.target.padEnd(11)} ${e.component.padEnd(8)} ${String(e.bytes).padStart(11)}  ${e.kind.padEnd(14)} smoke: ${e.smoke}  ${e.file}`,
    );
}

await main();
