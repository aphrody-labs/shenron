// SPDX-License-Identifier: Apache-2.0
/**
 * TypeScript API bindings for the `shenron-re` WebAssembly engine.
 *
 * Provides in-browser and Bun/Node runtime reverse engineering primitives:
 * - Full Dragon Ball Game Catalog (Steam + Android)
 * - CRIWARE CPK virtual archive triage & zero-copy extraction
 * - Pure CRILAYLA reverse LZSS bitstream decompression
 * - Xenoverse 2 CUS (Character Ultimate Skill) binary decoding
 * - Memory AOB pattern scanning with wildcards
 */

import initWasm, {
  wasm_get_dragon_ball_catalog,
  wasm_triage_cpk,
  wasm_extract_cpk_file,
  wasm_decompress_crilayla,
  wasm_parse_bac,
  wasm_parse_bdm,
  wasm_parse_cus,
  wasm_parse_msg,
  wasm_parse_pup,
  wasm_scan_aob,
  wasm_get_xenoverse3_prototype_map,
} from "./wasm/shenron_re.js";

export type Platform = "steam" | "android" | "windows" | "ios" | "console";

export type GameEngine =
  | "carrot2"
  | "unreal_engine4"
  | "unreal_engine5"
  | "unity"
  | "cocos2dx"
  | "dimps_engine"
  | "arc_system_works_custom"
  | { custom: string };

export interface SaveLocation {
  platform: Platform;
  os: string;
  path_pattern: string;
  description: string;
}

export interface DragonBallGame {
  id: string;
  title: string;
  title_ja?: string | null;
  platforms: Platform[];
  steam_app_id?: number | null;
  android_package_ids: string[];
  developer: string;
  publisher: string;
  release_year?: number | null;
  engine: GameEngine;
  audio_middleware?: string | null;
  primary_formats: string[];
  canon_status: string;
  save_locations: SaveLocation[];
  default_install_dirs: string[];
  notes?: string | null;
}

export interface CpkEntry {
  id: number;
  name: string;
  dir_name?: string | null;
  file_size: number;
  extract_size: number;
  file_offset: number;
  is_compressed: boolean;
}

export interface CpkTriageSummary {
  valid: boolean;
  total_files: number;
  total_file_size: number;
  has_utf_table: boolean;
  compression_detected: boolean;
  entries: CpkEntry[];
}

export type SkillCategory = "Super" | "Ultimate" | "Evasive" | "Awoken" | "Unknown";

export interface CusSkill {
  id: number;
  category: SkillCategory;
  ki_cost: number;
  stamina_cost: number;
  name_id: number;
  desc_id: number;
  animation_id: number;
  particle_id: number;
  sound_id: number;
}

export interface CusFile {
  version: number;
  skills: CusSkill[];
}

export type MapEvidenceStatus = "announced" | "prototype";
export type MapPlaceKind = "hub" | "district" | "interior" | "mission_area" | "landmark";
export type MapTravelMode = "walk" | "fly" | "transit" | "mission_launch";

export interface MapPoint {
  x: number;
  y: number;
  elevation: number;
}

export interface Xenoverse3Map {
  schema_version: number;
  title: string;
  era: string;
  status: string;
  coordinate_system: string;
  bounds: [number, number, number];
  zones: Array<{
    id: string;
    name: string;
    kind: MapPlaceKind;
    evidence: MapEvidenceStatus;
    source: string;
    center: MapPoint;
    radius: number;
    description: string;
  }>;
  landmarks: Array<{
    id: string;
    name: string;
    zone_id: string;
    kind: MapPlaceKind;
    evidence: MapEvidenceStatus;
    source: string;
    position: MapPoint;
    description: string;
  }>;
  routes: Array<{
    id: string;
    from: string;
    to: string;
    mode: MapTravelMode;
    distance: number;
    evidence: MapEvidenceStatus;
    source: string;
    description: string;
  }>;
  caveat: string;
}

export type DamageType =
  | "Strike"
  | "KiBlast"
  | "HeavyStrike"
  | "Grab"
  | "Unblockable"
  | "Special"
  | "Unknown";

export interface BdmEntry {
  id: number;
  damage_type: DamageType;
  base_damage: number;
  stamina_damage: number;
  hitstun_frames: number;
  blockstun_frames: number;
  knockback_type: number;
  knockback_strength: number;
  pushback_distance: number;
  camera_shake: number;
}

export interface BdmFile {
  entries: BdmEntry[];
}

export interface BacHitbox {
  start_frame: number;
  end_frame: number;
  damage: number;
  bdm_entry_id: number;
  knockback_type: number;
}

export interface BacMove {
  move_id: number;
  total_frames: number;
  startup_frames: number;
  recovery_frames: number;
  hitboxes: BacHitbox[];
}

export interface BacFile {
  moves: BacMove[];
}

