// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hasStylePaths, nativeCheckArgs, nativeRuntime } from "./native-quality";
import { nativeEnvironment } from "./native-runtime";

describe("canonical native quality", () => {
  test("style flags alone retain the complete workspace scope", () => {
    expect(hasStylePaths(["--check"])).toBe(false);
    expect(hasStylePaths(["--check", "-c", ".oxfmtrc.json"])).toBe(false);
    expect(hasStylePaths(["--format", "json", "apps"])).toBe(true);
  });
  test("uses the invoking runtime and requires a real absolute override", () => {
    expect(nativeRuntime(undefined)).toBe(process.execPath);
    expect(nativeRuntime(process.execPath)).toBe(process.execPath);
    expect(() => nativeRuntime("bun")).toThrow("absolute runtime path");
  });
  test("preserves project flags while dropping noEmit for native check", () => {
    expect(nativeCheckArgs(["bun", "check", "--noEmit", "-p", "scripts"])).toEqual([
      "check",
      "-p",
      "scripts",
    ]);
    expect(nativeCheckArgs(["bun", "check", "-p", "."])).toEqual(["check", "-p", "."]);
    expect(() => nativeCheckArgs(["unknown"])).toThrow("Unsupported");
    expect(() => nativeCheckArgs(["tsc", "--noEmit"])).toThrow("Unsupported");
  });
});

async function nativeCommand(cwd: string, command: string, args: string[]) {
  const runtime = nativeRuntime(process.env.SHENRON_BUN_EXECUTABLE);
  const child = Bun.spawn([runtime, command, ...args], {
    cwd,
    env: nativeEnvironment(runtime, command),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, output: stdout + stderr };
}

test("native check rejects a type error in the second referenced project without emitting files", async () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-native-check-"));
  try {
    await Bun.write(
      join(root, "tsconfig.json"),
      JSON.stringify({ files: [], references: [{ path: "a" }, { path: "b" }] }),
    );
    for (const name of ["a", "b"]) {
      mkdirSync(join(root, name));
      await Bun.write(
        join(root, name, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true, types: [], target: "ESNext", noEmit: true },
          include: ["index.ts"],
        }),
      );
      await Bun.write(
        join(root, name, "index.ts"),
        name === "b" ? 'export const value: number = "bad";' : "export const value: number = 1;",
      );
    }
    const rejected = await nativeCommand(root, "check", []);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.output).toContain("TS2322");
    expect(rejected.output).toContain("index.ts");
    expect(await Bun.file(join(root, "b/index.js")).exists()).toBe(false);
    await Bun.write(join(root, "b/index.ts"), "export const value: number = 2;");
    expect((await nativeCommand(root, "check", [])).exitCode).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("native lint and fmt reject real violations despite same-named package scripts", async () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-native-style-"));
  const repository = resolve(import.meta.dir, "../..");
  try {
    await Bun.write(
      join(root, "package.json"),
      JSON.stringify({
        scripts: { lint: "bun -e 'process.exit(0)'", fmt: "bun -e 'process.exit(0)'" },
      }),
    );
    await Bun.write(join(root, ".oxlintrc.json"), Bun.file(join(repository, ".oxlintrc.json")));
    await Bun.write(join(root, ".oxfmtrc.json"), Bun.file(join(repository, ".oxfmtrc.json")));
    await Bun.write(join(root, "invalid.ts"), "debugger;\n");
    const lint = await nativeCommand(root, "lint", ["-c", ".oxlintrc.json", "invalid.ts"]);
    expect(lint.exitCode, lint.output).toBe(1);
    expect(lint.output).toContain("debugger");
    await Bun.write(join(root, "invalid.ts"), "export const value={a:1,b:2}\n");
    const fmtArgs = ["-c", ".oxfmtrc.json", "invalid.ts"];
    expect((await nativeCommand(root, "fmt", ["--check", ...fmtArgs])).exitCode).toBe(1);
    expect((await nativeCommand(root, "fmt", ["--write", ...fmtArgs])).exitCode).toBe(0);
    expect((await nativeCommand(root, "fmt", ["--check", ...fmtArgs])).exitCode).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
