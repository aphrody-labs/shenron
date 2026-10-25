// SPDX-License-Identifier: Apache-2.0
import { buildSubmitBody } from "./wiki-fields";
import { browserWikiSnapshotHash } from "./wiki-snapshot";

export function toStudioDraft(
  cols: string[],
  row: Record<string, unknown> | null,
): Record<string, string> {
  return Object.fromEntries(cols.map((col) => [col, row?.[col] != null ? String(row[col]) : ""]));
}

export function sameStudioDraft(
  left: Record<string, string>,
  right: Record<string, string>,
  cols: string[],
): boolean {
  return cols.every((col) => (left[col] ?? "") === (right[col] ?? ""));
}

/** Take the immutable submission before hashing or making any asynchronous request. */
export async function prepareStudioSubmission(
  draft: Record<string, string>,
  row: Record<string, unknown> | null,
  cols: string[],
  mode: "create" | "edit",
): Promise<Record<string, unknown>> {
  if (mode === "edit" && !row) throw new Error("Editorial row is not loaded");
  const expected = row ? structuredClone(row) : null;
  const body = buildSubmitBody({ ...draft }, expected, cols, { mode });
  if (mode === "create") return body;
  return { ...body, expected, expectedSha256: await browserWikiSnapshotHash(expected!) };
}
