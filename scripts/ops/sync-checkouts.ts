#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Keep git checkouts on a host at origin/<branch> without ever discarding work.
 *
 *   bun scripts/ops/sync-checkouts.ts [--host vps] [--manifest deploy/checkouts.json]
 *                                     [--only name] [--dry-run] [--no-lock]
 *
 * Per checkout: fetch --prune, fast-forward merge only, then submodule sync and
 * update when the manifest asks for it. Dirty, detached, wrong-branch and
 * ahead checkouts are skipped and logged; diverged ones are logged as errors and
 * make the run exit 1. Output is one JSON object per line. Idempotent; a lock
 * directory prevents concurrent runs.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type SubmodulePolicy = false | true | "initialized";

export interface CheckoutSpec {
  name: string;
  repo: string;
  branch: string;
  submodules: SubmodulePolicy;
  mode: "ff-only";
  enabled: boolean;
  paths: Record<string, string>;
}

export interface Manifest {
  version: 1;
  checkouts: CheckoutSpec[];
  excluded?: { host: string; path: string; reason: string }[];
}

export interface RepoState {
  exists: boolean;
  detached: boolean;
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

export type Decision =
  | "missing"
  | "detached"
  | "wrong-branch"
  | "dirty"
  | "no-upstream"
  | "diverged"
  | "ahead"
  | "up-to-date"
  | "fast-forward";

/** Pure planner: what to do with a checkout given its state after fetch. */
export function plan(state: RepoState, wantBranch: string): Decision {
  if (!state.exists) return "missing";
  if (state.detached) return "detached";
  if (state.branch !== wantBranch) return "wrong-branch";
  if (!state.hasUpstream) return "no-upstream";
  if (state.ahead > 0 && state.behind > 0) return "diverged";
  if (state.ahead > 0) return "ahead";
  if (state.dirty) return "dirty";
  if (state.behind > 0) return "fast-forward";
  return "up-to-date";
}

export type Emit = (record: Record<string, unknown>) => void;

async function git(cwd: string, args: string[], timeoutMs = 300_000) {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { code, out: out.trim(), err: err.trim() };
}

export async function readState(path: string, branch: string): Promise<RepoState> {
  const empty = { exists: false, detached: false, branch: "", dirty: false, ahead: 0, behind: 0, hasUpstream: false };
  if (!existsSync(join(path, ".git"))) return empty;
  const sym = await git(path, ["symbolic-ref", "-q", "--short", "HEAD"]);
  const detached = sym.code !== 0;
  const current = detached ? "" : sym.out;
  const status = await git(path, ["status", "--porcelain", "--untracked-files=no"]);
  const remoteRef = `refs/remotes/origin/${branch}`;
  const has = (await git(path, ["rev-parse", "--verify", "-q", remoteRef])).code === 0;
  let ahead = 0;
  let behind = 0;
  if (has) {
    const counts = await git(path, ["rev-list", "--left-right", "--count", `${remoteRef}...HEAD`]);
    const [b = "0", a = "0"] = counts.out.split(/\s+/);
    behind = Number(b);
    ahead = Number(a);
  }
  return { exists: true, detached, branch: current, dirty: status.out.length > 0, ahead, behind, hasUpstream: has };
}

export function expandPath(path: string): string {
  return resolve(path.startsWith("~") ? join(homedir(), path.slice(1)) : path);
}

async function syncSubmodules(path: string, policy: SubmodulePolicy, emit: Emit, name: string, changed: boolean) {
  if (policy === false || !existsSync(join(path, ".gitmodules"))) return;
  if (!changed) {
    // Nothing moved: only touch submodules when one is out of sync with its pin.
    const status = await git(path, ["submodule", "status"]);
    const drift = status.out.split("\n").some((l) => l.startsWith("+") || l.startsWith("U") || (policy === true && l.startsWith("-")));
    if (!drift) {
      emit({ level: "info", name, step: "submodule-update", result: "in-sync" });
      return;
    }
  }
  const sync = await git(path, ["submodule", "sync", "--recursive"]);
  if (sync.code !== 0) emit({ level: "error", name, step: "submodule-sync", error: sync.err });
  let args = ["submodule", "update", "--recursive"];
  if (policy === true) args = ["submodule", "update", "--init", "--recursive"];

  const update = await git(path, args, 900_000);
  emit({
    level: update.code === 0 ? "info" : "error",
    name,
    step: "submodule-update",
    result: update.code === 0 ? "ok" : "failed",
    error: update.code === 0 ? undefined : update.err.slice(0, 400),
  });
}

/** Sync one checkout. Returns true when the checkout is healthy (not diverged or errored). */
export async function syncCheckout(
  spec: CheckoutSpec,
  path: string,
  emit: Emit,
  dryRun = false,
): Promise<boolean> {
  const base = { name: spec.name, path, branch: spec.branch };
  let state = await readState(path, spec.branch);
  if (!state.exists) {
    emit({ ...base, level: "warn", decision: "missing" });
    return true;
  }
  if (!dryRun) {
    const fetch = await git(path, ["fetch", "--prune", "--quiet", "origin"]);
    if (fetch.code !== 0) {
      emit({ ...base, level: "error", decision: "fetch-failed", error: fetch.err.slice(0, 400) });
      return false;
    }
    state = await readState(path, spec.branch);
  }
  const decision = plan(state, spec.branch);
  const before = (await git(path, ["rev-parse", "--short", "HEAD"])).out;
  const detail = { ...base, decision, head: before, ahead: state.ahead, behind: state.behind, dirty: state.dirty };
  switch (decision) {
    case "diverged":
      emit({ ...detail, level: "error" });
      return false;
    case "fast-forward": {
      if (dryRun) {
        emit({ ...detail, level: "info", dryRun: true });
        return true;
      }
      const merge = await git(path, ["merge", "--ff-only", "--quiet", `origin/${spec.branch}`]);
      if (merge.code !== 0) {
        emit({ ...detail, level: "error", decision: "merge-refused", error: merge.err.slice(0, 400) });
        return false;
      }
      const after = (await git(path, ["rev-parse", "--short", "HEAD"])).out;
      emit({ ...detail, level: "info", head: after, from: before });
      await syncSubmodules(path, spec.submodules, emit, spec.name, true);
      return true;
    }
    case "up-to-date":
      emit({ ...detail, level: "info" });
      if (!dryRun) await syncSubmodules(path, spec.submodules, emit, spec.name, false);
      return true;
    default:
      emit({ ...detail, level: "warn" });
      return true;
  }
}

/** Directory lock with stale-pid detection. Returns a release function or null when held. */
export function acquireLock(dir: string): (() => void) | null {
  const pidFile = join(dir, "pid");
  try {
    mkdirSync(dir);
  } catch {
    try {
      const pid = Number(readFileSync(pidFile, "utf8"));
      if (pid > 0) {
        process.kill(pid, 0);
        return null;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return null;
    }
    rmSync(dir, { recursive: true, force: true });
    try {
      mkdirSync(dir);
    } catch {
      return null;
    }
  }
  writeFileSync(pidFile, String(process.pid));
  return () => rmSync(dir, { recursive: true, force: true });
}

export async function runSync(
  manifest: Manifest,
  host: string,
  emit: Emit,
  opts: { only?: string; dryRun?: boolean } = {},
): Promise<number> {
  let failed = 0;
  for (const spec of manifest.checkouts) {
    if (opts.only && spec.name !== opts.only) continue;
    const raw = spec.paths[host];
    if (!raw) continue;
    const path = expandPath(raw);
    const excluded = manifest.excluded?.find((entry) => entry.host === host && expandPath(entry.path) === path);
    if (excluded) {
      emit({ level: "info", name: spec.name, path, decision: "excluded", reason: excluded.reason });
      continue;
    }
    if (!spec.enabled) {
      emit({ level: "info", name: spec.name, path, decision: "disabled" });
      continue;
    }
    if (!(await syncCheckout(spec, path, emit, opts.dryRun))) failed++;
  }
  return failed;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.main) {
  const host = arg("host") ?? process.env.SYNC_HOST ?? hostname();
  const manifestPath = resolve(arg("manifest") ?? join(import.meta.dir, "../../deploy/checkouts.json"));
  const emit: Emit = (record) => writeSync(1, `${JSON.stringify({ ts: new Date().toISOString(), host, ...record })}
`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const release = process.argv.includes("--no-lock")
    ? () => {}
    : acquireLock(join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), `sync-checkouts-${host}.lock`));
  if (!release) {
    emit({ level: "info", decision: "locked" });
    process.exit(0);
  }
  try {
    const failed = await runSync(manifest, host, emit, {
      only: arg("only"),
      dryRun: process.argv.includes("--dry-run"),
    });
    emit({ level: failed ? "error" : "info", summary: true, failed });
    process.exitCode = failed ? 1 : 0;
  } finally {
    release();
  }
}
