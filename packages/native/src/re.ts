// SPDX-License-Identifier: Apache-2.0
//
// Bun `bun:ffi` binding for the pure Rust DBXV2 reverse engineering engine (crate `shenron-re`).
// Exposes binary triage, CPK archive extraction, BAC/BDM/CUS/PUP/MSG decoders, and SAV inspection.

import { CString, dlopen, ptr, suffix, toArrayBuffer, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const SHENRON_RE_ABI_VERSION = 1;

export const SHENRON_RE_SYMBOLS = {
  shenron_re_abi_version: {
    args: [],
    returns: "u32",
  },
  shenron_re_version: {
    args: [],
    returns: "cstring",
  },
  shenron_re_free_string: {
    args: ["ptr"],
    returns: "void",
  },
  shenron_re_free_bytes: {
    args: ["ptr", "usize"],
    returns: "void",
  },
  shenron_re_triage_json: {
    args: ["ptr", "usize"],
    returns: "ptr",
  },
  shenron_re_cpk_list_json: {
    args: ["ptr", "usize"],
    returns: "ptr",
  },
  shenron_re_cpk_extract: {
    args: ["ptr", "usize", "cstring", "ptr"],
    returns: "ptr",
  },
  shenron_re_bac_parse_json: {
    args: ["ptr", "usize"],
    returns: "ptr",
  },
  shenron_re_bdm_parse_json: {
    args: ["ptr", "usize"],
    returns: "ptr",
  },
  shenron_re_cus_parse_json: {
    args: ["ptr", "usize"],
    returns: "ptr",
  },
  shenron_re_pup_parse_json: {
    args: ["ptr", "usize"],
    returns: "ptr",
  },
  shenron_re_msg_parse_json: {
    args: ["ptr", "usize"],
    returns: "ptr",
  },
  shenron_re_sav_parse_json: {
    args: ["ptr", "usize"],
    returns: "ptr",
  },
  shenron_re_catalog_json: {
    args: [],
    returns: "ptr",
  },
} as const;

export type ShenronReLibrary = ReturnType<typeof dlopen<typeof SHENRON_RE_SYMBOLS>>;
type PointerReturn = Pointer | bigint | null;

let activeLib: ShenronReLibrary | undefined;
let activeLibPath: string | undefined;

/** Resolve candidate locations for libshenron_re. */
export function resolveShenronReLibraryPath(): string | undefined {
  if (process.env.SHENRON_RE_LIB && existsSync(process.env.SHENRON_RE_LIB)) {
    return process.env.SHENRON_RE_LIB;
  }

  const libName = `${process.platform === "win32" ? "" : "lib"}shenron_re.${suffix}`;
  const repoRoot = resolve(import.meta.dir, "../../..");
  const candidates = [
    join(repoRoot, "target/release", libName),
    join(repoRoot, "target/debug", libName),
    join(import.meta.dir, "../native", libName),
    join("/usr/local/lib", libName),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/** Open or return the cached Bun FFI handle for shenron-re. */
export function getShenronReLibrary(): ShenronReLibrary {
  if (activeLib) return activeLib;

  const libPath = resolveShenronReLibraryPath();
  if (!libPath) {
    throw new Error(
      `Could not locate libshenron_re.${suffix}. Build it with 'cargo build -p shenron-re' or set SHENRON_RE_LIB.`
    );
  }

  activeLib = dlopen(libPath, SHENRON_RE_SYMBOLS);
  activeLibPath = libPath;
  return activeLib;
}

export function getShenronReLibraryPath(): string | undefined {
  return activeLibPath;
}

/** Convert a raw pointer to a JSON string returned by Rust and safely free it. */
function readJsonAndFree<T>(lib: ShenronReLibrary, returned: PointerReturn): T {
  const rawPtr = returned as Pointer | null;
  if (!rawPtr || rawPtr === 0) {
    throw new Error("Null pointer returned by shenron-re FFI");
  }
  const cstr = new CString(rawPtr);
  const text = cstr.toString();
  lib.symbols.shenron_re_free_string(rawPtr);

  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    throw new Error(`shenron-re error: ${parsed.error}`);
  }
  return parsed as T;
}

/** Get the ABI version of the loaded shenron-re library. */
export function reAbiVersion(): number {
  return getShenronReLibrary().symbols.shenron_re_abi_version();
}

/** Get the crate version of the loaded shenron-re library. */
export function reVersion(): string {
  const returned = getShenronReLibrary().symbols.shenron_re_version();
  return returned ? returned.toString() : "";
}

/** Triage a binary buffer (PE headers, CPK signature, savegame detection). */
export function reTriage(data: Uint8Array): {
  size_bytes: number;
  is_pe: boolean;
  is_cpk: boolean;
  is_sav: boolean;
} {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_triage_json(ptr(data), data.byteLength);
  return readJsonAndFree(lib, raw);
}

export interface CpkFileEntry {
  id: number;
  name: string;
  directory?: string;
  file_size: number;
  extract_size: number;
  offset: number;
  is_compressed: boolean;
}

/** List all entries in a CRIWARE CPK archive. */
export function reListCpk(data: Uint8Array): CpkFileEntry[] {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_cpk_list_json(ptr(data), data.byteLength);
  return readJsonAndFree<CpkFileEntry[]>(lib, raw);
}

/** Extract a single file from a CPK archive by name into an owned Uint8Array. */
export function reExtractCpkFile(archive: Uint8Array, filename: string): Uint8Array | null {
  const lib = getShenronReLibrary();
  const outLenBuf = new BigUint64Array(1);
  const filenameCstr = new TextEncoder().encode(`${filename}\0`);

  const outPtr = lib.symbols.shenron_re_cpk_extract(
    ptr(archive),
    archive.byteLength,
    ptr(filenameCstr),
    ptr(outLenBuf)
  );

  if (!outPtr || outPtr === 0) return null;

  const len = Number(outLenBuf[0]);
  const extracted = new Uint8Array(len);
  // Copy bytes from memory buffer allocated by Rust
  const src = new Uint8Array(toArrayBuffer(outPtr as number, 0, len));
  extracted.set(src);

  lib.symbols.shenron_re_free_bytes(outPtr, len);
  return extracted;
}

/** Parse BAC moveset binary and return moves. */
export function reParseBac(data: Uint8Array): unknown {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_bac_parse_json(ptr(data), data.byteLength);
  return readJsonAndFree(lib, raw);
}

/** Parse BDM damage matrix binary. */
export function reParseBdm(data: Uint8Array): unknown {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_bdm_parse_json(ptr(data), data.byteLength);
  return readJsonAndFree(lib, raw);
}

/** Parse CUS skill table binary. */
export function reParseCus(data: Uint8Array): unknown {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_cus_parse_json(ptr(data), data.byteLength);
  return readJsonAndFree(lib, raw);
}

/** Parse PUP transformation multipliers binary. */
export function reParsePup(data: Uint8Array): unknown {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_pup_parse_json(ptr(data), data.byteLength);
  return readJsonAndFree(lib, raw);
}

/** Parse MSG localized text binary. */
export function reParseMsg(data: Uint8Array): unknown {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_msg_parse_json(ptr(data), data.byteLength);
  return readJsonAndFree(lib, raw);
}

export interface Dxbv2Cac {
  slot: number;
  name: string;
  race_id: number;
  race_name: string;
  voice: number;
  body_shape: number;
  level: number;
  experience: number;
  attribute_points: number;
  health: number;
  ki: number;
  stamina: number;
  basic_atk: number;
  strike_super: number;
  blast_super: number;
}

export interface Dxbv2Save {
  is_encrypted_envelope: boolean;
  signature: string;
  zeni: number;
  tp_medals: number;
  active_cacs_count: number;
  cacs: Dxbv2Cac[];
}

/** Parse decrypted DBXV2 savegame body. */
export function reParseSave(data: Uint8Array): Dxbv2Save {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_sav_parse_json(ptr(data), data.byteLength);
  return readJsonAndFree<Dxbv2Save>(lib, raw);
}

/** Get the built-in Dragon Ball video game catalog. */
export function reCatalog(): unknown {
  const lib = getShenronReLibrary();
  const raw = lib.symbols.shenron_re_catalog_json();
  return readJsonAndFree(lib, raw);
}
