// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { runWorkspaceGate, splitGateScript, workspaceCommands } from "./workspace-gates";

test("preserves isolated suites, quoted glob arguments and UI gate stages", () => {
  expect(splitGateScript("bun -e 'console.log(\"hello world\")'")).toEqual([
    ["bun", "-e", 'console.log("hello world")'],
  ]);
  expect(
    splitGateScript("bun test --isolate --path-ignore-patterns='**/*.live.test.ts' tests/"),
  ).toEqual([["bun", "test", "--isolate", "--path-ignore-patterns=**/*.live.test.ts", "tests/"]]);
  expect(
    splitGateScript(
      "bun test && bun test/koharu/run.ts && bun test --preload @aphrody/bun-test-dom ./test/dom",
    ),
  ).toHaveLength(3);
});

test("discovers every current package gate and retains the scripts typecheck", () => {
  const root = resolve(import.meta.dir, "../..");
  const commands = workspaceCommands(root, "typecheck");
  expect(
    new Set(
      commands
        .filter((command) => command.packageName !== "scripts")
        .map((command) => command.packageName),
    ).size,
  ).toBe(15);
  expect(commands.at(-1)?.args).toEqual(["tsc", "--noEmit", "-p", "scripts"]);
  expect(
    workspaceCommands(root, "test").filter((command) => command.packageName === "@shenron/ui"),
  ).toHaveLength(3);
});

test("rejects shell syntax rather than silently ignoring a gate", () => {
  expect(() => splitGateScript("bun test; echo success")).toThrow();
  expect(() => splitGateScript("unknown test")).toThrow();
});

test("propagates a failed package and still checks the remaining packages", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "shenron-workspace-gates-"));
  try {
    writeFileSync(
      resolve(root, "package.json"),
      JSON.stringify({ workspaces: { packages: ["packages/*"] } }),
    );
    for (const [name, script] of [
      ["a", "bun -e 'process.exit(7)'"],
      ["b", "bun -e 'console.log(42)'"],
    ] as const) {
      const cwd = resolve(root, "packages", name);
      mkdirSync(cwd, { recursive: true });
      writeFileSync(
        resolve(cwd, "package.json"),
        JSON.stringify({ name, scripts: { test: script } }),
      );
    }
    expect(await runWorkspaceGate(root, "test")).toBe(7);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
