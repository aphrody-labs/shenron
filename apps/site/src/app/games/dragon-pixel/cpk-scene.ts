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
