// SPDX-License-Identifier: Apache-2.0
import {
  initShenronReWeb,
  parseCharacterRoster,
  parseSkillTable,
  SHENRON_RE_WASM_FILENAME,
  type SkillCategory,
} from "@aphrody/shenron-pipeline/re-wasm-web";

export type SceneKind = "model" | "audio" | "dialogue";
export type SceneEntry = { path: string; extract_size: number };
export type SceneIndex = { entries: SceneEntry[]; total: number; offset: number; limit: number };
export const SCENE_EXTENSIONS: Record<SceneKind, string> = {
  model: "emd",
  audio: "awb",
  dialogue: "msg",
};
const ROOT = "/api/public/dbxv2/cpk";

export function sceneUrl(archive?: string, action?: string, path?: string): string {
  if (!archive) return ROOT;
  if (!/^[A-Za-z0-9_]{1,96}$/.test(archive)) throw new Error("Invalid archive");
  const parts = path?.split("/") ?? [];
  if (parts.some((part) => !part || part === "." || part === ".." || /[\\\0]/.test(part)))
    throw new Error("Invalid entry path");
  return `${ROOT}/${archive}/${action}${parts.length ? `/${parts.map(encodeURIComponent).join("/")}` : ""}`;
}

/** Preserve every original line, including duplicates, whitespace and empty strings. */
export function messageLines(entries: readonly { lines: readonly string[] }[]): string[] {
  return entries.flatMap((entry) => entry.lines);
}

export const MESSAGE_PAGE_SIZE = 100;
export function messagePage(
  lines: readonly string[],
  offset: number,
): { key: number; text: string }[] {
  return lines
    .slice(offset, offset + MESSAGE_PAGE_SIZE)
    .map((text, index) => ({ key: offset + index, text }));
}

/** Files of one animated character in a CPK index, resolved from `data/chara/<CODE>/`. */
export type CharacterFiles = {
  esk: string;
  ean: string;
  /** Player action timelines (`<CODE>_PLAYER.bac`), when present. */
  bac?: string;
  /** Player damage table (`<CODE>_PLAYER.bdm`), when present. */
  bdm?: string;
  parts: { emd: string; emb?: string; emm?: string; dyt?: string }[];
};

/** Validates a three-letter-ish character code (`APL`, `GOK`, `HUM`…). */
export function characterCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9]{2,8}$/.test(code) ? code : null;
}

/**
 * Picks the costume `costume` of `code`: its skeleton, the body animation set and every
 * full-detail part with the texture, material and dye files of the same name (matched
 * case-insensitively, as the game's names differ in case). LOD and cloth-simulation
 * meshes are skipped. Returns null when the skeleton, animations or parts are missing.
 */
export function characterFiles(
  code: string,
  paths: readonly string[],
  costume = "000",
): CharacterFiles | null {
  const dir = `data/chara/${code}/`;
  const byLower = new Map(paths.map((path) => [path.toLowerCase(), path]));
  const find = (name: string) => byLower.get(`${dir}${name}`.toLowerCase());
  const esk = find(`${code}_${costume}.esk`);
  const ean = find(`${code}.ean`);
  const prefix = `${dir}${code}_${costume}_`.toLowerCase();
  const parts = paths
    .filter((path) => {
      const lower = path.toLowerCase();
      return (
        lower.startsWith(prefix) &&
        lower.endsWith(".emd") &&
        !/_lod\d+\.emd$/.test(lower) &&
        !lower.endsWith("_scd.emd")
      );
    })
    .toSorted()
    .map((emd) => {
      const stem = emd.slice(dir.length, -".emd".length);
      return {
        emd,
        emb: find(`${stem}.emb`),
        emm: find(`${stem}.emm`),
        dyt: find(`${stem}.dyt.emb`),
      };
    });
  return esk && ean && parts.length
    ? { esk, ean, bac: find(`${code}_PLAYER.bac`), bdm: find(`${code}_PLAYER.bdm`), parts }
    : null;
}

const MAX_ASSET = 64 * 1024 * 1024;

/** Fetches one CPK entry, refusing anything above 64 MiB. */
export async function fetchBytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > MAX_ASSET)
    throw new Error("Asset exceeds 64 MiB");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_ASSET) throw new Error("Asset exceeds 64 MiB");
  return bytes;
}

const CHARACTER_ARCHIVE = "data";

