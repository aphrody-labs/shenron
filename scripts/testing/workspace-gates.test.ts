// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
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

test("discovers every current package gate and retains the scripts typecheck", async () => {
  const root = resolve(import.meta.dir, "../..");
  const commands = workspaceCommands(root, "typecheck");
  expect(
    new Set(
      commands
        .filter((command) => command.packageName !== "scripts")
        .map((command) => command.packageName),
    ).size,
  ).toBe(16);
  expect(commands.at(-1)?.args).toEqual(["bun", "check", "-p", "scripts"]);
  const solution = await Bun.file(resolve(root, "tsconfig.json")).json();
  const referenced = new Set(
    solution.references.map((reference: { path: string }) => resolve(root, reference.path)),
  );
  for (const command of commands) {
    expect(command.args.slice(0, 2)).toEqual(["bun", "check"]);
    const projectFlag = command.args.findIndex((arg) => arg === "-p" || arg === "--project");
    const project = resolve(
      command.cwd,
      projectFlag < 0 ? "tsconfig.json" : command.args[projectFlag + 1]!,
    );
    const configPath = project.endsWith(".json") ? project : resolve(project, "tsconfig.json");
    expect(referenced.has(configPath), relative(root, configPath)).toBe(true);
  }
  expect(
    workspaceCommands(root, "test").filter(
      (command) => command.packageName === "@aphrody/shenron-ui",
    ),
  ).toHaveLength(3);
});

test("rejects shell syntax rather than silently ignoring a gate", () => {
  expect(() => splitGateScript("bun test; echo success")).toThrow();
  expect(() => splitGateScript("unknown test")).toThrow();
  expect(() => splitGateScript("tsc --noEmit")).toThrow();
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