export interface PupEntry {
  id: number;
  basic_attack_mult: number;
  basic_ki_mult: number;
  strike_mult: number;
  ki_blast_mult: number;
  damage_taken_mult: number;
  speed_ground_mult: number;
  speed_air_mult: number;
  speed_boost_mult: number;
  ki_drain_rate: number;
  stamina_drain_rate: number;
}

export interface PupFile {
  entries: PupEntry[];
}

export interface MsgEntry {
  id: number;
  name_id: string;
  lines: string[];
}

export interface MsgFile {
  entries: MsgEntry[];
}

let wasmReady = false;

/**
 * Initializes the `shenron-re` WASM module.
 * If running in Bun/Node, automatically loads `shenron_re_bg.wasm` from disk if not provided.
 */
export async function initShenronRe(
  wasmSource?: Uint8Array | ArrayBuffer | WebAssembly.Module,
): Promise<void> {
  if (wasmReady) return;

  if (wasmSource) {
    await initWasm({ module_or_path: wasmSource });
    wasmReady = true;
    return;
  }

  // Load WASM from local package directory when running under Bun
  const wasmFile = Bun.file(new URL("./wasm/shenron_re_bg.wasm", import.meta.url).pathname);
  if (await wasmFile.exists()) {
    const bytes = await wasmFile.bytes();
    await initWasm({ module_or_path: bytes });
    wasmReady = true;
    return;
  }

  // Default web instantiation fallback
  await initWasm();
  wasmReady = true;
}

function ensureWasm(): void {
  if (!wasmReady) {
    throw new Error(
      "shenron-re WASM engine is not initialized. Call `await initShenronRe()` before running operations.",
    );
  }
}

/**
 * Returns the exhaustive Dragon Ball Game Catalog (Steam + Android) registered in Rust.
 */
export function getDragonBallCatalog(): DragonBallGame[] {
  ensureWasm();
  return wasm_get_dragon_ball_catalog() as DragonBallGame[];
}

/**
 * Analyzes an in-memory CRIWARE CPK archive and returns table metadata and entries.
 */
export function triageCpk(bytes: Uint8Array): CpkTriageSummary {
  ensureWasm();
  return wasm_triage_cpk(bytes) as CpkTriageSummary;
}

/**
 * Extracts a file by name from a CPK archive (transparently decompressing CRILAYLA if needed).
 */
export function extractCpkFile(archiveBytes: Uint8Array, filename: string): Uint8Array {
  ensureWasm();
  return wasm_extract_cpk_file(archiveBytes, filename);
}

/**
 * Decompresses a CRILAYLA compressed buffer.
 */
export function decompressCrilayla(compressed: Uint8Array, uncompressedSize = 0): Uint8Array {
  ensureWasm();
  return wasm_decompress_crilayla(compressed, uncompressedSize);
}

/**
 * Parses a DBXV2 CUS binary skill file and decodes all skills (up to standard 708 skills).
 */
export function parseCus(cusBytes: Uint8Array): CusFile {
  ensureWasm();
  return wasm_parse_cus(cusBytes) as CusFile;
}

/**
 * Scans a byte array for an IDA/Cheat Engine Array-of-Bytes (AOB) pattern with wildcards (e.g. "48 89 5C 24 ??").
 */
export function scanAob(data: Uint8Array, pattern: string): number[] {
  ensureWasm();
  const offsets = wasm_scan_aob(data, pattern);
  return Array.from(offsets);
}

/** Returns the source-attributed AGE 1000 map graph; invented geometry is marked prototype. */
export function getXenoverse3PrototypeMap(): Xenoverse3Map {
  ensureWasm();
  return wasm_get_xenoverse3_prototype_map() as Xenoverse3Map;
}

/**
 * Parses a DBXV2 BDM (Battle Damage Matrix) binary file and returns damage definitions.
 */
export function parseBdm(bdmBytes: Uint8Array): BdmFile {
  ensureWasm();
  return wasm_parse_bdm(bdmBytes) as BdmFile;
}

/**
 * Parses a DBXV2 BAC (Battle Action Code) binary file and returns moveset frame data and hitboxes.
 */
export function parseBac(bacBytes: Uint8Array): BacFile {
  ensureWasm();
  return wasm_parse_bac(bacBytes) as BacFile;
}

/**
 * Parses a DBXV2 PUP (Power-Up Parameters) binary file and returns transformation stat multipliers.
 */
export function parsePup(pupBytes: Uint8Array): PupFile {
  ensureWasm();
  return wasm_parse_pup(pupBytes) as PupFile;
}

/**
 * Parses a DBXV2 MSG (Message) binary file and returns localized strings.
 */
export function parseMsg(msgBytes: Uint8Array): MsgFile {
  ensureWasm();
  return wasm_parse_msg(msgBytes) as MsgFile;
}
