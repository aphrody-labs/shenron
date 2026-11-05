// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";

import {
  aotRequested,
  chooseCompileMode,
  compileModeFlags,
  foreignRuntime,
  hostTarget,
} from "./compile-mode";

describe("compile mode", () => {
  test("a native target compiles ahead of time", () => {
    expect(chooseCompileMode({ target: "linux-x64", aot: true, host: "linux-x64" })).toEqual({
      mode: "aot",
    });
    expect(chooseCompileMode({ target: "windows-x64", aot: true, host: "windows-x64" }).mode).toBe(
      "aot",
    );
  });

  test("--aot cannot cross-compile: a foreign target keeps the bytecode bundle", () => {
    expect(chooseCompileMode({ target: "linux-x64", aot: true, host: "windows-x64" })).toEqual({
      mode: "bytecode",
      reason: "--aot cannot cross-compile to linux-x64",
    });
    expect(chooseCompileMode({ target: "linux-x64-musl", aot: true, host: "linux-x64" }).mode).toBe(
      "bytecode",
    );
  });

  test("AOT disabled falls back to bytecode", () => {
    expect(chooseCompileMode({ target: "linux-x64", aot: false, host: "linux-x64" })).toEqual({
      mode: "bytecode",
      reason: "aot disabled",
    });
  });

  test("another embedded runtime gets neither AOT nor a bytecode cache it cannot read", () => {
    expect(
      chooseCompileMode({
        target: "linux-x64",
        aot: true,
        host: "linux-x64",
        compileBun: "/opt/other/bun",
        execPath: "/usr/bin/bun",
      }).mode,
    ).toBe("bundle");
  });

  test("SHENRON_COMPILE_BUN naming the running Bun is not foreign", () => {
    expect(foreignRuntime(process.execPath)).toBe(false);
    expect(foreignRuntime(undefined)).toBe(false);
    expect(foreignRuntime("  ")).toBe(false);
  });

  test("flags of each mode", () => {
    expect(compileModeFlags("aot")).toEqual(["--aot"]);
    expect(compileModeFlags("aot", { codeFromDisk: true })).toEqual([
      "--aot",
      "--aot-allow-code-from-disk",
    ]);
    expect(compileModeFlags("bytecode")).toEqual(["--bytecode", "--format=esm"]);
    expect(compileModeFlags("bundle")).toEqual([]);
  });

  test("--no-aot and SHENRON_AOT=0 turn AOT off", () => {
    expect(aotRequested([], {})).toBe(true);
    expect(aotRequested(["--no-aot"], {})).toBe(false);
    expect(aotRequested([], { SHENRON_AOT: "0" })).toBe(false);
  });

  test("host targets", () => {
    expect(hostTarget("win32", "x64")).toBe("windows-x64");
    expect(hostTarget("linux", "x64")).toBe("linux-x64");
    expect(hostTarget("linux", "arm64")).toBeNull();
    expect(hostTarget("darwin", "x64")).toBeNull();
  });
});
