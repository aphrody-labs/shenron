#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Remote development environment: WSL stays a thin editor host, every install, gate, Rust build
 * and dev server runs on the build VPS. The exact WSL worktree (HEAD plus uncommitted and
 * untracked files, `.gitignore` respected) is snapshotted into a commit, pushed over SSH to a
 * dedicated checkout on the VPS (seeded from GitHub `main`, so only the local delta travels) and checked out there.
 *
 *   bun scripts/dev/remote-dev.ts doctor              host, tools, disk, workspace state
 *   bun scripts/dev/remote-dev.ts sync                snapshot the worktree onto the VPS checkout
 *   bun scripts/dev/remote-dev.ts install             sync + bun install --frozen-lockfile
 *   bun scripts/dev/remote-dev.ts gates [--rust]      sync + install + typecheck, lint, tests (and Rust)
 *   bun scripts/dev/remote-dev.ts dev                 sync + install + Next dev in remote tmux, forwarded to localhost
 *   bun scripts/dev/remote-dev.ts stop                stop the remote dev server and the local forward
 *   bun scripts/dev/remote-dev.ts run -- <command>    sync, then run any command in the VPS checkout
 *   bun scripts/dev/remote-dev.ts up [--rust]         gates then dev: the whole loop, end to end
 *   bun scripts/dev/remote-dev.ts clean-wsl [--apply] list (or delete) regenerable Shenron artefacts in WSL
 *   bun scripts/dev/remote-dev.ts backup [--apply]    archive the vital private state to /mnt/c/shenron/vital
 *
 * `--host <ssh alias>` (default `vps`, env SHENRON_DEV_HOST) picks the build host. See
 * docs/development/remote-dev.md.
 */
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const HOME = homedir();

export type RemoteDevConfig = {
  host: string;
  /** Checkout on the host, relative to the remote home. */
  workspace: string;
  snapshotRef: string;
  /** Remote the host fetches `main` from before each push (it has GitHub access). */
  seedRemote: string;
  devSession: string;
  remoteDevPort: number;
  localDevPort: number;
  backupDir: string;
  backupKeep: number;
};

export const DEFAULT_CONFIG: RemoteDevConfig = {
  host: process.env.SHENRON_DEV_HOST ?? "vps",
  workspace: "shenron-dev",
  snapshotRef: "refs/dev/snapshot",
  seedRemote: "git@github.com:aphrody-labs/shenron.git",
  devSession: "shenron-dev",
  remoteDevPort: 3310,
  localDevPort: Number(process.env.SHENRON_DEV_PORT ?? 3000),
  backupDir: "/mnt/c/shenron/vital",
  backupKeep: 3,
};

/** Regenerable outputs of the WSL checkout: deleting them loses nothing (install, build or graphify recreate them). */
export const REGENERABLE = [
  "node_modules",
  "target",
  "dist",
  ".cache",
  "graphify-out",
  "apps/server/.build",
  "packages/native/native",
  "crates/shenron-desktop/binaries",
  "coverage",
  ".turbo",
] as const;
/** Directory names removed wherever they appear below the checkout (outside node_modules). */
export const REGENERABLE_NAMES = new Set([
  "node_modules",
  ".next",
  ".next-dev",
  ".next-build",
  ".next-check",
  ".next-standalone",
  ".turbo",
]);

/** Kept in the main checkout: shenron-rag-sync.service (user timer) runs packages/pipeline scripts from it. */
export const KEEP_IN_MAIN: ReadonlySet<string> = new Set(["node_modules"]);

/** Vital private state: absent from Git, impossible to regenerate. Paths relative to the checkout or `~`. */
export const VITAL = {
  repo: [
    "data/home",
    "data/source-acquisition",
    "data/rag/massive-training-triplets-full.jsonl",
    "apps/bot/data",
    ".coord/claims",
  ],
  home: [".aphrody/private/shenron", ".claude/projects/-home-aphro-shenron/memory"],
  /** Large or regenerable parts left out of the archive (models are re-downloaded or retrained). */
  exclude: [
    "data/home/models",
    "*/checkpoints",
    ".aphrody/private/shenron/home",
    ".aphrody/private/shenron/qualification",
    "*.db-shm",
    "*.db-wal",
  ],
};

export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The remote shell line that runs `command` inside the checkout with the toolchains on PATH, at low priority. */
export function remoteScript(config: RemoteDevConfig, command: string): string {
  return [
    "set -euo pipefail",
    'export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"',
    "export NEXT_TELEMETRY_DISABLED=1",
    `cd "$HOME/${config.workspace}"`,
    `nice -n 10 bash -c ${shellQuote(command)}`,
  ].join("\n");
}

