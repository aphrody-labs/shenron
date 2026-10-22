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
  wasm_parse_cms,
  wasm_parse_msg,
  wasm_extract_msg_text,
  wasm_parse_emb,
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

export interface MsgTextExtraction {
  file: string;
  count: number;
  strings: string[];
}

export interface EmbEntry {
  name: string;
  offset: number;
  sizeBytes: number;
}

export interface EmbFile {
  entries: EmbEntry[];
}

export type SkillCategory = "super" | "ultimate" | "evasive" | "unk" | "blast" | "awoken";

/** One entry of the skillset table: the skill ids a character/costume equips by default. */
export interface Skillset {
  id: number;
  flags: number;
  values: [number, number, number, number, number, number, number, number, number];
}

/** One skill: its short code, equip constraints, referenced assets and stat ids. */
export interface CusSkill {
  category: SkillCategory;
  /** Four-letter code (e.g. an ability's short name). */
  short_name: string;
  id1: number;
  id2: number;
  /** `CusRaceLock` bitflags; 0 means unlocked for every race. */
  race_lock: number;
  /** Which optional asset paths below are actually present. */
  files_loaded: number;
  ean_path: string | null;
  cam_ean_path: string | null;
  eepk_path: string | null;
  se_path: string | null;
  vox_path: string | null;
  after_bac_path: string | null;
  after_bcm_path: string | null;
  /** PUP (power-up preset) id this skill applies, if any. */
  pup: number;
  cus_aura: number;
  num_transformations: number;
  part_set: number;
  part_set_2: number;
  part_set_3: number;
  chara_swap_id: number;
  chara_swap_id_2: number;
  chara_swap_id_3: number;
  skillset_change_1: number;
  skillset_change_2: number;
  skillset_change_3: number;
}

export interface CusFile {
  skillsets: Skillset[];
  skills: CusSkill[];
}

/** One roster entry: a persistent character id and its short code (e.g. `GOK`, `VGT`). */
export interface CmsEntry {
  id: number;
  short_name: string;
}

/** The game's full character roster (`data/system/char_model_spec.cms`). */
export interface CmsFile {
  entries: CmsEntry[];
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

/** Victim reaction of a BDM variant; unnamed game codes serialize as `{ Other: code }`. */
export type DamageType =
  | "None"
  | "Block"
  | "GuardBreak"
  | "Standard"
  | "Heavy"
  | "Knockback"
  | "Grab"
  | "Electric"
  | "Dazed"
  | "Paralysis"
  | "Freeze"
  | "StaminaBreak"
  | { Other: number };

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
  damage_when_blocked: number;
  position: [number, number, number];
  size: number;
  min_bounds: [number, number, number];
  max_bounds: [number, number, number];
}

/** An animation record (BAC block type 0): which EAN plays and how. */
export interface BacAnimation {
  start_frame: number;
  duration: number;
  /** Source animation set: 5 is the character's own `.ean`. */
  ean_type: number;
  ean_index: number;
  flags: number;
  frame_start: number;
  /** `0xFFFF` plays to the animation's end. */
  frame_end: number;
  loop_start: number;
  time_scale: number;
  blend_in: number;
  blend_out: number;
}

export interface BacBlock {
  kind: number;
  records: number;
}

export interface BacMove {
  move_id: number;
  total_frames: number;
  startup_frames: number;
  recovery_frames: number;
  hitboxes: BacHitbox[];
  animations: BacAnimation[];
  blocks: BacBlock[];
}

export interface BacFile {
  moves: BacMove[];
}

/**
 * One power-up/transformation preset from `powerup_parameter.pup`. Fields named `f_N` keep
 * their byte offset; LazyBone's MIT XV2-Tools reference leaves them unnamed too.
 */
export interface PupEntry {
  id: number;
  cmn_effect_id: number;
  talisman_id_1: number;
  talisman_id_2: number;
  health: number;
  f_20: number;
  ki: number;
  ki_recovery: number;
  stamina: number;
  stamina_recovery: number;
  enemy_stamina_eraser: number;
  stamina_eraser: number;
  f_48: number;
  attack: number;
  ki_blast: number;
  strike: number;
  blast: number;
  attack_damage: number;
  ki_blast_damage: number;
  strike_damage: number;
  blast_damage: number;
  ground_speed: number;
  air_speed: number;
  boosting_speed: number;
  dash_speed: number;
  duration: number;
  f_104: number;
  f_108: number;
  f_112: number;
  f_116: number;
  f_120: number;
  f_124: number;
  f_128: number;
  f_132: number;
  f_136: number;
  f_140: number;
  f_144: number;
  f_148: number;
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

/** Parses the DBXV2 CMS roster file and returns every character entry. */
export function parseCms(cmsBytes: Uint8Array): CmsFile {
  ensureWasm();
  return wasm_parse_cms(cmsBytes) as CmsFile;
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

/** Extract printable UTF-16LE strings from an MSG buffer using dbxv2-compatible scanning. */
export function extractMsgText(fileName: string, msgBytes: Uint8Array): MsgTextExtraction {
  ensureWasm();
  return wasm_extract_msg_text(fileName, msgBytes) as MsgTextExtraction;
}

/** Parse and validate an EMB archive; payload bytes remain in the caller-owned buffer. */
export function parseEmb(embBytes: Uint8Array): EmbFile {
  ensureWasm();
  return wasm_parse_emb(embBytes) as EmbFile;
}
