// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { nativeCheckArgs, nativeRuntime } from "./native-quality";

describe("opt-in native quality", () => {
  test("uses the invoking runtime and requires a real absolute override", () => {
    expect(nativeRuntime(undefined)).toBe(process.execPath);
    expect(nativeRuntime(process.execPath)).toBe(process.execPath);
    expect(() => nativeRuntime("bun")).toThrow("absolute runtime path");
  });
  test("preserves project flags while dropping noEmit for native check", () => {
    expect(nativeCheckArgs(["tsc", "--noEmit", "-p", "scripts"])).toEqual([
      "check",
      "-p",
      "scripts",
    ]);
    expect(nativeCheckArgs(["bun", "check", "-p", "."])).toEqual(["check", "-p", "."]);
    expect(() => nativeCheckArgs(["unknown"])).toThrow("Unsupported");
  });
});