export const GATES = [
  "bun run typecheck",
  "bun run lint",
  "bun run format:check",
  "bun run test",
  "bun run test:scripts",
  "bun packages/api/scripts/openapi.ts --check",
];
export const RUST_GATES = ["bun run clippy:rust", "bun run test:rust"];

function sshArgs(config: RemoteDevConfig): string[] {
  return ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", config.host];
}

async function ssh(config: RemoteDevConfig, script: string): Promise<number> {
  const child = Bun.spawn([...sshArgs(config), "bash", "-s"], {
    stdin: new Blob([script]),
    stdout: "inherit",
    stderr: "inherit",
  });
  return await child.exited;
}

async function git(args: string[], env: Record<string, string> = {}): Promise<string> {
  const child = Bun.spawn(["git", ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(" ")}: ${err.trim()}`);
  return out.trim();
}

/** Commits the worktree as it is (tracked, modified and untracked non-ignored files) without touching the index. */
async function snapshot(): Promise<string> {
  const index = join(tmpdir(), `shenron-remote-dev-${process.pid}.index`);
  const env = { GIT_INDEX_FILE: index };
  try {
    await git(["read-tree", "HEAD"], env);
    await git(["add", "--", "."], env);
    const tree = await git(["write-tree"], env);
    return await git(["commit-tree", tree, "-p", "HEAD", "-m", "remote-dev snapshot"]);
  } finally {
    await rm(index, { force: true });
  }
}

async function sync(config: RemoteDevConfig): Promise<string> {
  const sha = await snapshot();
  // Seeding from GitHub keeps the SSH push down to the local delta; a failed fetch only costs a bigger push.
  const prepare = [
    "set -e",
    `mkdir -p "$HOME/${config.workspace}" && cd "$HOME/${config.workspace}"`,
    "[ -d .git ] || git init -q",
    `timeout 120 git fetch -q --no-tags ${config.seedRemote} main:refs/seed/main || true`,
  ].join("\n");
  if ((await ssh(config, prepare)) !== 0) throw new Error(`cannot prepare ~/${config.workspace}`);
  const push = Bun.spawn(
    [
      "git",
      "push",
      "--quiet",
      "--force",
      "--no-thin",
      `${config.host}:${config.workspace}`,
      `${sha}:${config.snapshotRef}`,
    ],
    { cwd: ROOT, stdout: "inherit", stderr: "inherit" },
  );
  if ((await push.exited) !== 0) throw new Error("git push of the snapshot failed");
  const checkout = [
    "set -e",
    `cd "$HOME/${config.workspace}"`,
    ...snapshotCheckoutCommands(sha).map((args) => ["git", ...args].map(shellQuote).join(" ")),
  ].join("\n");
  if ((await ssh(config, checkout)) !== 0) throw new Error("remote checkout failed");
  console.log(`remote-dev: ${config.host}:~/${config.workspace} at ${sha.slice(0, 12)}`);
  return sha;
}

/** Restore gitlink workspaces before Bun resolves their workspace dependencies. */
export function snapshotCheckoutCommands(sha: string): string[][] {
  return [
    ["-c", "advice.detachedHead=false", "checkout", "-q", "-f", "--detach", sha],
    ["submodule", "update", "--init", "--recursive"],
    // Keep ignored build caches while discarding leftovers from an older snapshot.
    ["clean", "-fdq"],
  ];
}

async function run(config: RemoteDevConfig, command: string): Promise<number> {
  console.log(`remote-dev[${config.host}]$ ${command}`);
  return await ssh(config, remoteScript(config, command));
}

async function install(config: RemoteDevConfig): Promise<void> {
  if ((await run(config, "bun install --frozen-lockfile")) !== 0)
    throw new Error("bun install failed on the host");
}

async function gates(config: RemoteDevConfig, rust: boolean): Promise<number> {
  const failed: string[] = [];
  for (const gate of rust ? [...GATES, ...RUST_GATES] : GATES) {
    if ((await run(config, gate)) !== 0) failed.push(gate);
  }
  console.log(
    failed.length ? `remote-dev: red gates: ${failed.join(" | ")}` : "remote-dev: all gates green",
  );
  return failed.length ? 1 : 0;
}

async function dev(config: RemoteDevConfig): Promise<number> {
  const site = `PORT=${config.remoteDevPort} HOSTNAME=127.0.0.1 bun --filter @aphrody/shenron-site dev`;
  const start = [
    `tmux kill-session -t ${config.devSession} 2>/dev/null || true`,
    `tmux new-session -d -s ${config.devSession} ${shellQuote(remoteScript(config, site))}`,
  ].join("\n");
  if ((await ssh(config, start)) !== 0) return 1;
  await stopForward(config);
  const forward = Bun.spawn(
    [
      ...sshArgs(config).slice(0, -1),
      "-f",
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-L",
      `127.0.0.1:${config.localDevPort}:127.0.0.1:${config.remoteDevPort}`,
      config.host,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await forward.exited) !== 0) return 1;
  console.log(
    `remote-dev: site on http://localhost:${config.localDevPort} (logs: ssh ${config.host} -t tmux attach -t ${config.devSession})`,
  );
  return 0;
}

