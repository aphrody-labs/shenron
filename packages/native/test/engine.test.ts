// SPDX-License-Identifier: Apache-2.0
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  cstr,
  resolveNativeLibraryPath,
  SHENRON_FFI_FILE,
  shenronLoad,
  shenronLocalSearch,
} from "../src/engine";
import * as shenron from "../src/shenron";

const PACKAGE_ROOT = join(import.meta.dir, "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const scratch = mkdtempSync(join(tmpdir(), "shenron-native-"));
const saved = {
  SHENRON_FFI_LIB: process.env.SHENRON_FFI_LIB,
  SHENRON_FFI_DEV: process.env.SHENRON_FFI_DEV,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(restoreEnv);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** No default candidate beside the package: the default resolution finds nothing. */
const noBundledLibrary = !existsSync(join(PACKAGE_ROOT, "native"));

describe("library resolution", () => {
  test("SHENRON_FFI_FILE is the host file name of the library", () => {
    const expected =
      process.platform === "win32"
        ? "shenron_ffi.dll"
        : process.platform === "darwin"
          ? "libshenron_ffi.dylib"
          : "libshenron_ffi.so";
    expect(SHENRON_FFI_FILE).toBe(expected);
  });

  test("SHENRON_FFI_LIB must name an existing file", () => {
    process.env.SHENRON_FFI_LIB = join(scratch, "missing", SHENRON_FFI_FILE);
    expect(() => resolveNativeLibraryPath()).toThrow("SHENRON_FFI_LIB points to a missing file");
    const present = join(scratch, SHENRON_FFI_FILE);
    writeFileSync(present, "not a library");
    process.env.SHENRON_FFI_LIB = present;
    expect(resolveNativeLibraryPath()).toBe(resolve(present));
  });

  test.if(noBundledLibrary)("without override nor dev build nothing is resolved", () => {
    delete process.env.SHENRON_FFI_LIB;
    delete process.env.SHENRON_FFI_DEV;
    expect(resolveNativeLibraryPath()).toBeUndefined();
    expect(() => shenronLoad()).toThrow("shenron-ffi native library not found");
  });

  test("shenronLoad(path) reports a missing or invalid library with its path", () => {
    const missing = join(scratch, "nowhere", SHENRON_FFI_FILE);
    expect(() => shenronLoad(missing)).toThrow(`Unable to load shenron-ffi at ${missing}`);
    const junk = join(scratch, `junk-${SHENRON_FFI_FILE}`);
    writeFileSync(junk, "not a library");
    expect(() => shenronLoad(junk)).toThrow(`Unable to load shenron-ffi at ${junk}`);
  });
});

/** A missing override: any load attempt throws a plain Error, never a TypeError/RangeError. */
function withoutLibrary(): void {
  process.env.SHENRON_FFI_LIB = join(scratch, "absent", SHENRON_FFI_FILE);
}

describe("argument checks run before the library is opened", () => {
  test("cstr refuses NUL characters", () => {
    expect(() => cstr("a\0b")).toThrow(TypeError);
    expect([...cstr("é")]).toEqual([0xc3, 0xa9, 0]);
  });

  test("shenronLocalSearch: limit is a positive integer", () => {
    withoutLibrary();
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      expect(() => shenronLocalSearch("Goku", limit)).toThrow(RangeError);
    }
  });

  test("shenronLocalSearch: query and kind must not contain NUL", () => {
    withoutLibrary();
    expect(() => shenronLocalSearch("Go\0ku")).toThrow(TypeError);
    expect(() => shenronLocalSearch("Goku", 8, "wi\0ki")).toThrow(TypeError);
  });

  test("shenronLocalSearch without a library surfaces the load error", () => {
    withoutLibrary();
    expect(() => shenronLocalSearch("Goku")).toThrow("SHENRON_FFI_LIB points to a missing file");
  });
});

describe("@shenron/native/shenron", () => {
  test("re-exports the loader and the local search", () => {
    expect(shenron.shenronLoad).toBe(shenronLoad);
    expect(shenron.shenronLocalSearch).toBe(shenronLocalSearch);
    expect(shenron.SHENRON_FFI_FILE).toBe(SHENRON_FFI_FILE);
  });
});

// Opt-in: runs only where a shenron-ffi build is present (never built by the test itself).
const builtLibrary = ["release", "debug"]
  .map((profile) => join(REPO_ROOT, "target", profile, SHENRON_FFI_FILE))
  .find((path) => existsSync(path));

describe.if(builtLibrary !== undefined)("with the built shenron-ffi library", () => {
  test("shenronLoad opens one library per process and checks its ABI", () => {
    const path = builtLibrary as string;
    expect(shenronLoad(path)).toBe(path);
    expect(shenronLoad(join(scratch, "other", SHENRON_FFI_FILE))).toBe(path);
    expect(shenron.shenronAbiVersion()).toBe(shenron.EXPECTED_SHENRON_ABI_VERSION);
  });

  test("shenronLocalSearch returns the decoded corpus answer", () => {
    shenronLoad(builtLibrary as string);
    const answer = shenronLocalSearch("Goku", 2);
    expect(typeof answer.mode).toBe("string");
    expect(Array.isArray(answer.results)).toBe(true);
    expect((answer.results as unknown[]).length).toBeLessThanOrEqual(2);
    // An empty kind searches every kind, like an absent one.
    expect(shenronLocalSearch("Goku", 2, "").mode).toBe(answer.mode);
  });
});