/** Every file of a character's default costume, fetched from `data.cpk`; null when missing. */
export async function fetchCharacter(code: string, signal: AbortSignal) {
  const query = new URLSearchParams({ q: `data/chara/${code}/*`, limit: "500" });
  const response = await fetch(`${sceneUrl(CHARACTER_ARCHIVE, "find")}?${query}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const index = (await response.json()) as SceneIndex;
  if (!Array.isArray(index.entries)) throw new Error("Invalid index");
  const files = characterFiles(
    code,
    index.entries.map((entry) => entry.path),
  );
  if (!files) return null;
  const get = (path: string) => fetchBytes(sceneUrl(CHARACTER_ARCHIVE, "raw", path), signal);
  const optional = (path: string | undefined) => (path ? get(path) : Promise.resolve(undefined));
  const [esk, ean, bac, bdm, parts] = await Promise.all([
    get(files.esk),
    get(files.ean),
    optional(files.bac),
    optional(files.bdm),
    Promise.all(
      files.parts.map(async (part) => {
        const [emd, emb, emm, dyt] = await Promise.all([
          get(part.emd),
          optional(part.emb),
          optional(part.emm),
          optional(part.dyt),
        ]);
        return { emd, emb, emm, dyt };
      }),
    ),
  ]);
  return { esk, ean, bac, bdm, parts };
}

export type RosterEntry = { id: number; shortName: string };

let roster: Promise<RosterEntry[]> | null = null;

/**
 * The game's full character roster (`data/system/char_model_spec.cms`), fetched and parsed
 * once, sorted by short code. Not every entry has playable costume/animation files in the
 * CPK store (NPCs, cut content); `fetchCharacter` returns null for those.
 */
export function fetchRoster(signal: AbortSignal): Promise<RosterEntry[]> {
  roster ??= (async () => {
    const [bytes] = await Promise.all([
      fetchBytes(sceneUrl(CHARACTER_ARCHIVE, "raw", "data/system/char_model_spec.cms"), signal),
      initShenronReWeb(`/wasm/${SHENRON_RE_WASM_FILENAME}`),
    ]);
    const { entries } = parseCharacterRoster(bytes);
    return entries
      .map((entry) => ({ id: entry.id, shortName: entry.short_name }))
      .toSorted((a, b) => a.shortName.localeCompare(b.shortName));
  })().catch((error: unknown) => {
    roster = null;
    throw error;
  });
  return roster;
}

export type SkillEntry = { category: SkillCategory; shortName: string; eanPath: string };

let skillTable: Promise<{ category: SkillCategory; id2: number; entry: SkillEntry }[]> | null =
  null;

/** The game's full skill table (`data/system/custom_skill.cus`), fetched and parsed once. */
function fetchSkillTable(signal: AbortSignal) {
  skillTable ??= (async () => {
    const [bytes] = await Promise.all([
      fetchBytes(sceneUrl(CHARACTER_ARCHIVE, "raw", "data/system/custom_skill.cus"), signal),
      initShenronReWeb(`/wasm/${SHENRON_RE_WASM_FILENAME}`),
    ]);
    const { skills } = parseSkillTable(bytes);
    return skills
      .filter((s): s is typeof s & { ean_path: string } => s.ean_path !== null)
      .map((s) => ({
        category: s.category,
        id2: s.id2,
        entry: { category: s.category, shortName: s.short_name, eanPath: s.ean_path },
      }));
  })().catch((error: unknown) => {
    skillTable = null;
    throw error;
  });
  return skillTable;
}

/**
 * A character's skills in `category`: within each category, a character's ten slots are
 * `id2 ∈ [cmsId * 10, cmsId * 10 + 10)` (verified against the real file: Goku, cms id 0,
 * owns Super skills 0..9 in slot order, Kamehameha first).
 */
export async function fetchCharacterSkills(
  cmsId: number,
  category: SkillCategory,
  signal: AbortSignal,
): Promise<SkillEntry[]> {
  const all = await fetchSkillTable(signal);
  return all
    .filter((s) => s.category === category && s.id2 >= cmsId * 10 && s.id2 < cmsId * 10 + 10)
    .toSorted((a, b) => a.id2 - b.id2)
    .map((s) => s.entry);
}

/** A skill's own `.ean` and `.bac`, from its `eanPath` (e.g. `SPA/004_GOK_GKD/004_GOK_GKD`). */
export async function fetchSkillFiles(eanPath: string, signal: AbortSignal) {
  const [ean, bac] = await Promise.all([
    fetchBytes(sceneUrl(CHARACTER_ARCHIVE, "raw", `data/skill/${eanPath}.ean`), signal),
    fetchBytes(sceneUrl(CHARACTER_ARCHIVE, "raw", `data/skill/${eanPath}.bac`), signal),
  ]);
  return { ean, bac };
}
