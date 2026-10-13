#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Cargo runner for `cargo tauri build --runner` and scripts/build/desktop.ts: forwards
 * `build …` to cargo, through cargo-xwin for an MSVC target built on Linux, and through the
 * serialized build wrapper named by APHRODY_CARGO_SERIAL when set (shared build lock, bounded
 * jobs, sccache).
 *
 * Heavy Cargo never runs in WSL: there (or with SHENRON_CARGO_REMOTE=vps) the build goes
 * through Aphrody's VPS tunnel (`vps-cargo.ts run --repo shenron`, the exact worktree built on
 * the VPS) and the produced binaries and cdylibs come back into the local target directory, where
 * the Tauri bundler and the packaging scripts expect them. SHENRON_CARGO_REMOTE=off builds here.
 * The Aphrody checkout is APHRODY_ROOT (default ~/aphrody).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { msvcCrossConfig } from "./msvc-cross.ts";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const target = option("--target") ?? "";
const crossMsvc = process.platform !== "win32" && target.endsWith("-pc-windows-msvc");

const aphrody = resolve(process.env.APHRODY_ROOT ?? join(homedir(), "aphrody"));
const vpsCargo = join(aphrody, "scripts/build/rust/vps-cargo.ts");
const remoteMode = process.env.SHENRON_CARGO_REMOTE?.trim();
const remote =
  remoteMode === "vps" ||
  (remoteMode !== "off" &&
    !process.env.APHRODY_CARGO_SERIAL &&
    Boolean(process.env.WSL_DISTRO_NAME) &&
    existsSync(vpsCargo));

type Metadata = {
  packages: {
    name: string;
    manifest_path: string;
    targets: { name: string; kind: string[] }[];
  }[];
  workspace_root: string;
  target_directory: string;
};

function metadata(): Metadata {
  const out = Bun.spawnSync(["cargo", "metadata", "--no-deps", "--format-version", "1"], {
    stderr: "inherit",
  });
  if (out.exitCode !== 0) throw new Error("cargo metadata failed");
  return JSON.parse(out.stdout.toString()) as Metadata;
}

/** Local files a remote `build` produces, by package and `--bin`/`--lib` selection. */
export function artifactNames(
  pkg: Metadata["packages"][number],
  selection: { bins: readonly string[]; lib: boolean },
  windows: boolean,
  wasm = false,
): string[] {
  const { bins, lib } = selection;
  const names: string[] = [];
  for (const t of pkg.targets) {
    if (t.kind.includes("bin") && (bins.length === 0 ? !lib : bins.includes(t.name)))
      names.push(`${t.name}${windows ? ".exe" : ""}`);
    if (t.kind.includes("cdylib") && (lib || bins.length === 0)) {
      const base = t.name.replaceAll("-", "_");
      names.push(wasm ? `${base}.wasm` : windows ? `${base}.dll` : `lib${base}.so`);
    }
  }
  return names;
}

async function sha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

/**
 * Tree of the exact worktree (tracked + untracked, ignores honoured), as vps-cargo snapshots it:
 * artifacts fetched for the same tree are reused without another remote job.
 */
function worktreeTree(): string {
  const git = (argv: string[], env: Record<string, string> = {}) => {
    const out = Bun.spawnSync(["git", ...argv], { env: { ...process.env, ...env } });
    if (out.exitCode !== 0) throw new Error(`git ${argv[0]} failed`);
    return out.stdout.toString().trim();
  };
  const gitDir = git(["rev-parse", "--absolute-git-dir"]);
  const index = join(gitDir, "shenron-runner.index");
  copyFileSync(join(gitDir, "index"), index);
  git(["add", "-A", ":/"], { GIT_INDEX_FILE: index });
  return git(["write-tree"], { GIT_INDEX_FILE: index });
}

type Stamp = { tree: string; files: Record<string, string> };
type VpsConfig = {
  host: string;
  controlPath: string;
  repositories: Record<string, { root: string; remoteTargetDir: string }>;
};

/** The tunnel repository whose root is this worktree (`shenron`, or a release worktree). */
function repositoryName(config: VpsConfig): string {
  const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]).stdout.toString().trim();
  const found = Object.entries(config.repositories).find(
    ([, repo]) => resolve(repo.root.replace(/^~/, homedir())) === resolve(top),
  );
  if (!found) throw new Error(`${top}: no repository of config/host/vps-cargo.json builds it`);
  return found[0];
}