async function stopForward(config: RemoteDevConfig): Promise<void> {
  const pattern = `127.0.0.1:${config.localDevPort}:127.0.0.1:${config.remoteDevPort}`;
  await Bun.spawn(["pkill", "-f", pattern], { stdout: "ignore", stderr: "ignore" }).exited;
}

async function stop(config: RemoteDevConfig): Promise<number> {
  await stopForward(config);
  return await ssh(config, `tmux kill-session -t ${config.devSession} 2>/dev/null || true`);
}

async function doctor(config: RemoteDevConfig): Promise<number> {
  return await ssh(
    config,
    [
      'export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"',
      'echo "host: $(hostname) cores=$(nproc) load=$(cut -d" " -f1-3 /proc/loadavg)"',
      'echo "bun: $(bun --version 2>/dev/null || echo absent)  cargo: $(cargo --version 2>/dev/null || echo absent)"',
      'df -h "$HOME" | tail -1',
      `cd "$HOME/${config.workspace}" 2>/dev/null && echo "workspace: $(git rev-parse --short HEAD 2>/dev/null || echo empty)" || echo "workspace: absent (run sync)"`,
      `tmux has-session -t ${config.devSession} 2>/dev/null && echo "dev server: running" || echo "dev server: stopped"`,
    ].join("\n"),
  );
}

/** Apparent size in bytes; unreadable subtrees (rootless container storage) count as what du can see. */
function sizeOf(path: string): number {
  const du = Bun.spawnSync(["du", "-sb", path], { stderr: "ignore" });
  return Number(new TextDecoder().decode(du.stdout).split("\t")[0]) || 0;
}

/** Deletes a tree; rootless Podman storage holds subuid-owned files that only `podman unshare` can remove. */
async function remove(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    const code = await Bun.spawn(["podman", "unshare", "rm", "-rf", path], { stderr: "inherit" })
      .exited;
    if (code !== 0) throw new Error(`cannot delete ${path}`);
  }
}

/**
 * Regenerable paths present in a checkout: fixed roots plus nested build directories. `keep` names
 * directories left in place (the main checkout keeps node_modules: the WSL RAG sync timer runs from it).
 */
export function regenerablePaths(root: string, keep: ReadonlySet<string> = new Set()): string[] {
  const found = new Set<string>();
  for (const rel of REGENERABLE)
    if (!keep.has(rel) && existsSync(join(root, rel))) found.add(join(root, rel));
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === ".git" || entry.name === "vendor") continue;
      const path = join(dir, entry.name);
      if (found.has(path) || keep.has(entry.name)) continue;
      if (REGENERABLE_NAMES.has(entry.name)) found.add(path);
      else walk(path, depth + 1);
    }
  };
  walk(root, 0);
  return [...found].toSorted();
}

/** Every Shenron checkout of this machine: the main tree and its linked worktrees. */
async function checkouts(): Promise<string[]> {
  const list = await git(["worktree", "list", "--porcelain"]);
  return list
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter((path) => existsSync(path));
}

async function cleanWsl(apply: boolean): Promise<number> {
  let total = 0;
  for (const checkout of await checkouts()) {
    const keep = checkout === ROOT ? KEEP_IN_MAIN : new Set<string>();
    for (const path of regenerablePaths(checkout, keep)) {
      const size = sizeOf(path);
      total += size;
      console.log(`${(size / 2 ** 20).toFixed(0).padStart(7)} MiB  ${path}`);
      if (apply) await remove(path);
    }
  }
  await git(["worktree", "prune"]);
  console.log(
    `remote-dev: ${(total / 2 ** 30).toFixed(2)} GiB ${apply ? "freed" : "regenerable (pass --apply to delete)"}`,
  );
  return 0;
}

