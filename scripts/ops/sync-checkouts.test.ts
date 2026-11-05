// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireLock,
  plan,
  runSync,
  type CheckoutSpec,
  type Manifest,
  type RepoState,
} from "./sync-checkouts";

const root = mkdtempSync(join(tmpdir(), "sync-checkouts-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function sh(cwd: string, ...args: string[]) {
  const proc = Bun.spawnSync(
    ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
    { cwd },
  );
  if (proc.exitCode !== 0) throw Error(proc.stderr.toString());
  return proc.stdout.toString().trim();
}

function fixture(name: string) {
  const origin = join(root, `${name}-origin.git`);
  const seed = join(root, `${name}-seed`);
  const work = join(root, `${name}-work`);
  mkdirSync(origin);
  sh(origin, "init", "--bare", "-b", "main");
  mkdirSync(seed);
  sh(seed, "init", "-b", "main");
  writeFileSync(join(seed, "a.txt"), "1\n");
  sh(seed, "add", ".");
  sh(seed, "commit", "-m", "one");
  sh(seed, "remote", "add", "origin", origin);
  sh(seed, "push", "origin", "main");
  sh(root, "clone", origin, work);
  const push = (file: string, text: string) => {
    writeFileSync(join(seed, file), text);
    sh(seed, "add", ".");
    sh(seed, "commit", "-m", `edit ${file}`);
    sh(seed, "push", "origin", "main");
  };
  const spec: CheckoutSpec = {
    name,
    repo: origin,
    branch: "main",
    submodules: false,
    mode: "ff-only",
    enabled: true,
    paths: { test: work },
  };
  const manifest: Manifest = { version: 1, checkouts: [spec] };
  return { work, seed, push, manifest, spec };
}

const collect = () => {
  const records: Record<string, unknown>[] = [];
  return { records, emit: (r: Record<string, unknown>) => void records.push(r) };
};

const base: RepoState = {
  exists: true,
  detached: false,
  branch: "main",
  dirty: false,
  ahead: 0,
  behind: 0,
  hasUpstream: true,
};

describe("plan", () => {
  test("decisions", () => {
    expect(plan({ ...base, exists: false }, "main")).toBe("missing");
    expect(plan({ ...base, detached: true }, "main")).toBe("detached");
    expect(plan({ ...base, branch: "x" }, "main")).toBe("wrong-branch");
    expect(plan({ ...base, hasUpstream: false }, "main")).toBe("no-upstream");
    expect(plan({ ...base, ahead: 1, behind: 1 }, "main")).toBe("diverged");
    expect(plan({ ...base, ahead: 1 }, "main")).toBe("ahead");
    expect(plan({ ...base, behind: 2, dirty: true }, "main")).toBe("dirty");
    expect(plan({ ...base, behind: 2 }, "main")).toBe("fast-forward");
    expect(plan(base, "main")).toBe("up-to-date");
  });
});

describe("runSync", () => {
  test("fast-forwards and is idempotent", async () => {
    const f = fixture("ff");
    f.push("b.txt", "2\n");
    const first = collect();
    expect(await runSync(f.manifest, "test", first.emit)).toBe(0);
    expect(first.records[0]?.decision).toBe("fast-forward");
    expect(sh(f.work, "rev-parse", "HEAD")).toBe(sh(f.seed, "rev-parse", "HEAD"));
    const second = collect();
    expect(await runSync(f.manifest, "test", second.emit)).toBe(0);
    expect(second.records[0]?.decision).toBe("up-to-date");
  });

  test("skips dirty tracked changes and keeps them", async () => {
    const f = fixture("dirty");
    f.push("b.txt", "2\n");
    writeFileSync(join(f.work, "a.txt"), "local edit\n");
    const out = collect();
    expect(await runSync(f.manifest, "test", out.emit)).toBe(0);
    expect(out.records[0]?.decision).toBe("dirty");
    expect(Bun.file(join(f.work, "a.txt")).text()).resolves.toBe("local edit\n");
  });

  test("diverged is an error and nothing is discarded", async () => {
    const f = fixture("div");
    writeFileSync(join(f.work, "local.txt"), "x\n");
    sh(f.work, "add", ".");
    sh(f.work, "commit", "-m", "local");
    const localHead = sh(f.work, "rev-parse", "HEAD");
    f.push("b.txt", "2\n");
    const out = collect();
    expect(await runSync(f.manifest, "test", out.emit)).toBe(1);
    expect(out.records[0]?.decision).toBe("diverged");
    expect(sh(f.work, "rev-parse", "HEAD")).toBe(localHead);
  });

  test("detached and excluded and disabled are skipped", async () => {
    const f = fixture("skip");
    sh(f.work, "checkout", "--detach");
    const a = collect();
    expect(await runSync(f.manifest, "test", a.emit)).toBe(0);
    expect(a.records[0]?.decision).toBe("detached");
    const b = collect();
    await runSync(
      { ...f.manifest, excluded: [{ host: "test", path: f.work, reason: "other session" }] },
      "test",
      b.emit,
    );
    expect(b.records[0]?.decision).toBe("excluded");
    const c = collect();
    await runSync({ ...f.manifest, checkouts: [{ ...f.spec, enabled: false }] }, "test", c.emit);
    expect(c.records[0]?.decision).toBe("disabled");
  });

  test("missing checkout is a warning, other hosts ignored", async () => {
    const f = fixture("miss");
    const out = collect();
    const manifest = {
      ...f.manifest,
      checkouts: [{ ...f.spec, paths: { test: join(root, "nope"), other: f.work } }],
    };
    expect(await runSync(manifest, "test", out.emit)).toBe(0);
    expect(out.records).toHaveLength(1);
    expect(out.records[0]?.decision).toBe("missing");
  });
});

describe("lock", () => {
  test("second acquire fails until released; stale pid is reclaimed", () => {
    const dir = join(root, "lock");
    const release = acquireLock(dir);
    expect(release).not.toBeNull();
    expect(acquireLock(dir)).toBeNull();
    release?.();
    const again = acquireLock(dir);
    expect(again).not.toBeNull();
    again?.();
    mkdirSync(dir);
    writeFileSync(join(dir, "pid"), "999999999");
    const reclaimed = acquireLock(dir);
    expect(reclaimed).not.toBeNull();
    reclaimed?.();
  });
});
