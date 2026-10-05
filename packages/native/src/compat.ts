// SPDX-License-Identifier: Apache-2.0
/**
 * Compatibility of a shenron-ffi library with this binding, decided from its `BuildInfo`
 * (`shenron_build_info`) before any other call: the ABI revision, the target (OS and
 * architecture of this process) and the crate version the generated table comes from. A
 * different version of the same ABI is refused unless `SHENRON_FFI_ALLOW_VERSION_SKEW=1`.
 *
 * Runtime class: pure (no `bun:ffi`); `engine.ts` applies it to the opened library.
 */
import type { BuildInfo } from "./generated/types";

/** Rust `std::env::consts::OS` → `process.platform`. */
const PLATFORM_OF_OS: Readonly<Record<string, string>> = {
  linux: "linux",
  macos: "darwin",
  windows: "win32",
  freebsd: "freebsd",
  openbsd: "openbsd",
  android: "android",
};

/** Rust `std::env::consts::ARCH` → `process.arch`. */
const ARCH_OF_RUST: Readonly<Record<string, string>> = {
  x86_64: "x64",
  aarch64: "arm64",
  x86: "ia32",
  arm: "arm",
  riscv64: "riscv64",
  powerpc64: "ppc64",
  s390x: "s390x",
  loongarch64: "loong64",
};

/** What this binding accepts. */
export interface Expectation {
  /** ABI revision of the generated table (`SHENRON_FFI_ABI`). */
  abi: number;
  /** Crate version the table was generated from (`SHENRON_FFI_VERSION`). */
  version: string;
  /** `process.platform` of this process. */
  platform: string;
  /** `process.arch` of this process. */
  arch: string;
  /** `SHENRON_FFI_ALLOW_VERSION_SKEW=1`: accept another version of the same ABI. */
  allowVersionSkew: boolean;
}

/** Why a library is refused. */
export type MismatchReason = "abi" | "target" | "version";

/** A library this binding refuses to use; `reason` says which check failed. */
export class ShenronLibraryMismatch extends Error {
  override readonly name = "ShenronLibraryMismatch";
  constructor(
    readonly path: string,
    readonly reason: MismatchReason,
    message: string,
  ) {
    super(message);
  }
}

/** `process.platform`-`process.arch` pair a `BuildInfo` describes (`linux-x64`, `win32-x64`). */
export function targetOf(info: Pick<BuildInfo, "os" | "arch">): string {
  return `${PLATFORM_OF_OS[info.os] ?? info.os}-${ARCH_OF_RUST[info.arch] ?? info.arch}`;
}

/** Refuse an ABI revision other than the generated table's. */
export function checkAbi(actual: number, expected: number, path: string): void {
  if (actual !== expected) {
    throw new ShenronLibraryMismatch(
      path,
      "abi",
      `Shenron ABI mismatch at ${path}: expected ${expected}, found ${actual} ` +
        "(rebuild the library or update @shenron/native)",
    );
  }
}

/** Refuse a library built for another ABI, target or crate version (see `Expectation`). */
export function checkBuildInfo(info: BuildInfo, path: string, expected: Expectation): void {
  checkAbi(info.abi, expected.abi, path);
  const built = targetOf(info);
  const host = `${expected.platform}-${expected.arch}`;
  if (built !== host) {
    throw new ShenronLibraryMismatch(
      path,
      "target",
      `shenron-ffi at ${path} is built for ${built} (${info.target}); this process runs on ` +
        `${host}: install the library of this platform (native/${host}/)`,
    );
  }
  if (info.version !== expected.version && !expected.allowVersionSkew) {
    throw new ShenronLibraryMismatch(
      path,
      "version",
      `shenron-ffi at ${path} is version ${info.version}; @shenron/native expects ` +
        `${expected.version} (rebuild with \`cargo build -p shenron-ffi\`, or set ` +
        "SHENRON_FFI_ALLOW_VERSION_SKEW=1 to accept another version of the same ABI)",
    );
  }
}
