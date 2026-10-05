// SPDX-License-Identifier: Apache-2.0
// Refusal rules of an incompatible library, by injection (no library needed), and the
// backward compatibility of the generated table with ABI 1.
import { describe, expect, test } from "bun:test";
import { FFIType } from "bun:ffi";
import { join } from "node:path";

import { checkAbi, checkBuildInfo, ShenronLibraryMismatch, targetOf } from "../src/compat";
import { checkBunRuntime, SHENRON_NATIVE_BUN_RANGE } from "../src/engine";
import { SHENRON_FFI_ABI, SHENRON_FFI_VERSION, SYMBOLS } from "../src/generated/symbols";
import type { BuildInfo } from "../src/generated/types";

const linux: BuildInfo = {
  version: "1.1.0",
  abi: 2,
  target: "x86_64-unknown-linux-gnu",
  os: "linux",
  arch: "x86_64",
  profile: "release",
  features: [],
  rustc: "rustc 1.98.1",
};
const expected = {
  abi: 2,
  version: "1.1.0",
  platform: "linux",
  arch: "x64",
  allowVersionSkew: false,
};

function mismatch(run: () => void): ShenronLibraryMismatch {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ShenronLibraryMismatch);
    return error as ShenronLibraryMismatch;
  }
  throw new Error("expected a ShenronLibraryMismatch");
}

describe("checkBuildInfo", () => {
  test("maps Rust OS and architecture names onto process.platform and process.arch", () => {
    expect(targetOf(linux)).toBe("linux-x64");
    expect(targetOf({ os: "windows", arch: "x86_64" })).toBe("win32-x64");
    expect(targetOf({ os: "macos", arch: "aarch64" })).toBe("darwin-arm64");
    expect(targetOf({ os: "plan9", arch: "mips" })).toBe("plan9-mips");
  });

  test("accepts the library of this ABI, target and version", () => {
    expect(() => checkBuildInfo(linux, "/lib/x.so", expected)).not.toThrow();
  });

  test("refuses another ABI revision", () => {
    const error = mismatch(() => checkBuildInfo({ ...linux, abi: 1 }, "/lib/x.so", expected));
    expect(error.reason).toBe("abi");
    expect(error.message).toContain("Shenron ABI mismatch at /lib/x.so: expected 2, found 1");
    expect(mismatch(() => checkAbi(3, 2, "/p")).reason).toBe("abi");
  });

  test("refuses a library built for another platform, with both targets in the message", () => {
    const windows = { ...linux, os: "windows", target: "x86_64-pc-windows-msvc" };
    const error = mismatch(() => checkBuildInfo(windows, "/lib/x.so", expected));
    expect(error.reason).toBe("target");
    expect(error.message).toContain("built for win32-x64 (x86_64-pc-windows-msvc)");
    expect(error.message).toContain("this process runs on linux-x64");
    const arm = { ...linux, arch: "aarch64", target: "aarch64-unknown-linux-gnu" };
    expect(mismatch(() => checkBuildInfo(arm, "/lib/x.so", expected)).reason).toBe("target");
  });

  test("refuses another crate version unless the skew is allowed", () => {
    const older = { ...linux, version: "1.0.9" };
    const error = mismatch(() => checkBuildInfo(older, "/lib/x.so", expected));
    expect(error.reason).toBe("version");
    expect(error.message).toContain("SHENRON_FFI_ALLOW_VERSION_SKEW=1");
    expect(() =>
      checkBuildInfo(older, "/lib/x.so", { ...expected, allowVersionSkew: true }),
    ).not.toThrow();
  });
});

describe("Bun runtime", () => {
  test("engines.bun is the repository's", async () => {
    const root = (await Bun.file(join(import.meta.dir, "../../../package.json")).json()) as {
      engines: { bun: string };
    };
    expect(SHENRON_NATIVE_BUN_RANGE).toBe(root.engines.bun);
    expect(() => checkBunRuntime()).not.toThrow();
  });

  test("a Bun outside the range is refused", () => {
    expect(() => checkBunRuntime("1.0.0", ">=1.4.2")).toThrow(
      "@shenron/native requires Bun >=1.4.2; this process runs Bun 1.0.0",
    );
    expect(() => checkBunRuntime("1.4.2", ">=1.4.2")).not.toThrow();
  });
});

describe("generated table", () => {
  test("is ABI 2 of the workspace version", async () => {
    expect(SHENRON_FFI_ABI).toBe(2);
    const cargo = await Bun.file(join(import.meta.dir, "../../../Cargo.toml")).text();
    expect(cargo).toContain(`version = "${SHENRON_FFI_VERSION}"`);
  });

  test("keeps every ABI 1 symbol with its ABI 1 signature", () => {
    // The hand-written table of @shenron/native for ABI 1, frozen.
    const abi1 = {
      shenron_abi_version: { args: [], returns: FFIType.u32 },
      shenron_version: { args: [], returns: FFIType.cstring },
      shenron_last_error: { args: [], returns: FFIType.ptr },
      shenron_string_free: { args: [FFIType.ptr], returns: FFIType.void },
      shenron_run_json: { args: [FFIType.cstring], returns: FFIType.i32 },
      shenron_run: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
      shenron_run_captured: { args: [FFIType.cstring], returns: FFIType.ptr },
      shenron_rag_search: {
        args: [FFIType.cstring, FFIType.i32, FFIType.cstring],
        returns: FFIType.ptr,
      },
      shenron_local_search: {
        args: [FFIType.cstring, FFIType.i32, FFIType.cstring],
        returns: FFIType.ptr,
      },
      shenron_rag_stats: { args: [], returns: FFIType.ptr },
      shenron_rag_chunk: {
        args: [FFIType.cstring, FFIType.i32, FFIType.f32],
        returns: FFIType.ptr,
      },
      shenron_auth_status: { args: [], returns: FFIType.ptr },
      shenron_persona_prompt: { args: [], returns: FFIType.cstring },
      shenron_persona_ask: { args: [FFIType.cstring], returns: FFIType.ptr },
    };
    for (const [name, signature] of Object.entries(abi1)) {
      expect(SYMBOLS[name as keyof typeof SYMBOLS] as unknown).toEqual(signature);
    }
  });
});
