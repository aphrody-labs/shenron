// SPDX-License-Identifier: Apache-2.0
/** Pure collection contracts. No transport, database, React or runtime imports. */
export interface WikiListInput {
  limit?: unknown;
  offset?: unknown;
  q?: string;
}
export interface WikiListQuery {
  kind: "list";
  limit: number;
  offset: number;
  q: string;
}
export type WikiCollectionQuery =
  | WikiListQuery
  | { kind: "options" }
  | { kind: "relations"; col: string; id: string; target: string }
  | { kind: "byParent"; col: string; id: string }
  | { kind: "visibility"; q: string }
  | { kind: "sectionsFor"; entityType: string; entityId: number };

export class WikiCollectionQueryError extends Error {
  readonly code = "invalid_wiki_collection_query";
}
function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}
export function normalizeWikiListQuery(input: WikiListInput = {}): WikiListQuery {
  return {
    kind: "list",
    limit: integer(input.limit, 50, 1, 500),
    offset: integer(input.offset, 0, 0, Number.MAX_SAFE_INTEGER - 500),
    q: (input.q ?? "").trim(),
  };
}
function required(params: URLSearchParams, key: string): string {
  const value = params.get(key)?.trim();
  if (!value) throw new WikiCollectionQueryError(`Missing ${key}`);
  return value;
}
export function parseWikiCollectionQuery(params: URLSearchParams): WikiCollectionQuery {
  const kind = params.get("as");
  switch (kind) {
    case null:
    case "":
      return normalizeWikiListQuery({
        limit: params.get("limit"),
        offset: params.get("offset"),
        q: params.get("q") ?? "",
      });
    case "options":
      return { kind };
    case "relations":
      return {
        kind,
        col: required(params, "col"),
        id: required(params, "id"),
        target: required(params, "target"),
      };
    case "byParent":
      return { kind, col: required(params, "col"), id: required(params, "id") };
    case "visibility":
      return { kind, q: (params.get("q") ?? "").trim() };
    case "sectionsFor": {
      const entityType = required(params, "entityType");
      const entityId = Number(required(params, "entityId"));
      if (!Number.isSafeInteger(entityId) || entityId <= 0)
        throw new WikiCollectionQueryError("Invalid entityId");
      return { kind, entityType, entityId };
    }
    default:
      throw new WikiCollectionQueryError("Unknown collection mode");
  }
}
/** Preserve existing HTTP modes while encoding every free-text parameter. */
export function wikiCollectionSearch(query: WikiCollectionQuery): string {
  const params = new URLSearchParams();
  if (query.kind === "list") {
    const normalized = normalizeWikiListQuery(query);
    params.set("limit", String(normalized.limit));
    params.set("offset", String(normalized.offset));
    if (normalized.q) params.set("q", normalized.q);
  } else {
    params.set("as", query.kind);
    for (const [key, value] of Object.entries(query))
      if (key !== "kind") params.set(key, String(value));
  }
  return params.toString();
}
export function planWikiList(
  columns: readonly string[],
  primaryKeys: readonly string[],
  input: WikiListInput = {},
) {
  const query = normalizeWikiListQuery(input);
  const searchColumns = ["name", "title", "slug", "nameJa", "titleJa"].filter((key) =>
    columns.includes(key),
  );
  const keys = primaryKeys.filter((key) => columns.includes(key));
  if (keys.length !== primaryKeys.length || !keys.length)
    throw new WikiCollectionQueryError("Invalid primary key columns");
  return {
    ...query,
    searchColumns,
    orderColumns: [...new Set([searchColumns[0] ?? keys[0], ...keys])],
  };
}
export function planWikiRelation(
  columns: readonly string[],
  col: string,
  id: string,
  target?: string,
) {
  if (!columns.includes(col) || (target !== undefined && !columns.includes(target)) || !id.trim())
    throw new WikiCollectionQueryError("Invalid relation columns or identity");
  return { col, id: id.trim(), target };
}
/** Clamp navigation after result count changes and represent an empty result as 0–0. */
export function wikiPageWindow(total: number, input: WikiListInput) {
  const query = normalizeWikiListQuery(input);
  const count = integer(total, 0, 0, Number.MAX_SAFE_INTEGER);
  const lastOffset = count ? Math.floor((count - 1) / query.limit) * query.limit : 0;
  const offset = Math.min(query.offset, lastOffset);
  return {
    offset,
    page: Math.floor(offset / query.limit),
    pages: Math.max(1, Math.ceil(count / query.limit)),
    start: count ? offset + 1 : 0,
    end: Math.min(offset + query.limit, count),
    hasPrevious: offset > 0,
    hasNext: offset + query.limit < count,
  };
}
