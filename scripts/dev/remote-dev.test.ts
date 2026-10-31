// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import {
  DEFAULT_CONFIG,
  KEEP_IN_MAIN,
  regenerablePaths,
  remoteScript,
  shellQuote,
  snapshotCheckoutCommands,
  vitalTarArgs,
} from "./remote-dev.ts";

/** Path relative to the filesystem root, as tar -C / expects (drive-less on Windows). */
const fromRoot = (path: string) => relative("/", path);

function tree(paths: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "remote-dev-"));
  for (const path of paths) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "f"), "x");
  }
  return root;
}

describe("regenerablePaths", () => {
  test("finds fixed roots and nested build directories, never descending into them", () => {
    const root = tree([
      "target/debug",
      "node_modules/a/node_modules/b",
      "apps/site/.next-dev/cache",
      "apps/site/src",
      "packages/ui/node_modules/x",
      "data/home/memory",
    ]);
    expect(
      regenerablePaths(root).map((p) => p.slice(root.length + 1).replaceAll(sep, "/")),
    ).toEqual(["apps/site/.next-dev", "node_modules", "packages/ui/node_modules", "target"]);
  });

  test("keeps the main checkout's node_modules", () => {
    const root = tree(["node_modules/a", "apps/bot/node_modules/b", "dist/x"]);
    expect(
      regenerablePaths(root, KEEP_IN_MAIN).map((p) =>
        p.slice(root.length + 1).replaceAll(sep, "/"),
      ),
    ).toEqual(["dist"]);
  });
});

test("a fresh remote snapshot restores its config workspace from the gitlink", () => {
  const source = tree(["config", "project"]);
  const config = join(source, "config");
  const project = join(source, "project");
  const checkout = join(source, "checkout");
  const git = (cwd: string, args: string[]) => {
    const child = Bun.spawnSync(
      [
        "git",
        "-c",
        "protocol.file.allow=always",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        ...args,
      ],
      { cwd, stdout: "pipe", stderr: "pipe" },
    );
    if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr));
    return new TextDecoder().decode(child.stdout).trim();
  };
  git(config, ["init", "-q"]);
  writeFileSync(join(config, "package.json"), JSON.stringify({ name: "@fixture/config" }));
  git(config, ["add", "package.json"]);
  git(config, ["commit", "-qm", "config fixture"]);
  git(project, ["init", "-q"]);
  git(project, ["submodule", "add", config, "packages/config"]);
  git(project, ["commit", "-qam", "project fixture"]);
  const sha = git(project, ["rev-parse", "HEAD"]);
  git(source, ["clone", "-q", project, checkout]);
  expect(Bun.file(join(checkout, "packages/config/package.json")).size).toBe(0);
  for (const args of snapshotCheckoutCommands(sha)) git(checkout, args);
  expect(Bun.file(join(checkout, "packages/config/package.json")).size).toBeGreaterThan(0);
  expect(git(join(checkout, "packages/config"), ["rev-parse", "HEAD"])).toBe(
    git(config, ["rev-parse", "HEAD"]),
  );
  // About a dozen Git processes: 3 s on a quiet Windows machine, so the 5 s default is too tight.
}, 60_000);

describe("vitalTarArgs", () => {
  test("archives existing vital paths relative to / and excludes models", () => {
    const root = tree(["data/home/memory", "data/home/models/embed", "apps/bot/data"]);
    const home = tree([".aphrody/private/shenron/home"]);
    const args = vitalTarArgs(root, home);
    const members = args.slice(args.indexOf("-C") + 2);
    expect(members).toContain(fromRoot(join(root, "data/home")));
    expect(members).toContain(fromRoot(join(root, "apps/bot/data")));
    expect(members).toContain(fromRoot(join(home, ".aphrody/private/shenron")));
    expect(members.some((m) => m.includes("source-acquisition"))).toBe(false);
    expect(args).toContain(`--exclude=${fromRoot(join(root, "data/home/models"))}`);
    expect(args).toContain(`--exclude=${fromRoot(join(home, ".aphrody/private/shenron/home"))}`);
  });
});

describe("remoteScript", () => {
  test("runs inside the checkout with the toolchains and plain Cargo", () => {
    const script = remoteScript(DEFAULT_CONFIG, "bun run lint && echo 'ok'");
    expect(script).toContain(`cd "$HOME/${DEFAULT_CONFIG.workspace}"`);
    expect(script).not.toContain("APHRODY_CARGO_SERIAL");
    expect(script).toContain(`nice -n 10 bash -c 'bun run lint && echo '\\''ok'\\'''`);
  });

  test("shellQuote leaves safe words bare", () => {
    expect(shellQuote("a/b-c.d")).toBe("a/b-c.d");
    expect(shellQuote("a b")).toBe("'a b'");
  });
});
