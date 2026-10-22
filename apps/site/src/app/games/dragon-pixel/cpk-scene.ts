// SPDX-License-Identifier: Apache-2.0
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
  return esk && ean && parts.length ? { esk, ean, bac: find(`${code}_PLAYER.bac`), parts } : null;
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
