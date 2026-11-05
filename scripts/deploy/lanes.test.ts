// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  classificationProblems,
  type Environment,
  globToRegExp,
  laneKeys,
  plan,
  planToShell,
  ROOT,
  bare,
} from "./lanes.ts";

const environment: Environment = {
  toolchain: { rust: "1.0.0", bun: "1.0.0" },
  lanes: {
    rust: { toolchain: "rust", inputs: ["Cargo.toml", "crates", "crates/inner"], outputs: [], services: ["site", "bot"] },
    site: { toolchain: "bun", workspace: "apps/site", inputs: ["package.json"], outputs: [], services: ["site"] },
    bot: { toolchain: "bun", workspace: "apps/bot", inputs: ["package.json"], outputs: [], services: ["bot"] },
    image: { toolchain: "none", after: ["rust", "site", "bot"], inputs: ["Dockerfile"], outputs: [], services: ["site", "bot"] },
  },
  classification: {
    noDeploy: ["docs", "README.md"],
    ignoreInKeys: ["**/test/**", "**/*.test.ts"],
    holds: { migrations: ["apps/site/migrations"] },
    infraNotices: ["deploy/prod"],
  },
};

// Each test commits to a scratch repository; git is slow to spawn on Windows.
setDefaultTimeout(60_000);

let repo = "";
const git = (...args: string[]) => {
  const run = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  return run.stdout.toString().trim();
};
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const commit = (message: string) => {
  git("add", "-A");
  // A scratch repository: no user hook or signing applies to it.
  git("-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=.no-hooks", "-c", "commit.gpgsign=false", "commit", "-qm", message);
  return git("rev-parse", "HEAD");
};

let base = "";
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "lanes-"));
  git("init", "-q");
  write("package.json", "{}");
  write("Cargo.toml", "[workspace]");
  write("crates/a/lib.rs", "a");
  write("crates/inner/lib.rs", "i");
  write("Dockerfile", "FROM x");
  write("README.md", "r");
  write("apps/site/package.json", JSON.stringify({ name: "site", dependencies: { ui: "workspace:*" } }));
  write("apps/site/page.ts", "1");
  write("apps/bot/package.json", JSON.stringify({ name: "bot" }));
  write("apps/bot/main.ts", "1");
  write("packages/ui/package.json", JSON.stringify({ name: "ui" }));
  write("packages/ui/index.ts", "1");
  write("packages/lonely/package.json", JSON.stringify({ name: "lonely" }));
  base = commit("base");
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("globToRegExp", () => {
  test("matches tests at any depth only", () => {
    expect(globToRegExp("**/test/**").test("apps/bot/test/a.ts")).toBe(true);
    expect(globToRegExp("**/*.test.ts").test("a.test.ts")).toBe(true);
    expect(globToRegExp("**/*.test.ts").test("apps/x/a.test.ts")).toBe(true);
    expect(globToRegExp("**/*.test.ts").test("apps/x/a.ts")).toBe(false);
    expect(globToRegExp("**/test/**").test("apps/latest/a.ts")).toBe(false);
  });
});

describe("plan", () => {
  test("a crate change rebuilds Rust even when a nested crate is also an input", () => {
    write("crates/a/lib.rs", "a2");
    const head = commit("crate");
    const result = plan(repo, `${head}^`, head, {}, environment);
    expect(result.rebuild).toEqual(["rust", "image"]);
    expect(result.services).toEqual(["bot", "site"]);
  });

  test("a docs or test-only change deploys nothing", () => {
    write("README.md", "r2");
    write("apps/site/test/page.test.ts", "t");
    write("apps/bot/main.test.ts", "t");
    const head = commit("docs");
    const result = plan(repo, `${head}^`, head, {}, environment);
    expect(result.deploy).toBe(false);
    expect(result.services).toEqual([]);
  });

  test("a workspace dependency reaches only its dependents", () => {
    write("packages/ui/index.ts", "2");
    const head = commit("ui");
    expect(plan(repo, `${head}^`, head, {}, environment).services).toEqual(["site"]);
    write("packages/lonely/index.ts", "2");
    const lonely = commit("lonely");
    expect(plan(repo, `${lonely}^`, lonely, {}, environment).deploy).toBe(false);
  });

  test("the image alone changing restarts every service it carries", () => {
    write("Dockerfile", "FROM y");
    const head = commit("image");
    const result = plan(repo, `${head}^`, head, {}, environment);
    expect(result.rebuild).toEqual(["image"]);
    expect(result.services).toEqual(["site", "bot"]);
  });

  test("migrations hold the release and infra paths are reported", () => {
    write("apps/site/migrations/0001.sql", "select 1");
    write("deploy/prod/compose.yaml", "x");
    const head = commit("migration");
    const result = plan(repo, `${head}^`, head, {}, environment);
    expect(result.holds.migrations).toEqual(["apps/site/migrations/0001.sql"]);
    expect(result.infraNotices).toEqual(["deploy/prod/compose.yaml"]);
    expect(planToShell(result)).toContain("PLAN_HOLDS='migrations'");
  });

  test("keys are content addressed: a revert restores the old keys", () => {
    const before = laneKeys(repo, "HEAD", {}, environment);
    write("apps/bot/main.ts", "changed");
    commit("bot");
    expect(laneKeys(repo, "HEAD", {}, environment).bot).not.toBe(before.bot);
    write("apps/bot/main.ts", "1");
    commit("revert");
    expect(laneKeys(repo, "HEAD", {}, environment)).toEqual(before);
  });

  test("extras change only the lanes that declare them", () => {
    const withExtras: Environment = {
      ...environment,
      lanes: { ...environment.lanes, site: { ...environment.lanes.site!, extras: ["vfs"] } },
    };
    const a = laneKeys(repo, base, { vfs: "a" }, withExtras);
    const b = laneKeys(repo, base, { vfs: "b" }, withExtras);
    expect(a.site).not.toBe(b.site);
    expect(a.bot).toBe(b.bot);
    expect(a.image).not.toBe(b.image);
  });

  test("shell output quotes values", () => {
    const result = plan(repo, base, "HEAD", {}, environment);
    expect(planToShell(result)).toMatch(/^PLAN_REBUILD='[a-z ]*'$/m);
  });
});

describe("repository", () => {
  test("an input ending in ? is optional", () => {
    expect(bare("vendor?")).toBe("vendor");
    expect(bare("crates")).toBe("crates");
  });

  test("every tracked top-level path of this repository is classified", () => {
    expect(classificationProblems(ROOT, "HEAD")).toEqual([]);
  });
});
