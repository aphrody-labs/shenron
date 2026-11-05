// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

test("a remote snapshot drops the checkout of a removed submodule", () => {
  const source = tree(["film", "project"]);
  const film = join(source, "film");
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
  git(film, ["init", "-q"]);
  writeFileSync(join(film, "Cargo.toml"), "[workspace]");
  git(film, ["add", "Cargo.toml"]);
  git(film, ["commit", "-qm", "film fixture"]);
  git(project, ["init", "-q"]);
  git(project, ["submodule", "add", film, "crates/film"]);
  git(project, ["commit", "-qam", "older snapshot"]);
  git(source, ["clone", "-q", "--recurse-submodules", project, checkout]);
  expect(existsSync(join(checkout, "crates/film/Cargo.toml"))).toBe(true);
  git(project, ["rm", "-q", "crates/film"]);
  git(project, ["commit", "-qam", "newer snapshot"]);
  const sha = git(project, ["rev-parse", "HEAD"]);
  git(checkout, ["fetch", "-q", "origin"]);
  for (const args of snapshotCheckoutCommands(sha)) git(checkout, args);
  // A stale manifest here would join the `crates/*` Cargo workspace glob.
  expect(existsSync(join(checkout, "crates/film"))).toBe(false);
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
