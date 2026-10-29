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
  parts: { emd: string; emb?: string; emm?: string; dyt?: string; esk?: string }[];
};

/** Validates a three-letter-ish character code (`APL`, `GOK`, `HUM`…). */
export function characterCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9]{2,8}$/.test(code) ? code : null;
}

/**
 * Picks the costume `costume` of `code`: its skeleton, the body animation set and every
 * full-detail part with the texture, material and dye files of the same name (matched
 * case-insensitively, as the game's names differ in case). Secondary meshes require
 * their own skeleton; LOD meshes are skipped. Returns null without required body files.
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
        (!lower.endsWith("_scd.emd") || byLower.has(`${lower.slice(0, -4)}.esk`))
      );
    })
    .toSorted()
    .map((emd) => {
      const stem = emd.slice(dir.length, -".emd".length);
      const part: CharacterFiles["parts"][number] = {
        emd,
        emb: find(`${stem}.emb`),
        emm: find(`${stem}.emm`),
        dyt: find(`${stem}.dyt.emb`),
      };
      if (emd.toLowerCase().endsWith("_scd.emd")) part.esk = find(`${stem}.esk`)!;
      return part;
    });
  return esk && ean && parts.length
    ? { esk, ean, bac: find(`${code}_PLAYER.bac`), bdm: find(`${code}_PLAYER.bdm`), parts }
    : null;
}

const MAX_ASSET = 64 * 1024 * 1024;

/** Fetches one CPK entry, refusing anything above 64 MiB. */
export async function fetchBytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  const response = await fetch(url, { signal: combined });
  combined.throwIfAborted();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > MAX_ASSET) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Asset exceeds 64 MiB");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel(combined.reason).catch(() => {});
  };
  combined.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      combined.throwIfAborted();
      const { done, value } = await reader.read();
      combined.throwIfAborted();
      if (done) break;
      if (value.byteLength > MAX_ASSET - size) throw new Error("Asset exceeds 64 MiB");
      chunks.push(value);
      size += value.byteLength;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    combined.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

const CHARACTER_ARCHIVE = "data";
export const MAX_CHARACTER_BYTES = 128 * 1024 * 1024;
export const MAX_CHARACTER_PARTS = 32;
export const CHARACTER_FETCH_CONCURRENCY = 4;

/** Every file of a character's default costume, fetched from `data.cpk`; null when missing. */
export async function fetchCharacter(code: string, signal: AbortSignal) {
  if (characterCode(code) !== code) throw new Error("Invalid character code");
  signal.throwIfAborted();
  const entries: SceneEntry[] = [];
  let offset = 0;
  let total = 0;
  do {
    const query = new URLSearchParams({
      q: `data/chara/${code}/*`,
      limit: "500",
      offset: String(offset),
    });
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
    const response = await fetch(`${sceneUrl(CHARACTER_ARCHIVE, "find")}?${query}`, {
      signal: requestSignal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const index = (await response.json()) as SceneIndex;
    requestSignal.throwIfAborted();
    if (
      !Array.isArray(index.entries) ||
      !Number.isSafeInteger(index.total) ||
      index.total < 0 ||
      index.total > 10_000 ||
      index.offset !== offset ||
      index.entries.length > 500 ||
      (index.entries.length === 0 && offset < index.total)
    )
      throw new Error("Invalid character index");
    entries.push(...index.entries);
    offset += index.entries.length;
    total = index.total;
  } while (offset < total);
  const files = characterFiles(
    code,
    entries.map((entry) => entry.path),
  );
  if (!files) return null;
  if (files.parts.length > MAX_CHARACTER_PARTS) throw new Error("Character exceeds 32 model parts");
  const byPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry]));
  const paths = [
    ...new Set(
      [
        files.esk,
        files.ean,
        files.bac,
        files.bdm,
        ...files.parts.flatMap((part) => [part.emd, part.emb, part.emm, part.dyt, part.esk]),
      ].filter((path): path is string => path !== undefined),
    ),
  ];
  let declared = 0;
  for (const path of paths) {
    const size = byPath.get(path.toLowerCase())?.extract_size;
    if (size === undefined || !Number.isSafeInteger(size) || size < 0 || size > MAX_ASSET)
      throw new Error("Invalid character resource size");
    declared += size;
    if (declared > MAX_CHARACTER_BYTES) throw new Error("Character exceeds 128 MiB");
  }
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const loaded = new Map<string, Uint8Array>();
  let cursor = 0;
  let actual = 0;
  const worker = async () => {
    while (cursor < paths.length) {
      combined.throwIfAborted();
      const path = paths[cursor++]!;
      const bytes = await fetchBytes(sceneUrl(CHARACTER_ARCHIVE, "raw", path), combined);
      actual += bytes.length;
      if (
        actual > MAX_CHARACTER_BYTES ||
        bytes.length !== byPath.get(path.toLowerCase())!.extract_size
      )
        throw new Error("Character resource size differs from index");
      loaded.set(path, bytes);
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(CHARACTER_FETCH_CONCURRENCY, paths.length) }, worker),
    );
    signal.throwIfAborted();
    const get = (path: string | undefined) => (path === undefined ? undefined : loaded.get(path));
    return {
      esk: get(files.esk)!,
      ean: get(files.ean)!,
      bac: get(files.bac),
      bdm: get(files.bdm),
      parts: files.parts.map((part) => {
        const bytes: {
          emd: Uint8Array;
          emb?: Uint8Array;
          emm?: Uint8Array;
          dyt?: Uint8Array;
          esk?: Uint8Array;
        } = {
          emd: get(part.emd)!,
          emb: get(part.emb),
          emm: get(part.emm),
          dyt: get(part.dyt),
        };
        if (part.esk) bytes.esk = get(part.esk)!;
        return bytes;
      }),
    };
  } catch (error) {
    controller.abort();
    throw error;
  }
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
