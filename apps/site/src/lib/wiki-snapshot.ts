// SPDX-License-Identifier: Apache-2.0

export class WikiUpdateRequestError extends Error {
  readonly code = "invalid_wiki_update_precondition";
}

/** Shared canonical representation for server and browser optimistic updates. */
export function canonicalWikiSnapshot(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalWikiSnapshot).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .toSorted()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalWikiSnapshot((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new WikiUpdateRequestError("Snapshot contains non-JSON values");
  return encoded;
}

export async function browserWikiSnapshotHash(row: Record<string, unknown>): Promise<string> {
  const data = new TextEncoder().encode(canonicalWikiSnapshot(row));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
