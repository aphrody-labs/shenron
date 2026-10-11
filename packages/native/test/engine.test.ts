// SPDX-License-Identifier: Apache-2.0
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  close,
  cstr,
  resolveNativeLibraryPath,
  SHENRON_FFI_FILE,
  shenronLoad,
  shenronLocalSearch,
  shenronReXenoverse3Map,
} from "../src/engine";
import * as shenron from "../src/shenron";

const PACKAGE_ROOT = join(import.meta.dir, "..");
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
// Each test resolves and opens the library itself (another test file may have opened one).
beforeEach(() => close());
afterAll(() => {
  close();
  rmSync(scratch, { recursive: true, force: true });
});

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
    expect(shenron.shenronReXenoverse3Map).toBe(shenronReXenoverse3Map);
    expect(shenron.SHENRON_FFI_FILE).toBe(SHENRON_FFI_FILE);
  });
});

// Opt-in: SHENRON_FFI_DEV=1 (or SHENRON_FFI_LIB) after `cargo build -p shenron-ffi`; never
// built by the test itself. Without a library the suite is skipped.
function liveLibrary(): string | undefined {
  if (process.env.SHENRON_FFI_DEV !== "1" && !process.env.SHENRON_FFI_LIB) return undefined;
  try {
    return resolveNativeLibraryPath();
  } catch {
    return undefined;
  }
}
const builtLibrary = liveLibrary();

describe.if(builtLibrary !== undefined)("with the built shenron-ffi library", () => {
  test("shenronLoad opens one library per process and checks its ABI and identity", () => {
    const path = builtLibrary as string;
    expect(shenronLoad(path)).toBe(path);
    expect(shenronLoad(join(scratch, "other", SHENRON_FFI_FILE))).toBe(path);
    expect(shenron.shenronAbiVersion()).toBe(shenron.EXPECTED_SHENRON_ABI_VERSION);
    const info = shenron.shenronBuildInfo();
    expect(info.abi).toBe(shenron.SHENRON_FFI_ABI);
    expect(info.version).toBe(shenron.SHENRON_FFI_VERSION);
    expect(["debug", "release"]).toContain(info.profile);
  });

  test("shenronLocalSearch returns the decoded corpus answer", () => {
    shenronLoad(builtLibrary as string);
    const answer = shenronLocalSearch("Goku", 2);
    expect(answer.mode).toBe("aphrody_local_naive");
    expect(answer.results.length).toBeLessThanOrEqual(2);
    expect(answer.total).toBe(answer.results.length);
    // An empty kind searches every kind, like an absent one.
    expect(shenronLocalSearch("Goku", 2, "").mode).toBe(answer.mode);
  });

  test("shenronReXenoverse3Map returns the cited Rust prototype geometry", () => {
    shenronLoad(builtLibrary as string);
    const map = shenron.shenronReXenoverse3Map();
    expect(map.status).toBe("original_prototype_schematic");
    expect(map.zones).toHaveLength(6);
    expect(map.landmarks).toHaveLength(8);
    expect(map.routes).toHaveLength(7);
    expect(map.caveat).toContain("unreleased");
  });

  test("the chat memory stores, finds and deletes per agent (aphrody-memory)", () => {
    shenronLoad(builtLibrary as string);
    const db = join(scratch, "memory", "memory.sqlite");
    const added = shenron.shenronMemoryAdd(db, {
      agentId: "shenron/local",
      content: "Je préfère Piccolo",
      tags: ["preference"],
      metadata: { source: "chat" },
    });
    expect(added.id.length).toBeGreaterThan(0);
    expect(added.createdAtMs).toBeGreaterThan(0);
    expect(added.metadata).toEqual({ source: "chat" });
    shenron.shenronMemoryAdd(db, { agentId: "shenron/other", content: "Vegeta" });
    const found = shenron.shenronMemorySearch(db, { agentId: "shenron/local", q: "piccolo" });
    expect(found.map((m) => m.id)).toEqual([added.id]);
    expect(shenron.shenronMemoryDelete(db, "shenron/other", added.id)).toBe(false);
    expect(shenron.shenronMemoryDelete(db, "shenron/local", added.id)).toBe(true);
    expect(shenron.shenronMemoryClear(db, "shenron/other")).toBe(1);
    expect(() => shenron.shenronMemoryAdd(db, { agentId: "", content: "x" })).toThrow(
      shenron.ShenronMemoryError,
    );
  });

  test("captured runs capture stdout outside the Rust test harness", () => {
    shenronLoad(builtLibrary as string);
    const run = shenron.shenronRunCaptured(["auth", "status", "--json"]);
    expect(run.code).toBe(0);
    const status = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(Object.keys(status).toSorted()).toEqual(["admin_credentials_present", "configured"]);
    expect(JSON.parse(shenron.shenronAuthStatus().stdout)).toEqual(status);
  });

  test("10 000 owned strings are freed: no measurable RSS growth", () => {
    shenronLoad(builtLibrary as string);
    const markdown = "# Goku\n\n" + "Kamehameha. ".repeat(40);
    const batch = () => {
      for (let i = 0; i < 10_000; i++) shenron.shenronRagChunk(markdown, 200, 0.1);
      Bun.gc(true);
      return process.memoryUsage().rss;
    };
    const warm = batch();
    const after = batch();
    const growthMb = (after - warm) / 1024 / 1024;
    console.log(`rag_chunk: RSS growth over 10 000 calls ${growthMb.toFixed(2)} MB`);
    expect(growthMb).toBeLessThan(8);
  });
});