async function runRemote(): Promise<number> {
  const meta = metadata();
  const packages = args.flatMap((arg, i) =>
    arg === "-p" || arg === "--package" ? [args[i + 1]!] : [],
  );
  const forwarded = [...args];
  if (packages.length === 0) {
    // `cargo tauri build` runs in the crate directory without `-p`: select that crate.
    const here = meta.packages.find(
      (p) => resolve(p.manifest_path, "..") === resolve(process.cwd()),
    );
    if (!here) throw new Error(`no workspace package in ${process.cwd()}`);
    packages.push(here.name);
    forwarded.splice(1, 0, "-p", here.name);
  }
  const selection = {
    bins: args.flatMap((arg, i) => (arg === "--bin" ? [args[i + 1]!] : [])),
    lib: args.includes("--lib"),
  };
  const profile = args.includes("--release") ? "release" : (option("--profile") ?? "debug");
  const sub = join(target, profile === "dev" ? "debug" : profile);
  const localDir = join(process.env.CARGO_TARGET_DIR ?? meta.target_directory, sub);
  const windows = target.includes("windows");
  const wanted = packages.flatMap((name) => {
    const pkg = meta.packages.find((p) => p.name === name);
    if (!pkg) throw new Error(`unknown package ${name}`);
    return artifactNames(pkg, selection, windows, target.startsWith("wasm32"));
  });
  const config = (await Bun.file(
    join(aphrody, "tools/config/host/vps-cargo.json"),
  ).json()) as VpsConfig;
  const stampFile = join(localDir, ".shenron-remote.json");
  const tree = worktreeTree();
  const stamp: Stamp = existsSync(stampFile)
    ? ((await Bun.file(stampFile).json()) as Stamp)
    : { tree: "", files: {} };
  if (stamp.tree !== tree) stamp.files = {};
  stamp.tree = tree;
  const fresh = await Promise.all(
    wanted.map(
      async (file) =>
        stamp.files[file] !== undefined &&
        existsSync(join(localDir, file)) &&
        (await sha256(join(localDir, file))) === stamp.files[file],
    ),
  );
  if (fresh.every(Boolean)) {
    console.error(`[cargo-runner] ${wanted.join(", ")}: already built for this worktree`);
    return 0;
  }
  const repo = repositoryName(config);
  const command = [
    process.execPath,
    vpsCargo,
    "run",
    "--repo",
    repo,
    "--",
    ...(crossMsvc ? ["xwin"] : []),
    ...forwarded,
    ...(crossMsvc ? msvcCrossConfig(process.env.CFLAGS) : []),
  ];
  const child = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"] });
  const code = await child.exited;
  if (code !== 0) return code;

  // Bring the artifacts back: same layout as a local build.
  const remoteTarget = config.repositories[repo]!.remoteTargetDir;
  mkdirSync(localDir, { recursive: true });
  const control = `ControlPath=${config.controlPath.replace(/^~/, homedir())}`;
  for (const file of wanted) {
    const remotePath = `${remoteTarget}/${sub}/${file}`;
    const copy = Bun.spawnSync(
      ["scp", "-q", "-o", control, `${config.host}:${remotePath}`, join(localDir, file)],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    if (copy.exitCode !== 0) throw new Error(`fetch ${remotePath} failed`);
    const sum = Bun.spawnSync(["ssh", "-o", control, config.host, `sha256sum ${remotePath}`]);
    const remoteDigest = sum.stdout.toString().split(/\s+/)[0]!;
    if ((await sha256(join(localDir, file))) !== remoteDigest)
      throw new Error(`sha256 mismatch for ${file}`);
    stamp.files[file] = remoteDigest;
    console.error(`[cargo-runner] fetched ${sub}/${file}`);
  }
  await Bun.write(stampFile, `${JSON.stringify(stamp, null, 2)}\n`);
  return 0;
}

if (import.meta.main) {
  if (remote) {
    process.exit(await runRemote());
  }
  const serial = process.env.APHRODY_CARGO_SERIAL?.trim();
  const command = serial
    ? [serial, ...(crossMsvc ? ["xwin"] : []), ...args]
    : crossMsvc
      ? ["cargo-xwin", ...args]
      : ["cargo", ...args];
  if (crossMsvc) command.push(...msvcCrossConfig(process.env.CFLAGS));
  const child = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"], env: process.env });
  process.exit(await child.exited);
}