/** tar arguments archiving the vital set, relative to `/` so the archive restores in place. */
export function vitalTarArgs(root: string, home: string): string[] {
  const absolute = [
    ...VITAL.repo.map((p) => join(root, p)),
    ...VITAL.home.map((p) => join(home, p)),
  ].filter((p) => existsSync(p));
  const excludes = VITAL.exclude.flatMap((pattern) => {
    if (pattern.startsWith("*")) return [`--exclude=${pattern}`];
    const base = pattern.startsWith(".") ? home : root;
    return [`--exclude=${relative("/", join(base, pattern))}`];
  });
  return [...excludes, "-C", "/", ...absolute.map((p) => relative("/", p))];
}

async function backup(config: RemoteDevConfig, apply: boolean): Promise<number> {
  const args = vitalTarArgs(ROOT, HOME);
  const list = Bun.spawnSync(["tar", "-cf", "/dev/null", "-v", ...args], { stderr: "pipe" });
  const files = new TextDecoder().decode(list.stdout).split("\n").filter(Boolean);
  console.log(`remote-dev: ${files.length} vital entries -> ${config.backupDir}`);
  if (!apply) {
    for (const file of files.filter((f) => !f.endsWith("/")).slice(0, 40))
      console.log(`  /${file}`);
    console.log("remote-dev: dry run (pass --apply to write the archive)");
    return 0;
  }
  await mkdir(config.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const target = join(config.backupDir, `shenron-vital-${stamp}.tar.zst`);
  const partial = join(tmpdir(), `shenron-vital-${stamp}.tar.zst`);
  const tar = Bun.spawn(
    ["bash", "-c", 'tar -cf - "$@" | zstd -q -19 -T0 -o "$0"', partial, ...args],
    {
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if ((await tar.exited) !== 0) throw new Error("vital archive failed");
  const size = Bun.file(partial).size;
  const free = Bun.spawnSync(["df", "--output=avail", "-B1", config.backupDir]);
  const avail = Number(new TextDecoder().decode(free.stdout).split("\n")[1]);
  if (size > avail - 64 * 2 ** 20) {
    await rm(partial, { force: true });
    throw new Error(`not enough space on ${config.backupDir}: archive ${size} B, free ${avail} B`);
  }
  await Bun.write(target, Bun.file(partial));
  await rm(partial, { force: true });
  const archives = readdirSync(config.backupDir)
    .filter((name) => /^shenron-vital-.*\.tar\.zst$/.test(name))
    .toSorted();
  for (const old of archives.slice(0, Math.max(0, archives.length - config.backupKeep)))
    await rm(join(config.backupDir, old), { force: true });
  console.log(
    `remote-dev: ${target} (${(size / 2 ** 20).toFixed(1)} MiB, restore: tar --zstd -xf <archive> -C /)`,
  );
  return 0;
}

const USAGE =
  "usage: remote-dev <doctor|sync|install|gates [--rust]|dev|stop|run -- <cmd>|up [--rust]|clean-wsl [--apply]|backup [--apply]> [--host <alias>]";

async function main(argv: string[]): Promise<number> {
  const dash = argv.indexOf("--");
  const options = dash >= 0 ? argv.slice(0, dash) : argv;
  const hostAt = options.indexOf("--host");
  const config = { ...DEFAULT_CONFIG, ...(hostAt >= 0 ? { host: options[hostAt + 1] ?? "" } : {}) };
  const flag = (name: string) => options.includes(name);
  switch (options[0]) {
    case "doctor":
      return await doctor(config);
    case "sync":
      await sync(config);
      return 0;
    case "install":
      await sync(config);
      await install(config);
      return 0;
    case "gates":
      await sync(config);
      await install(config);
      return await gates(config, flag("--rust"));
    case "dev":
      await sync(config);
      await install(config);
      return await dev(config);
    case "stop":
      return await stop(config);
    case "run": {
      if (dash < 0 || dash === argv.length - 1) break;
      await sync(config);
      return await run(config, argv.slice(dash + 1).join(" "));
    }
    case "up": {
      await sync(config);
      await install(config);
      const code = await gates(config, flag("--rust"));
      return code !== 0 ? code : await dev(config);
    }
    case "clean-wsl":
      return await cleanWsl(flag("--apply"));
    case "backup":
      return await backup(config, flag("--apply"));
  }
  console.error(USAGE);
  return 2;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
