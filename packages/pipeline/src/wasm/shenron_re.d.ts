/* tslint:disable */
/* eslint-disable */

/**
 * Decompress a CRILAYLA compressed buffer into raw uncompressed bytes.
 */
export function wasm_decompress_crilayla(
  compressed: Uint8Array,
  uncompressed_size: number,
): Uint8Array;

/**
 * Extract a single file from a CPK archive by name (transparently decompressing CRILAYLA if needed).
 */
export function wasm_extract_cpk_file(archive_bytes: Uint8Array, filename: string): Uint8Array;

/**
 * Extract printable UTF-16LE text runs from one MSG buffer without parsing its table layout.
 */
export function wasm_extract_msg_text(file_name: string, msg_bytes: Uint8Array): any;

/**
 * Retrieve the full Dragon Ball game catalog (Steam + Android) as a JavaScript object.
 */
export function wasm_get_dragon_ball_catalog(): any;

/**
 * Retrieve the source-attributed Xenoverse 3 prototype world map as JavaScript data.
 * Announced places and original prototype geometry are distinguished in each record.
 */
export function wasm_get_xenoverse3_prototype_map(): any;

/**
 * Parse a DBXV2 BAC (Battle Action Code) moveset binary file and return all moves.
 */
export function wasm_parse_bac(bac_bytes: Uint8Array): any;

/**
 * Parse a DBXV2 BDM (Battle Damage Matrix) binary file and return all damage definitions.
 */
export function wasm_parse_bdm(bdm_bytes: Uint8Array): any;

/**
 * Parse a DBXV2 CUS (Character Ultimate Skill) binary file and return all skills.
 */
export function wasm_parse_cus(cus_bytes: Uint8Array): any;

/**
 * Validate a DBXV2 EMB texture archive and return its entry names and byte ranges.
 */
export function wasm_parse_emb(emb_bytes: Uint8Array): any;

/**
 * Parse a DBXV2 MSG (Message) binary file and return localized text strings.
 */
export function wasm_parse_msg(msg_bytes: Uint8Array): any;

/**
 * Parse a DBXV2 PUP (Power-Up Parameters) binary file and return transformation multipliers.
 */
export function wasm_parse_pup(pup_bytes: Uint8Array): any;

/**
 * Scan a buffer for an Array-of-Bytes (AOB) pattern with wildcards (e.g. "48 89 5C 24 ??").
 */
export function wasm_scan_aob(data: Uint8Array, pattern: string): Uint32Array;

/**
 * Analyze a CRIWARE CPK archive in-memory and return its file table and metadata.
 */
export function wasm_triage_cpk(bytes: Uint8Array): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly wasm_decompress_crilayla: (
    a: number,
    b: number,
    c: number,
  ) => [number, number, number, number];
  readonly wasm_extract_cpk_file: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number, number];
  readonly wasm_extract_msg_text: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number];
  readonly wasm_get_dragon_ball_catalog: () => [number, number, number];
  readonly wasm_get_xenoverse3_prototype_map: () => [number, number, number];
  readonly wasm_parse_bac: (a: number, b: number) => [number, number, number];
  readonly wasm_parse_bdm: (a: number, b: number) => [number, number, number];
  readonly wasm_parse_cus: (a: number, b: number) => [number, number, number];
  readonly wasm_parse_emb: (a: number, b: number) => [number, number, number];
  readonly wasm_parse_msg: (a: number, b: number) => [number, number, number];
  readonly wasm_parse_pup: (a: number, b: number) => [number, number, number];
  readonly wasm_scan_aob: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number, number];
  readonly wasm_triage_cpk: (a: number, b: number) => [number, number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>,
): Promise<InitOutput>;
